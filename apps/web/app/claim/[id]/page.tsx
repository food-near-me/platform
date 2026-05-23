import Link from "next/link";
import { notFound } from "next/navigation";
import { ClaimSelfServeForm } from "@/components/claim-self-serve-form";
import { LeadForm } from "@/components/lead-form";
import { SiteShell } from "@/components/site-shell";
import { buildProfileTrustNotice, hasMenuAccess } from "@/lib/discovery/verification-status";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ClaimListingPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createClient();

  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select(
      "id, name, slug, address, cuisine_type, verification_status, source, website_url, phone, health_inspection_grade",
    )
    .eq("id", id)
    .single();

  if (error?.code === "PGRST116" || !restaurant) {
    notFound();
  }

  const isVerified = restaurant.verification_status === "verified";
  const isIndexed = restaurant.verification_status === "menu_indexed";
  const menuTier = hasMenuAccess(restaurant.verification_status);
  const { data: publishedMenu } = menuTier
    ? await supabase
        .from("menus")
        .select("id, signature_hash")
        .eq("restaurant_id", id)
        .eq("status", "published")
        .maybeSingle()
    : { data: null };
  const menuAvailable = menuTier && Boolean(publishedMenu);
  const agentTrustNotice = buildProfileTrustNotice(
    restaurant.verification_status,
    menuAvailable,
  );
  let publishedItemCount = 0;
  if (publishedMenu?.id) {
    const { data: categories } = await supabase
      .from("menu_categories")
      .select("id")
      .eq("menu_id", publishedMenu.id);
    const categoryIds = (categories ?? []).map((category) => category.id);
    if (categoryIds.length > 0) {
      const { count } = await supabase
        .from("menu_items")
        .select("id", { count: "exact", head: true })
        .in("category_id", categoryIds);
      publishedItemCount = count ?? 0;
    }
  }
  const sourceLabel =
    restaurant.source === "osm"
      ? "OpenStreetMap"
      : restaurant.source === "nyc_open_data"
        ? "NYC Open Data"
        : restaurant.source ?? "public records";

  return (
    <SiteShell>
      <section className="section">
        <div className="section-head">
          <p className="label">Claim listing</p>
          <h1>
            {restaurant.name}
          </h1>
          <p className="lede">
            {isVerified
              ? "This restaurant already has a verified Menu Protocol listing on foodnear.me."
              : isIndexed
                ? "This listing has an indexed menu from public/automated sources. Claim it to publish an owner-verified Menu Protocol menu agents can cite authoritatively."
                : "Publish an owner-approved, AI-readable menu so agents can recommend your restaurant with accurate dishes, prices, and dietary information."}
          </p>
        </div>

        <div className="section-body full">
          <section className="agent-preview" aria-labelledby="agent-preview-title">
            <div className="agent-preview-copy">
              <p className="label">What agents see today</p>
              <h2 id="agent-preview-title">Your listing is already machine-readable.</h2>
              <p>
                Foodnear.me exposes this record through MCP and REST APIs. Verification changes
                whether agents can treat your menu, dietary details, and allergen fields as
                owner-approved.
              </p>
            </div>

            <div className="agent-terminal" aria-label="Agent data preview">
              <div className="terminal-row">
                <span>verification_status</span>
                <strong>{restaurant.verification_status}</strong>
              </div>
              <div className="terminal-row">
                <span>menu_available</span>
                <strong>{menuAvailable ? "true" : "false"}</strong>
              </div>
              <div className="terminal-row">
                <span>published_items</span>
                <strong>{publishedItemCount}</strong>
              </div>
              <div className="terminal-row">
                <span>trust_notice</span>
                <strong>{agentTrustNotice}</strong>
              </div>
            </div>

            <div className="agent-impact-grid">
              <div>
                <h3>Agents can say now</h3>
                <p>
                  {menuAvailable
                    ? `Agents can show ${publishedItemCount} indexed menu item${
                        publishedItemCount === 1 ? "" : "s"
                      }, but must label them as ${
                        isVerified ? "owner-verified" : "not owner-verified"
                      }.`
                    : "Agents can show your restaurant name, address, cuisine, and claim link. They should not invent menu items or prices."}
                </p>
              </div>
              <div>
                <h3>Agents should not say yet</h3>
                <p>
                  {isVerified
                    ? "This listing is verified. Keep the menu current so agents continue citing it confidently."
                    : "They should not treat dietary, allergen, price, or availability details as authoritative until an owner approves the Menu Protocol record."}
                </p>
              </div>
              <div>
                <h3>What verification changes</h3>
                <p>
                  Your menu becomes owner-approved, signed, and eligible for authoritative
                  dietary/allergen answers instead of a caveated or place-only result.
                </p>
              </div>
            </div>
          </section>

          <div className="claim-card">
            {restaurant.address ? (
              <p>
                <strong>Address:</strong> {restaurant.address}
              </p>
            ) : null}
            {restaurant.cuisine_type?.length ? (
              <p>
                <strong>Cuisine:</strong> {restaurant.cuisine_type.join(", ")}
              </p>
            ) : null}
            {!isVerified ? (
              <p className="form-note">
                {isIndexed
                  ? "Menu data is indexed from automated/public sources — not owner-verified until you approve it."
                  : `Basic info sourced from ${sourceLabel}. Menu data is not verified until you approve it.`}
              </p>
            ) : null}
            {restaurant.health_inspection_grade ? (
              <p>
                <strong>NYC grade:</strong> {restaurant.health_inspection_grade}
              </p>
            ) : null}
            {restaurant.website_url ? (
              <p>
                <strong>Website:</strong>{" "}
                <a href={restaurant.website_url} rel="noopener noreferrer">
                  {restaurant.website_url}
                </a>
              </p>
            ) : null}

            {isVerified ? (
              <p>
                <Link href="/pricing" className="btn">
                  View plans
                </Link>
              </p>
            ) : (
              <>
                <ClaimSelfServeForm
                  restaurantId={restaurant.id}
                  restaurantName={restaurant.name}
                  defaultMenuUrl={restaurant.website_url}
                  isIndexed={isIndexed}
                />
                <details className="claim-concierge">
                  <summary>Prefer concierge setup?</summary>
                  <LeadForm
                    source={`claim:concierge:${restaurant.id.slice(0, 36)}`}
                    submitLabel="Request concierge help"
                    note="We will verify ownership and help you publish a Menu Protocol menu."
                    successMessage="Request received. We will email you within 48 hours."
                    defaultRestaurantName={restaurant.name}
                    defaultCity="Brooklyn, NY"
                    lockRestaurantName
                  />
                </details>
              </>
            )}
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
