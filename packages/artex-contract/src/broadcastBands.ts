/**
 * Broadcast send-reach bands — the metered add-on half of the hybrid broadcast
 * monetization (docs/broadcast-and-audience-plan.md §5, Decision 1). The paid
 * Workspace tier UNLOCKS broadcast with a 1,000 recipients/period allowance; a band
 * is a per-org recurring add-on that RAISES that cap for orgs reaching a larger
 * audience. Storing/importing an audience stays unlimited on every tier — the
 * quota is only on how many recipients an org may actually send to per period.
 *
 * A band raises the org's total send-reach cap; it does not stack on top of the
 * tier allowance. The effective cap is the most generous of {member-tier reach,
 * band reach} — see `resolveOrgBroadcastReach`.
 *
 * Band IDs are stable and never recycled (Stripe Prices key off them). Prices
 * are configuration — this file is the single source of truth. The platform-api
 * mirrors these values in .services/artex-platform-api/broadcastBands.mjs
 * (it cannot import this package); keep the two in sync.
 */
export type ArtexBroadcastBandId = "reach_5k" | "reach_10k" | "reach_25k" | "reach_100k";

export interface ArtexBroadcastBand {
  id: ArtexBroadcastBandId;
  /** Consumer-facing name (brand voice: no "artwork"; plain reach numbers). */
  name: string;
  description: string;
  /** Max unique recipients the org may broadcast to per billing period. */
  reach: number;
  monthlyPriceCents: number;
  /** Annual = 10 x monthly (two months free — the platform-wide annual rule). */
  annualPriceCents: number;
}

// Annual is always 10x monthly (docs/monetization-plan.md §4.1 — two months free).
const annual = (monthlyCents: number): number => monthlyCents * 10;

export const ARTEX_BROADCAST_BANDS: Record<ArtexBroadcastBandId, ArtexBroadcastBand> = {
  // The step between Workspace's included 1,000 and 10,000 (R11 revision,
  // 2026-09-29). Every band sits near $1.80 to $1.90 per thousand.
  reach_5k: {
    id: "reach_5k",
    name: "Reach 5K",
    description: "Send to up to 5,000 followers per month",
    reach: 5_000,
    monthlyPriceCents: 900,
    annualPriceCents: annual(900),
  },
  reach_10k: {
    id: "reach_10k",
    name: "Reach 10K",
    description: "Send to up to 10,000 followers per month",
    reach: 10_000,
    monthlyPriceCents: 1900,
    annualPriceCents: annual(1900),
  },
  reach_25k: {
    id: "reach_25k",
    name: "Reach 25K",
    description: "Send to up to 25,000 followers per month",
    reach: 25_000,
    monthlyPriceCents: 3900,
    annualPriceCents: annual(3900),
  },
  reach_100k: {
    id: "reach_100k",
    name: "Reach 100K",
    description: "Send to up to 100,000 followers per month",
    reach: 100_000,
    monthlyPriceCents: 9900,
    annualPriceCents: annual(9900),
  },
};

/** All band IDs, ordered smallest reach first. */
export const BROADCAST_BAND_IDS: ArtexBroadcastBandId[] = ["reach_5k", "reach_10k", "reach_25k", "reach_100k"];

/** Narrow an arbitrary stored/request value to a known band id. */
export function isBroadcastBandId(value: unknown): value is ArtexBroadcastBandId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ARTEX_BROADCAST_BANDS, value);
}

/**
 * Reach a band grants, or 0 when there is no active band. Unknown ids resolve to
 * 0 (no add-on) rather than throwing — a stale/removed band never silently
 * inflates a cap.
 */
export function broadcastBandReach(bandId: ArtexBroadcastBandId | (string & {}) | null | undefined): number {
  return isBroadcastBandId(bandId) ? ARTEX_BROADCAST_BANDS[bandId].reach : 0;
}

/**
 * The org's effective send-reach cap = the most generous of its member-tier
 * reach and its active band. `-1` (unlimited, e.g. a Complete member) always
 * wins. A band raises the cap; it never lowers a member-tier reach that is
 * already higher.
 *
 * @param memberTierReach the reach resolved from the org's admin/manager tiers
 *   (-1 = unlimited)
 * @param bandId the org's active broadcast band, if any
 */
export function resolveOrgBroadcastReach(
  memberTierReach: number,
  bandId: ArtexBroadcastBandId | (string & {}) | null | undefined,
): number {
  if (memberTierReach === -1) return -1;
  const bandReach = broadcastBandReach(bandId);
  return Math.max(Number.isFinite(memberTierReach) ? memberTierReach : 0, bandReach);
}

/** Price in cents for a band + period. */
export function broadcastBandPriceCents(
  bandId: ArtexBroadcastBandId,
  period: "monthly" | "annual",
): number {
  const band = ARTEX_BROADCAST_BANDS[bandId];
  return period === "annual" ? band.annualPriceCents : band.monthlyPriceCents;
}
