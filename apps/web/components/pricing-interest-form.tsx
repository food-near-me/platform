"use client";

import { useState } from "react";
import { LeadForm } from "./lead-form";

const PLAN_OPTIONS = [
  {
    id: "community",
    label: "Community",
    help: "One free verified location.",
  },
  {
    id: "pro",
    label: "Pro early access",
    help: "$49/mo during launch.",
  },
  {
    id: "multi-location",
    label: "Multi-location",
    help: "Two to five locations.",
  },
  {
    id: "enterprise-api",
    label: "Enterprise / API",
    help: "POS, bulk data, white-label.",
  },
] as const;

export function PricingInterestForm() {
  const [selectedPlan, setSelectedPlan] =
    useState<(typeof PLAN_OPTIONS)[number]["id"]>("pro");

  const activePlan = PLAN_OPTIONS.find((plan) => plan.id === selectedPlan)!;

  return (
    <div className="pricing-intake-grid">
      <div className="plan-selector" aria-label="Select a pricing plan">
        {PLAN_OPTIONS.map((plan) => (
          <button
            key={plan.id}
            type="button"
            className={plan.id === selectedPlan ? "active" : ""}
            aria-pressed={plan.id === selectedPlan}
            onClick={() => setSelectedPlan(plan.id)}
          >
            <span>{plan.label}</span>
            <small>{plan.help}</small>
          </button>
        ))}
      </div>

      <LeadForm
        source={`pricing:${selectedPlan}`}
        submitLabel={
          selectedPlan === "community" ? "Claim free listing" : "Request plan access"
        }
        note={`Selected: ${activePlan.label}. We will follow up with the right onboarding path.`}
        successMessage="Plan interest captured. We will follow up with onboarding details."
      />
    </div>
  );
}
