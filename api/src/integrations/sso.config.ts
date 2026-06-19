/**
 * Entra ID (Azure AD) OIDC SSO configuration (Phase 8, interface-level).
 *
 * This build does not wire a live IdP (none is available to test against). The
 * design is a pluggable strategy: a `passport-azure-ad` BearerStrategy validates
 * Entra-issued JWTs via the tenant JWKS, and IdP group claims map to DrillIQ
 * roles + client_id below. Local JWT auth remains for service calls. To enable,
 * set AZURE_AD_TENANT_ID / AZURE_AD_CLIENT_ID / AZURE_AD_AUDIENCE and register
 * the strategy in AuthModule.
 */
export interface SsoConfig {
  provider: 'entra-oidc';
  configured: boolean;
  tenantId: string | null;
  audience: string | null;
  /** IdP group (display name) → DrillIQ role. */
  groupRoleMap: Record<string, string>;
}

export function getSsoConfig(): SsoConfig {
  const tenantId = process.env.AZURE_AD_TENANT_ID ?? null;
  const audience = process.env.AZURE_AD_AUDIENCE ?? null;
  return {
    provider: 'entra-oidc',
    configured: Boolean(tenantId && audience),
    tenantId,
    audience,
    groupRoleMap: {
      'DrillIQ-Management': 'MANAGEMENT',
      'DrillIQ-Office': 'OFFICE_ENGINEER',
      'DrillIQ-Operation': 'OPERATION_ENGINEER',
      'DrillIQ-Contractor': 'CONTRACTOR',
    },
  };
}

/** Map an ordered list of IdP groups to a DrillIQ role (first match wins). */
export function mapGroupsToRole(groups: string[], cfg = getSsoConfig()): string | null {
  for (const g of groups) if (cfg.groupRoleMap[g]) return cfg.groupRoleMap[g];
  return null;
}
