import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VerifyMenuActions } from "@/components/verify-menu-actions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Verify Menu | foodnear.me",
  description: "Review and approve your Menu Protocol menu for agent discovery.",
};

type PageProps = {
  searchParams: Promise<{ restaurantId?: string }>;
};

export default async function VerifyMenuPage({ searchParams }: PageProps) {
  const { restaurantId } = await searchParams;

  if (!restaurantId) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 px-6 py-12">
        <h1 className="text-2xl font-semibold">Verify Menu</h1>
        <p className="text-zinc-600">
          Start from a{" "}
          <Link href="/" className="underline">
            claim page
          </Link>{" "}
          to review your menu before publishing as verified.
        </p>
      </main>
    );
  }

  const supabase = createClient();

  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select("id, name, verification_status, website_url")
    .eq("id", restaurantId)
    .single();

  if (error?.code === "PGRST116" || !restaurant) {
    notFound();
  }

  const { data: pendingMenu } = await supabase
    .from("menus")
    .select("id, status, updated_at")
    .eq("restaurant_id", restaurantId)
    .eq("status", "pending_approval")
    .maybeSingle();

  const { data: publishedMenu } = await supabase
    .from("menus")
    .select("id, status, updated_at, signature_hash")
    .eq("restaurant_id", restaurantId)
    .eq("status", "published")
    .maybeSingle();

  const menu = pendingMenu ?? publishedMenu;

  if (!menu) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 px-6 py-12">
        <h1 className="text-2xl font-semibold">No menu to verify</h1>
        <p className="text-zinc-600">
          Return to{" "}
          <Link href={`/claim/${restaurantId}`} className="underline">
            claim {restaurant.name}
          </Link>{" "}
          to import a menu first.
        </p>
      </main>
    );
  }

  const { data: categories } = await supabase
    .from("menu_categories")
    .select("id, name, sort_order")
    .eq("menu_id", menu.id)
    .order("sort_order", { ascending: true });

  const categoryIds = (categories ?? []).map((c) => c.id);

  type MenuItemRow = {
    id: string;
    category_id: string;
    name: string;
    description: string | null;
    price: number;
    dietary_vegetarian: boolean;
    dietary_vegan: boolean;
    dietary_gluten_free: boolean;
    allergens: string[] | null;
  };

  let items: MenuItemRow[] = [];
  if (categoryIds.length > 0) {
    const { data: menuItems } = await supabase
      .from("menu_items")
      .select(
        "id, category_id, name, description, price, dietary_vegetarian, dietary_vegan, dietary_gluten_free, allergens",
      )
      .in("category_id", categoryIds);
    items = menuItems ?? [];
  }

  const itemsByCategory = new Map<string, MenuItemRow[]>();
  for (const item of items ?? []) {
    const list = itemsByCategory.get(item.category_id) ?? [];
    list.push(item);
    itemsByCategory.set(item.category_id, list);
  }

  const isVerified = restaurant.verification_status === "verified";
  const statusLabel = isVerified
    ? "Verified"
    : menu.status === "pending_approval"
      ? "Pending approval"
      : "Indexed — approve to verify";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{restaurant.name}</h1>
          <p className="text-sm text-zinc-500">
            Review menu data before agents treat it as owner-verified.
          </p>
        </div>
        <span
          className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
            isVerified
              ? "bg-green-50 text-green-800 ring-green-600/20"
              : "bg-yellow-50 text-yellow-800 ring-yellow-600/20"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="border-b border-zinc-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-700">Menu Protocol preview</h2>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-6">
          {(categories ?? []).map((category) => (
            <div key={category.id} className="space-y-3">
              <h3 className="text-lg font-medium border-b border-zinc-100 pb-2">
                {category.name}
              </h3>
              {(itemsByCategory.get(category.id) ?? []).map((item) => (
                <article
                  key={item.id}
                  className="rounded-lg border border-zinc-200 p-4 space-y-2"
                >
                  <div className="flex justify-between gap-4">
                    <p className="font-medium text-zinc-900">{item.name}</p>
                    <p className="text-zinc-700">${Number(item.price).toFixed(2)}</p>
                  </div>
                  {item.description ? (
                    <p className="text-sm text-zinc-600">{item.description}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {item.dietary_vegetarian ? (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-700">
                        Vegetarian
                      </span>
                    ) : null}
                    {item.dietary_vegan ? (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-700">
                        Vegan
                      </span>
                    ) : null}
                    {item.dietary_gluten_free ? (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                        Gluten-free
                      </span>
                    ) : null}
                    {(item.allergens ?? []).length > 0 ? (
                      <span className="text-zinc-500">
                        Allergens: {(item.allergens ?? []).join(", ")}
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ))}
        </div>
      </section>

      {!isVerified ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="rounded-md bg-blue-50 p-4 mb-4">
            <p className="text-sm text-blue-700">
              By approving, you cryptographically sign this payload and upgrade the listing to
              verified. Agents will treat dietary and allergen fields as owner-approved.
            </p>
          </div>
          <VerifyMenuActions
            restaurantId={restaurant.id}
            restaurantName={restaurant.name}
            menuSourceUrl={restaurant.website_url}
          />
        </section>
      ) : (
        <p className="text-sm text-green-700">
          This menu is verified and signed.{" "}
          <Link href={`/api/v1/restaurant/${restaurant.id}/menu.mp`} className="underline">
            View Menu Protocol JSON
          </Link>
        </p>
      )}
    </main>
  );
}
