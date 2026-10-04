/**
 * ARTEX Product Tiers — the platform SaaS subscription model.
 *
 * Tier IDs are stable and never recycled (Stripe Prices + existing user records
 * key off them). `venue` is a DEPRECATED ALIAS of `stage` — renamed for a
 * clearer consumer name (see docs/monetization-plan.md §3.1). It stays a valid
 * id so existing records deserialize and resolves to the same features; use
 * `normalizeTierId()` to collapse it to the canonical `stage`. Do not offer
 * `venue` for new checkouts.
 *
 * Tier definitions, pricing, and feature flags are configuration — this file is
 * the single source of truth. Do not re-hardcode a tier table anywhere else.
 * See docs/platform-tier-billing-plan.md (Track A6) + docs/monetization-plan.md §3.
 */
export type ArtexTierId = "free" | "studio" | "stage" | "collection" | "enterprise" | "venue";

/** Tiers a new subscription can target — excludes the deprecated `venue` alias. */
export type CanonicalArtexTierId = Exclude<ArtexTierId, "venue">;

export interface ArtexTierDefinition {
  id: ArtexTierId;
  name: string;
  description: string;
  monthlyPriceMinCents: number;
  annualPriceMinCents: number;
  payWhatYouWant: boolean;
  features: ArtexTierFeatures;
}

export interface ArtexTierFeatures {
  maxPublishedPackages: number; // -1 = unlimited
  maxInstallations: number; // -1 = unlimited
  attributionRequired: boolean;
  supportLevel: "community" | "email" | "dedicated";
  hardwareBundle: boolean;
  curatedNetwork: boolean;
  artistPayout: boolean;
  venueManagement: boolean;
  apiAccess: boolean;
  // Added with the A6 tier reconcile (docs/monetization-plan.md §3.2). Populated
  // for every tier; enforcement points are wired in later A6 phases.
  collectorAccess: boolean; // full-asset downloads + print edition access
  aiGenerationQuota: number; // AI calls / month; -1 = unlimited
  storageQuotaBytes: number; // per-user (artist) or per-org (stage); -1 = unlimited
  orgSeats: number; // max org members; -1 = unlimited
  printEditionAccess: boolean; // monthly Print Club edition download
  // Max unique recipients an account may broadcast to per billing period; -1 =
  // unlimited. R11 revision (Bruno, 2026-09-29): free 100, studio 250,
  // Workspace 1,000 (was 2,500), collection unchanged, enterprise unlimited.
  // Start low, raise by hand: a reach band (orgs) or a manual override with an
  // expiry lifts it (docs/pricing-business-model-v2.md R11).
  broadcastSendReach: number;
  // May the org map its own hostname (printclub.codame.org, prints.studio-x.io)
  // onto its page? The Workspace gate for the custom-domain capability (see
  // docs/custom-domain-platform-feature.md §7a). Enforced server-side at the
  // create endpoint; platform admins can still register one on an org's behalf.
  customDomains: boolean;
  // May this tier sign into the Studio Desktop app (2026-09-16, Bruno)? The
  // web Studio and the create wizard stay free for everyone; this gates only
  // the standalone/Electron build, which is sold as part of paid Studio.
  // While STUDIO_DESKTOP_OPEN_TO_ARTISTS is on (2026-10-04, Bruno: the app is
  // experimental) every Artist may sign in whatever this says; read it through
  // `tierAllowsForRole`. This stays the plan-level answer for when the flag is
  // flipped off and for a Visitor.
  // Enforced server-side at /desktop-auth/approve (server.mjs) — that is the
  // real gate, since the installer itself is a public GitHub release asset
  // and cannot be access-controlled at the download link.
  studioDesktopAccess: boolean;
}

/** Bytes in one gibibyte — keeps storage quotas readable. */
const GIB = 1024 ** 3;

// Shared between the canonical `stage` tier and its deprecated `venue` alias so
// the two can never drift apart.
const STAGE_FEATURES: ArtexTierFeatures = {
  maxPublishedPackages: 50,
  maxInstallations: 5,
  attributionRequired: false,
  supportLevel: "email",
  hardwareBundle: false,
  curatedNetwork: false,
  artistPayout: false,
  venueManagement: true,
  apiAccess: false,
  collectorAccess: false,
  aiGenerationQuota: 500,
  storageQuotaBytes: 20 * GIB,
  orgSeats: 10,
  printEditionAccess: false,
  broadcastSendReach: 1000,
  customDomains: true,
  studioDesktopAccess: true,
};

const STAGE_NAME = "ARTEX Workspace";
const STAGE_DESCRIPTION = "For organizations running events, programs, and installations";

export const ARTEX_TIERS: Record<ArtexTierId, ArtexTierDefinition> = {
  free: {
    id: "free",
    name: "ARTEX Free",
    description: "Explore the ARTEX creator tools",
    monthlyPriceMinCents: 0,
    annualPriceMinCents: 0,
    payWhatYouWant: false,
    features: {
      maxPublishedPackages: 1,
      maxInstallations: 0,
      attributionRequired: true,
      supportLevel: "community",
      hardwareBundle: false,
      curatedNetwork: false,
      artistPayout: false,
      venueManagement: false,
      apiAccess: false,
      collectorAccess: false,
      aiGenerationQuota: 0,
      storageQuotaBytes: 1 * GIB,
      orgSeats: 0,
      printEditionAccess: false,
      broadcastSendReach: 100,
      customDomains: false,
      studioDesktopAccess: false,
    },
  },
  studio: {
    id: "studio",
    name: "ARTEX Studio",
    description: "Self-serve creator license for individual artists",
    monthlyPriceMinCents: 1200,
    annualPriceMinCents: 12000,
    payWhatYouWant: false,
    features: {
      maxPublishedPackages: 25,
      maxInstallations: 1,
      attributionRequired: true,
      supportLevel: "community",
      hardwareBundle: false,
      curatedNetwork: false,
      artistPayout: false,
      venueManagement: false,
      apiAccess: false,
      collectorAccess: false,
      aiGenerationQuota: 200,
      storageQuotaBytes: 5 * GIB,
      orgSeats: 0,
      printEditionAccess: false,
      broadcastSendReach: 250,
      customDomains: false,
      studioDesktopAccess: true,
    },
  },
  stage: {
    id: "stage",
    name: STAGE_NAME,
    description: STAGE_DESCRIPTION,
    monthlyPriceMinCents: 2900,
    annualPriceMinCents: 29000,
    payWhatYouWant: false,
    features: STAGE_FEATURES,
  },
  collection: {
    id: "collection",
    name: "ARTEX Collection",
    description: "For collectors: full-resolution access, a collection profile, and one personal Display for your own works",
    monthlyPriceMinCents: 900,
    annualPriceMinCents: 9000,
    payWhatYouWant: false,
    features: {
      maxPublishedPackages: 1,
      // One personal Display (R13): plays only works the holder owns or has
      // bought, for personal use, never attached to an organization. Not an
      // org allowance: `tierBilling.mjs` keeps Collection at 0 for org claims.
      maxInstallations: 1,
      attributionRequired: true,
      supportLevel: "community",
      hardwareBundle: false,
      curatedNetwork: false,
      artistPayout: false,
      venueManagement: false,
      apiAccess: false,
      collectorAccess: true,
      aiGenerationQuota: 0,
      storageQuotaBytes: 1 * GIB,
      orgSeats: 0,
      printEditionAccess: true,
      broadcastSendReach: 100,
      customDomains: false,
      studioDesktopAccess: false,
    },
  },
  enterprise: {
    id: "enterprise",
    name: "ARTEX Complete",
    description: "Full-service installation with hardware and curation",
    monthlyPriceMinCents: 0,
    annualPriceMinCents: 1600000,
    payWhatYouWant: false,
    features: {
      maxPublishedPackages: -1,
      maxInstallations: -1,
      attributionRequired: false,
      supportLevel: "dedicated",
      hardwareBundle: true,
      curatedNetwork: true,
      artistPayout: true,
      venueManagement: true,
      apiAccess: true,
      collectorAccess: true,
      aiGenerationQuota: -1,
      storageQuotaBytes: -1,
      orgSeats: -1,
      printEditionAccess: true,
      broadcastSendReach: -1,
      customDomains: true,
      studioDesktopAccess: true,
    },
  },
  // DEPRECATED ALIAS — `venue` was renamed to `stage`. Kept so existing user
  // records with tier "venue" still resolve; features are shared with `stage`
  // via STAGE_FEATURES. normalizeTierId("venue") === "stage".
  venue: {
    id: "venue",
    name: STAGE_NAME,
    description: STAGE_DESCRIPTION,
    monthlyPriceMinCents: 2900,
    annualPriceMinCents: 29000,
    payWhatYouWant: false,
    features: STAGE_FEATURES,
  },
};

/**
 * Collapse a (possibly legacy or unknown) tier id to its canonical form.
 * `venue` → `stage`; any unrecognized value → `free`.
 */
export function normalizeTierId(tierId: ArtexTierId | string | null | undefined): CanonicalArtexTierId {
  switch (tierId) {
    case "venue":
    case "stage":
      return "stage";
    case "studio":
    case "collection":
    case "enterprise":
    case "free":
      return tierId;
    default:
      return "free";
  }
}

/**
 * Resolve the tier a user is actually entitled to, accounting for the
 * pre-launch grandfather grace (docs/pricing-business-model-v2.md R2).
 *
 * Policy: pre-launch users get one year of Studio for free, then land on the
 * standard Free tier — there is no permanent entitlement. So a user with no
 * active paid subscription is treated as `studio` while `nowMs` is before
 * `grandfatheredUntil`, and as `free` once it passes. A user who has bought a
 * real paid tier keeps it (the billing webhook clears `subscriptionTier` to
 * `free` on cancellation, so any non-`free` value here is an active paid tier
 * and always wins over the grace grant).
 *
 * Mirror any change to this precedence in the server (currently soft, unenforced
 * — see docs/platform-tier-billing-plan.md §6).
 */
export function resolveEffectiveTierId(
  input: {
    // `string & {}` keeps ArtexTierId autocomplete while accepting any raw
    // stored string; a plain `ArtexTierId | string` collapses to `string` and
    // trips @typescript-eslint/no-redundant-type-constituents.
    subscriptionTier?: ArtexTierId | (string & {}) | null;
    grandfatheredUntil?: number | null;
  },
  nowMs: number,
): CanonicalArtexTierId {
  const paidTier = normalizeTierId(input.subscriptionTier);
  if (paidTier !== "free") return paidTier;
  const until = input.grandfatheredUntil;
  if (typeof until === "number" && Number.isFinite(until) && nowMs < until) {
    return "studio";
  }
  return "free";
}

export function tierAllows(tierId: ArtexTierId, feature: keyof ArtexTierFeatures): boolean {
  // Declared possibly-undefined: callers pass raw stored strings, so an unknown
  // id must read as "not allowed" rather than throw.
  const tier: ArtexTierDefinition | undefined = ARTEX_TIERS[tierId];
  if (!tier) return false;
  const value = tier.features[feature];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return value !== "community";
}

/** Numeric capacity features that `tierLimit` can read. */
export type ArtexTierLimitFeature =
  | "maxPublishedPackages"
  | "maxInstallations"
  | "aiGenerationQuota"
  | "storageQuotaBytes"
  | "orgSeats"
  | "broadcastSendReach";

export function tierLimit(tierId: ArtexTierId, feature: ArtexTierLimitFeature): number {
  const tier: ArtexTierDefinition | undefined = ARTEX_TIERS[tierId];
  if (!tier) return 0;
  return tier.features[feature];
}

// ---------------------------------------------------------------------------
// The Artist floor — a role is a floor and a plan only adds to it.
// ---------------------------------------------------------------------------

/**
 * Whether signing into Studio Desktop is open to every Artist while the app is
 * labelled experimental (owner decision, Bruno, 2026-10-04, amending the
 * 2026-09-16 paid gate; AGENTS.md §2.4). THE ONE FLAG: flip it to `false` when
 * the feature stops being experimental and the gate returns to
 * `studioDesktopAccess` on the plan, with no other edit. Mirrored in
 * `.services/artex-platform-api/tierBilling.mjs` (drift-tested).
 */
// `as boolean` widens the literal so the flag's off branch stays reachable to the
// type checker, and so lint does not call the gate below dead code.
export const STUDIO_DESKTOP_OPEN_TO_ARTISTS = true as boolean;

/**
 * What every Artist has before any plan is counted (docs/pricing-business-model-v2.md
 * R13). The ARTEX growth loop is artists sharing their pages, and a one-work,
 * zero-AI Free tier does not start it, so a Free Artist gets a real practice.
 * Articles are not a number here: they are gated by role alone, with no plan.
 *
 * Mirrored in `.services/artex-platform-api/tierBilling.mjs` (drift-tested).
 */
export const ARTIST_FLOOR = {
  maxPublishedPackages: 5,
  aiGenerationQuota: 20,
  studioDesktopAccess: STUDIO_DESKTOP_OPEN_TO_ARTISTS,
} as const;

/**
 * Roles that publish, and so carry the floor: `artist`, and `admin` (who passes
 * every creator check). A Visitor (`viewer`) is browse-only and has no floor,
 * so a Visitor holding Collection has exactly Collection's own allowance.
 */
export function roleHasArtistFloor(role: string | null | undefined): boolean {
  return role === "artist" || role === "admin";
}

/**
 * The allowance a holder of `role` on `tierId` actually has for a numeric
 * capacity: for an Artist, `max(floor, plan)` per dimension (`-1` unlimited
 * beats any number). Plans only add. An Artist who also holds Collection can
 * never have less than a free Artist.
 */
export function tierLimitForRole(
  tierId: ArtexTierId,
  feature: ArtexTierLimitFeature,
  role: string | null | undefined,
): number {
  const plan = tierLimit(tierId, feature);
  if (!roleHasArtistFloor(role)) return plan;
  if (feature !== "maxPublishedPackages" && feature !== "aiGenerationQuota") return plan;
  if (plan === -1) return -1;
  return Math.max(ARTIST_FLOOR[feature], plan);
}

/**
 * Boolean counterpart of {@link tierLimitForRole}. Only `studioDesktopAccess`
 * has a floor; every other feature reads the plan alone.
 */
export function tierAllowsForRole(
  tierId: ArtexTierId,
  feature: keyof ArtexTierFeatures,
  role: string | null | undefined,
): boolean {
  if (feature === "studioDesktopAccess" && roleHasArtistFloor(role) && ARTIST_FLOOR.studioDesktopAccess) {
    return true;
  }
  return tierAllows(tierId, feature);
}

// ---------------------------------------------------------------------------
// Early adopter rates — a held price, not a held tier.
// ---------------------------------------------------------------------------

/**
 * A tier's price pair in integer USD cents. Same two numbers as
 * {@link ArtexTierDefinition}, lifted out so a held rate and a standard rate are
 * the same shape and can be compared or swapped without a second concept.
 */
export interface ArtexTierRate {
  monthlyPriceCents: number;
  annualPriceCents: number;
}

/**
 * How long an early adopter rate is held, in whole years, counted from each
 * member's OWN subscription date rather than from a shared calendar date — so
 * someone who joins in month nine still gets the full term.
 *
 * Two years is long enough to be a real commitment and short enough to have a
 * defined end, which is what keeps a two-price population from becoming
 * permanent. See docs/collection-tier-definition.md.
 */
export const EARLY_ADOPTER_HOLD_YEARS = 2;

/**
 * Published early adopter rates, by tier. A tier absent from this table has no
 * early adopter rate today and simply bills at its standard price — that is the
 * deliberate state of `studio` and `stage`, whose rates are not set. The
 * mechanism is not Collection-only; adding a tier here is the whole change.
 *
 * Annual is `10 × monthly` at the held rate exactly as it is at the standard
 * rate (R1, "two months free"); `tiers.test.ts` pins that.
 *
 * NOTE: this table is what a NEW subscription reads to decide the rate it is
 * held at. It is not what an existing member is billed — that is the snapshot on
 * their own record (see `resolvePlanState`), so editing a number here never
 * moves a rate somebody was already promised.
 */
export const EARLY_ADOPTER_RATES: Partial<Record<CanonicalArtexTierId, ArtexTierRate>> = {
  // Collection's $7/mo · $70/yr early adopter rate closed on 2026-09-28 (owner
  // decision, Bruno): new Collection subscriptions pay the standard $9/mo ·
  // $90/yr. Members already holding the rate keep it for their two years,
  // because what they are billed is the snapshot on their own record, not this
  // table. See docs/collection-tier-definition.md.
};

/** The standard (non-held) rate for a tier, read from the tier table. */
export function standardTierRate(tierId: ArtexTierId): ArtexTierRate {
  const tier = ARTEX_TIERS[normalizeTierId(tierId)];
  return {
    monthlyPriceCents: tier.monthlyPriceMinCents,
    annualPriceCents: tier.annualPriceMinCents,
  };
}

/** The early adopter rate for a tier, or null when the tier has none. */
export function earlyAdopterRate(tierId: ArtexTierId): ArtexTierRate | null {
  return EARLY_ADOPTER_RATES[normalizeTierId(tierId)] ?? null;
}

/**
 * When an early adopter rate taken out at `subscribedAtMs` stops being held.
 *
 * Uses calendar years (`setUTCFullYear`) rather than a fixed millisecond span so
 * the anniversary lands on the same date, leap years included.
 */
export function earlyAdopterHoldUntil(subscribedAtMs: number): number {
  const end = new Date(subscribedAtMs);
  end.setUTCFullYear(end.getUTCFullYear() + EARLY_ADOPTER_HOLD_YEARS);
  return end.getTime();
}

/**
 * Is a subscription starting now eligible for `tierId`'s early adopter rate?
 *
 * The cohort boundary is a single predicate on purpose: whether the offer closes
 * at a member count, a date, or an org count is an OPEN decision
 * (docs/collection-tier-definition.md), and it must be changeable without
 * touching subscription code. Today the only condition is that the tier has a
 * published early adopter rate at all.
 */
export function isEarlyAdopterEligible(tierId: ArtexTierId): boolean {
  return earlyAdopterRate(tierId) !== null;
}

