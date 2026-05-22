"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type VerifyMenuActionsProps = {
  restaurantId: string;
  restaurantName: string;
  menuSourceUrl?: string | null;
};

export function VerifyMenuActions({
  restaurantId,
  restaurantName,
  menuSourceUrl,
}: VerifyMenuActionsProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onApprove = async () => {
    if (!email.trim() || !agreed) return;

    setStatus("submitting");
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/v1/restaurant/${restaurantId}/verify/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), agreeToTerms: true }),
      });

      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; alreadyVerified?: boolean }
        | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Approval failed");
      }

      setStatus("success");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Approval failed");
    }
  };

  if (status === "success") {
    return (
      <div className="rounded-md bg-green-50 p-4 text-sm text-green-800">
        <p className="font-medium">{restaurantName} is now verified on foodnear.me.</p>
        <p className="mt-2">
          Agents will see owner-verified trust notices and your signed Menu Protocol menu.
        </p>
        <Link href={`/claim/${restaurantId}`} className="mt-3 inline-block underline">
          View claim page
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 border-t border-zinc-200 pt-4">
      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Signer email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          placeholder="you@restaurant.com"
          required
        />
      </label>

      <label className="flex items-start gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-1 rounded border-zinc-300"
        />
        <span>
          I confirm that menu items, prices, allergens, and dietary tags are accurate to the best
          of my knowledge and I am authorized to publish this menu for {restaurantName}.
        </span>
      </label>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={onApprove}
          disabled={status === "submitting" || !email.trim() || !agreed}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {status === "submitting" ? "Signing…" : "Sign & Approve Menu"}
        </button>
      </div>

      {menuSourceUrl ? (
        <p className="text-xs text-zinc-500">
          Source:{" "}
          <a href={menuSourceUrl} rel="noopener noreferrer" className="underline">
            {menuSourceUrl}
          </a>
        </p>
      ) : null}

      {status === "error" && errorMessage ? (
        <p className="text-sm text-red-600" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
