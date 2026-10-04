/**
 * Collector entitlement — resolves whether an identity may access the FULL
 * (non-preview) asset and full interactive playback of a work.
 *
 * This is the tier + per-edition-ownership + org-membership resolver from
 * Capability 2 of docs/program-capabilities-spec.md (all three axes, decided
 * 2026-07-04). It is deliberately distinct from the grant-based
 * `checkEntitlement` in `@artex/core`
 * (packages/artex-core/src/platform/entitlement.ts), which answers a different
 * question (per-representation `ProductOffering` grants). This one answers the
 * single "full vs. preview" question the `collection` tier is priced on.
 *
 * PURE and dependency-light on purpose: the platform API server is standalone
 * `.mjs` and cannot import this package, so the same logic is mirrored in
 * `.services/artex-platform-api/entitlement.mjs`. Keep the two (and their tests)
 * in sync — this file has `entitlement.test.ts`, the server has
 * `entitlement.test.mjs`.
 */
import { normalizeTierId, tierAllows, type ArtexTierId } from "./tiers";

/** Which axis granted access (or `none`). Precedence: ownership → org → tier. */
export type FullAssetEntitlementReason = "ownership" | "org-member" | "tier" | "none";

/**
 * Org roles that count as "member of the owning org" for entitlement (patrons,
 * funders, staff). `viewer` is intentionally excluded — it is a read-only
 * listing role with no access rights (see `OrgMemberRole` in `@artex/core`).
 * Mirror this set in the server resolver.
 */
export const ENTITLED_ORG_ROLES: ReadonlySet<string> = new Set(["admin", "manager", "member"]);

export interface FullAssetEntitlementInput {
  /** Stored subscription tier (raw; may be a legacy alias or null). */
  // `string & {}` keeps ArtexTierId autocomplete while still accepting any raw
  // stored string (legacy aliases). A plain `ArtexTierId | string` collapses to
  // `string` and trips @typescript-eslint/no-redundant-type-constituents.
  subscriptionTier?: ArtexTierId | (string & {}) | null;
  /** Subscription status; only `"active"` grants tier access (resolve-time). */
  subscriptionStatus?: string | null;
  /** Whether the identity owns an edition of THIS work. The caller resolves it. */
  ownsEdition?: boolean | null;
  /** The identity's role in the owning org, or null/absent when not a member. */
  orgRole?: string | null;
}

export interface FullAssetEntitlement {
  entitled: boolean;
  reason: FullAssetEntitlementReason;
}

/**
 * Does an active subscription tier grant collector (full-asset) access?
 *
 * Resolve-time by design (Capability 2 decision): a lapsed/canceled/past-due
 * subscription does NOT grant access. Entitlement is recomputed from live
 * subscription state on each call; refunds/chargebacks revoke via the shipped
 * clawback, so there is no separate grace timer here.
 */
export function hasActiveCollectorTier(
  subscriptionTier: ArtexTierId | (string & {}) | null | undefined,
  subscriptionStatus: string | null | undefined,
): boolean {
  if (subscriptionStatus !== "active") return false;
  // normalizeTierId collapses legacy aliases (`venue` → `stage`) and unknown
  // values (→ `free`) to a known id; tierAllows then reads the canonical
  // collectorAccess flag (true for `collection` + `enterprise` today).
  return tierAllows(normalizeTierId(subscriptionTier), "collectorAccess");
}

/** Is this org role one that grants access to the owning org's full assets? */
export function isEntitledOrgRole(orgRole: string | null | undefined): boolean {
  return orgRole != null && ENTITLED_ORG_ROLES.has(orgRole);
}

/**
 * Resolve full-asset / full-playback entitlement from the three axes.
 *
 * `entitled` is the OR of the axes. `reason` names the first axis that granted
 * access, in precedence ownership → org-member → tier: ownership is permanent
 * and the most specific to the work, so it is reported first when several apply
 * (a report of `"ownership"` survives a later subscription lapse, `"tier"` does
 * not).
 */
export function resolveFullAssetEntitlement(
  input: FullAssetEntitlementInput,
): FullAssetEntitlement {
  if (input.ownsEdition === true) {
    return { entitled: true, reason: "ownership" };
  }
  if (isEntitledOrgRole(input.orgRole)) {
    return { entitled: true, reason: "org-member" };
  }
  if (hasActiveCollectorTier(input.subscriptionTier, input.subscriptionStatus)) {
    return { entitled: true, reason: "tier" };
  }
  return { entitled: false, reason: "none" };
}
