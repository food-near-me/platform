/**
 * x402 prepaid credits configuration (Phase A: guard + 402 responses only).
 * Settlement and SIWX verification arrive in Phase B.
 */

export type X402Config = {
  enabled: boolean;
  freeQuotaPerDay: number;
  quotaWindowMs: number;
  network: string;
  usdcAddress: string;
  minTopUpUsd: number;
  minBalanceUsd: number;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parsePositiveFloat(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadX402Config(env: NodeJS.ProcessEnv = process.env): X402Config {
  return {
    enabled: env.FNM_X402_ENABLED === "1",
    freeQuotaPerDay: parsePositiveInt(env.FNM_X402_FREE_QUOTA_PER_DAY, 100),
    quotaWindowMs: parsePositiveInt(env.FNM_X402_QUOTA_WINDOW_MS, 86_400_000),
    network: env.FNM_X402_NETWORK?.trim() || "eip155:8453",
    usdcAddress:
      env.FNM_X402_USDC_ADDRESS?.trim() ||
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    minTopUpUsd: parsePositiveFloat(env.FNM_X402_MIN_TOPUP_USD, 5),
    minBalanceUsd: parsePositiveFloat(env.FNM_X402_MIN_BALANCE_USD, 0.1),
  };
}
