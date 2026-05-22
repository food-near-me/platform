import Link from "next/link";
import { notFound } from "next/navigation";
import { LeadForm } from "@/components/lead-form";
import { SiteShell } from "@/components/site-shell";
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
              <LeadForm
                source={`claim:${restaurant.id.slice(0, 36)}`}
                submitLabel="Request to claim this listing"
                note="We will verify ownership and help you publish a Menu Protocol menu."
                successMessage="Claim request received. We will email you within 48 hours."
                defaultRestaurantName={restaurant.name}
                defaultCity="Brooklyn, NY"
                lockRestaurantName
              />
            )}
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
