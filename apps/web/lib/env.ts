const REQUIRED_LEADS_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

type RequiredLeadsEnv = (typeof REQUIRED_LEADS_ENV)[number];

export function getMissingLeadsEnvVars(): RequiredLeadsEnv[] {
  return REQUIRED_LEADS_ENV.filter((key) => !process.env[key]) as RequiredLeadsEnv[];
}

export function hasResendLeadConfig() {
  return Boolean(
    process.env.RESEND_API_KEY &&
      process.env.LEADS_NOTIFICATION_TO &&
      process.env.LEADS_FROM_EMAIL,
  );
}

