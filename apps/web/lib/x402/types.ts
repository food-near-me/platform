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
    top_up_endpoint: string;
    min_top_up_usd: number;
    min_balance_usd: number;
    usdc_address: string;
  }>;
  auth_options: {
    api_key: {
      header: string;
      docs: string;
    };
    x402_wallet: {
      header: string;
      top_up_endpoint: string;
      docs: string;
    };
  };
};
