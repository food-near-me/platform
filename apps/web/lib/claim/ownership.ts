const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

function normalizeHostname(value: string): string | null {
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return null;
  }
}

function approximateRegistrableDomain(hostname: string): string {
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join(".");
}

export function emailDomain(email: string): string | null {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain || !domain.includes(".")) return null;
  return domain.replace(/^www\./, "");
}

export function websiteDomain(url: string | null | undefined): string | null {
  const host = url ? normalizeHostname(url) : null;
  if (!host) return null;
  return approximateRegistrableDomain(host);
}

export function isPublicEmailDomain(domain: string | null): boolean {
  return Boolean(domain && PUBLIC_EMAIL_DOMAINS.has(domain));
}

export function isTrustedOwnerEmail(email: string, websiteUrl: string | null | undefined): boolean {
  const fromEmail = emailDomain(email);
  const fromWebsite = websiteDomain(websiteUrl);

  if (!fromEmail || !fromWebsite || isPublicEmailDomain(fromEmail)) {
    return false;
  }

  return fromEmail === fromWebsite || fromEmail.endsWith(`.${fromWebsite}`);
}
