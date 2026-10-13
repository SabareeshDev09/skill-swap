export interface AdminIdentity {
  email?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
}

function parseConfiguredEmails(configuredEmails: string): string[] {
  return configuredEmails
    .split(/[\n,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isBootstrapAdmin(
  identity: Pick<AdminIdentity, 'email' | 'email_confirmed_at'>,
  configuredEmails: string
): boolean {
  if (!identity.email || !identity.email_confirmed_at) return false;

  const allowedEmails = parseConfiguredEmails(configuredEmails);
  return allowedEmails.includes(identity.email.trim().toLowerCase());
}

export function isAdminIdentity(
  identity: AdminIdentity,
  profileIsAdmin: boolean,
  configuredEmails: string
): boolean {
  return identity.app_metadata?.role === 'admin' ||
    profileIsAdmin ||
    isBootstrapAdmin(identity, configuredEmails);
}
