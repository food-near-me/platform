"use client";

import { FormEvent, useState } from "react";

type FormState = "idle" | "submitting" | "success" | "error";

export function LeadForm() {
  const [status, setStatus] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      restaurantName: String(formData.get("restaurantName") ?? ""),
      city: String(formData.get("city") ?? ""),
      email: String(formData.get("email") ?? ""),
      companyWebsite: String(formData.get("companyWebsite") ?? ""),
    };

    setStatus("submitting");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Unable to submit lead");
      }

      setStatus("success");
      form.reset();
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Submission failed",
      );
    }
  };

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
        Restaurant name
        <input
          required
          name="restaurantName"
          placeholder="Joe's Pizza"
        />
      </label>
      <label>
        City
        <input required name="city" placeholder="Austin, TX" />
      </label>
      <label className="span-2">
        Work email
        <input
          required
          type="email"
          name="email"
          placeholder="owner@restaurant.com"
        />
      </label>
      <div className="form-foot">
        <button type="submit" className="btn" disabled={status === "submitting"}>
          {status === "submitting" ? "Submitting…" : "Request audit"}
        </button>
        <p className="form-note">No spam. We use this to schedule your ADO audit.</p>
      </div>
      {status === "success" ? (
        <p className="alert ok" role="status">
          Request captured. We will follow up with your ADO audit details.
        </p>
      ) : null}
      {status === "error" ? (
        <p className="alert err" role="alert">
          {errorMessage ?? "Something went wrong. Please try again."}
        </p>
      ) : null}
    </form>
  );
}
