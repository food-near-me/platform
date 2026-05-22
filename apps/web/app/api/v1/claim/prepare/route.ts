import { NextResponse } from "next/server";
import { probeWebsiteForMenu } from "@/lib/menu-ingest/probe-website-menu";
import {
  insertPendingMenu,
} from "@/lib/menu-ingest/insert-indexed-menu";
import { checkMinInterval, checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type ClaimPreparePayload = {
  restaurantId: string;
  email: string;
  menuUrl?: string;
  companyWebsite?: string;
};

const SCRIPTED_UA_PATTERN =
  /(curl|wget|python-requests|scrapy|postmanruntime|insomnia|go-http-client|libwww-perl)/i;

function normalizeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  if (SCRIPTED_UA_PATTERN.test(request.headers.get("user-agent") ?? "")) {
    return NextResponse.json({ ok: true });
  }

  try {
    const body = (await request.json()) as Partial<ClaimPreparePayload>;

    if (body.companyWebsite?.trim()) {
      return NextResponse.json({ ok: true });
    }

    const restaurantId = body.restaurantId?.trim();
    const email = body.email?.trim().toLowerCase() ?? "";

    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
    }
    if (!validateEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const forwardedFor = request.headers.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";

    const intervalCheck = checkMinInterval({
      key: `claim:ip:interval:${ip}`,
      minIntervalMs: 10_000,
    });
    if (!intervalCheck.allowed) {
      return NextResponse.json({ error: "Too many requests, please wait" }, { status: 429 });
    }

    const ipRateLimit = checkRateLimit({
      key: `claim:ip:window:${ip}`,
      limit: 8,
      windowMs: 10 * 60 * 1000,
    });
    if (!ipRateLimit.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const supabase = getSupabaseAdminClient();

    const { data: restaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select("id, name, verification_status, website_url")
      .eq("id", restaurantId)
      .single();

    if (restaurantError || !restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    if (restaurant.verification_status === "verified") {
      return NextResponse.json(
        { error: "This listing is already verified" },
        { status: 409 },
      );
    }

    const { data: pendingMenu } = await supabase
      .from("menus")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("status", "pending_approval")
      .maybeSingle();

    const { data: publishedMenu } = await supabase
      .from("menus")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("status", "published")
      .maybeSingle();

    let itemCount = 0;
    let source: "existing_indexed" | "json_ld" | "pending" = "pending";

    if (pendingMenu?.id) {
      source = "pending";
      const { data: categories } = await supabase
        .from("menu_categories")
        .select("id")
        .eq("menu_id", pendingMenu.id);
      const categoryIds = (categories ?? []).map((c) => c.id);
      if (categoryIds.length > 0) {
        const { count } = await supabase
          .from("menu_items")
          .select("id", { count: "exact", head: true })
          .in("category_id", categoryIds);
        itemCount = count ?? 0;
      }
    } else if (
      restaurant.verification_status === "menu_indexed" &&
      publishedMenu?.id
    ) {
      source = "existing_indexed";
      const { data: categories } = await supabase
        .from("menu_categories")
        .select("id")
        .eq("menu_id", publishedMenu.id);
      const categoryIds = (categories ?? []).map((c) => c.id);
      if (categoryIds.length > 0) {
        const { count } = await supabase
          .from("menu_items")
          .select("id", { count: "exact", head: true })
          .in("category_id", categoryIds);
        itemCount = count ?? 0;
      }
    } else {
      const menuUrl =
        normalizeUrl(body.menuUrl ?? "") ??
        normalizeUrl(restaurant.website_url ?? "");

      if (!menuUrl) {
        return NextResponse.json(
          {
            error:
              "Menu URL required — provide a public menu page with schema.org JSON-LD, or set website_url on the listing.",
          },
          { status: 422 },
        );
      }

      const probe = await probeWebsiteForMenu(menuUrl);

      if (!probe.parsed) {
        return NextResponse.json(
          {
            error:
              "No menu items found in JSON-LD (tried homepage and /menu paths). Try a direct menu URL or contact support for manual import.",
          },
          { status: 422 },
        );
      }

      const result = await insertPendingMenu(supabase, restaurantId, probe.parsed.categories);
      itemCount = result.itemCount;
      source = "json_ld";
    }

    await supabase.from("audit_leads").insert({
      restaurant_name: restaurant.name,
      city: "claim-self-serve",
      email,
      source: `claim:prepare:${restaurantId.slice(0, 36)}`,
    });

    const verifyUrl = `/dashboard/menu/verify?restaurantId=${restaurantId}`;

    return NextResponse.json({
      ok: true,
      verifyUrl,
      itemCount,
      source,
    });
  } catch (error) {
    console.error("Claim prepare error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected error preparing claim",
      },
      { status: 500 },
    );
  }
}
