export type X402Endpoint = "search" | "restaurant" | "menu";

export type PaymentRequiredBody = {
  error: "payment_required";
  message: string;
  endpoint: X402Endpoint;
  free_quota_per_day: number;
  payment_options: Array<{
    chain: string;
    asset: string;
    network: string;
    /**
     * Top-up route. Optional because x402 Phase B (settlement) is not yet
     * shipped — emitted only when `FNM_X402_TOPUP_ENDPOINT` is configured.
     */
    top_up_endpoint?: string;
    min_top_up_usd: number;
    min_balance_usd: number;
    usdc_address: string;
    status: "phase_a_guard_only" | "phase_b_settlement";
  }>;
  auth_options: {
    api_key: {
      header: string;
      docs: string;
    };
    x402_wallet: {
      header: string;
      /** See note on payment_options[].top_up_endpoint. */
      top_up_endpoint?: string;
      docs: string;
      status: "phase_a_guard_only" | "phase_b_settlement";
    };
  };
};
