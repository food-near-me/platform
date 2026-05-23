"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type FormState = "idle" | "submitting" | "success" | "error";

type ClaimSelfServeFormProps = {
  restaurantId: string;
  restaurantName: string;
  defaultMenuUrl?: string | null;
  isIndexed: boolean;
};

export function ClaimSelfServeForm({
  restaurantId,
  restaurantName,
  defaultMenuUrl,
  isIndexed,
}: ClaimSelfServeFormProps) {
  const [status, setStatus] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);
  const [manualReview, setManualReview] = useState(false);
  const [websiteDomain, setWebsiteDomain] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
      restaurantId,
      email: String(formData.get("email") ?? ""),
      menuUrl: String(formData.get("menuUrl") ?? "") || undefined,
      companyWebsite: String(formData.get("companyWebsite") ?? ""),
    };

    setStatus("submitting");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/v1/claim/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => null)) as
        | {
            verifyUrl?: string;
            error?: string;
            itemCount?: number;
            manualReview?: boolean;
            websiteDomain?: string | null;
          }
        | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to prepare verification");
      }

      if (data?.manualReview) {
        setManualReview(true);
        setWebsiteDomain(data.websiteDomain ?? null);
        setStatus("success");
        return;
      }

      if (data?.verifyUrl) {
        setVerifyUrl(data.verifyUrl);
      }
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Submission failed");
    }
  };

  if (status === "success" && manualReview) {
    return (
      <div className="claim-success">
        <p>
          Claim request received for <strong>{restaurantName}</strong>.
        </p>
        <p>
          We could not instantly verify ownership from that email domain. Use an address at{" "}
          <strong>{websiteDomain ?? "the restaurant website domain"}</strong> for instant review,
          or we will follow up manually.
        </p>
      </div>
    );
  }

  if (status === "success" && verifyUrl) {
    return (
      <div className="claim-success">
        <p>
          Menu ready for review at <strong>{restaurantName}</strong>.
          {isIndexed
            ? " Review the indexed menu and approve to upgrade to verified."
            : " Review extracted items and approve to publish as verified."}
        </p>
        <p>
          <Link href={verifyUrl} className="btn">
            Review &amp; approve menu
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="lead-form">
      <input
        type="text"
        name="companyWebsite"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />

      <label>
        Owner email
        <input type="email" name="email" required placeholder="owner@restaurant.com" />
        <span className="form-note">
          Instant verification requires an email on the restaurant website domain. Gmail and
          personal inboxes go to manual review.
        </span>
      </label>

      {!isIndexed ? (
        <label>
          Menu page URL
          <input
            type="url"
            name="menuUrl"
            defaultValue={defaultMenuUrl ?? ""}
            placeholder="https://yourrestaurant.com/menu"
          />
          <span className="form-note">
            We parse public JSON-LD (schema.org Menu/MenuItem) from this page. Defaults to your
            website URL when set.
          </span>
        </label>
      ) : (
        <p className="form-note">
          Your indexed menu is already loaded. Enter your email to review and approve it as
          owner-verified.
        </p>
      )}

      <button type="submit" disabled={status === "submitting"} className="btn">
        {status === "submitting" ? "Preparing…" : "Continue to menu review"}
      </button>

      {status === "error" && errorMessage ? (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <p className="form-note">
        If your email matches the restaurant website domain, you review prices and dietary tags,
        then sign the Menu Protocol payload. Other requests are held for manual ownership review.
      </p>
    </form>
  );
}
