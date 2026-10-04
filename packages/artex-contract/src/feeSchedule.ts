/**
 * The published ARTEX platform fee schedule — the single source of truth for
 * every "what does ARTEX charge" surface (the public /pricing page and the
 * admin guide render from here; never re-type a rate in a component or a doc).
 *
 * Canonical: docs/pricing-business-model-v2.md (R4, R4b, R5) and
 * docs/monetization-plan.md §4.3. The numbers here are the decided rates; the
 * server-side payout math keeps its own mirrored constants
 * (payoutSplit.mjs `DEFAULT_PLATFORM_FEE_PERCENT`, etc.) because the platform
 * API is a standalone service that cannot import this package — keep the two in
 * sync when a rate changes.
 *
 * Copy here is user-facing (public pricing + guide): no em dashes, no
 * system-internal language, no "users". Load the brand-voice skill before
 * editing the strings.
 */

/**
 * The everyday rail: program subscriptions (Print Club included), open editions,
 * direct sales, commissions, services. One rate, on gross as it is collected.
 *
 * Print Club used to sit outside this at 15% of *profit* (gross minus the org's
 * hard cost). That basis is gone — the fee is now a share of collected cash, and
 * the rate was set to 10 so the change is revenue-neutral rather than the hidden
 * 1.5-1.7x increase that carrying 15 onto a gross basis would have been. See
 * docs/plans/settlement-fee-on-collection-plan.md.
 */
export const PROGRAM_SUBSCRIPTION_FEE_PERCENT = 10;
export const DIRECT_SALE_FEE_PERCENT = 10;
/** Participation payments (event tickets + open call entry fees), plus processing. */
export const PARTICIPATION_FEE_PERCENT = 5;
/** Deals ARTEX sources: brokered installations and sponsored placements. */
export const BROKERED_INSTALLATION_FEE_PERCENT = 15;
export const SPONSORED_PLACEMENT_FEE_PERCENT = 20;

/**
 * Referral credits (P6 — docs/broadcast-and-audience-plan.md §14.1). What a
 * referrer earns when someone they referred pays ARTEX: the same 10 the platform
 * charges on the everyday rail, so there is one ARTEX number rather than a
 * referral rate invented on its own. On an annual plan it works out to exactly
 * one month, which is why the surface says "free months" and not a balance.
 *
 * Credit, never cash, and taken over **ARTEX's own charges only** — never a
 * share of a print, a collect, or a commission, which is money that flows to an
 * artist. Complete is excluded: that is a deal term, not a webhook's decision.
 *
 * Mirrored server-side in `.services/artex-platform-api/referralCredit.mjs`
 * (the platform API cannot import this package) — `referralCredit.test.mjs`
 * reads this file and fails if the two drift.
 */
export const REFERRAL_CREDIT_PERCENT = 10;
/** How long after joining a referee's payments still earn their referrer credit. */
export const REFERRAL_CREDIT_WINDOW_MONTHS = 12;
/** How long a granted referral credit lasts before the expiry sweep lapses it. */
export const REFERRAL_CREDIT_EXPIRY_MONTHS = 12;

/**
 * Floor on the artist's share for sales-type programs (print editions, open
 * editions): the platform guarantees artists never receive less than half of what
 * remains after the platform fee. Fixed per program, never per artist. See R6.
 *
 * Deliberately stated against the post-fee remainder rather than "profit". An
 * artist can check this one: the price is public and the fee is published, so the
 * arithmetic is theirs to do. "Half the profit" depended on a hard cost only the
 * org could see, and it paid zero whenever printing outran revenue.
 */
export const SALES_ARTIST_PAYOUT_FLOOR_PERCENT = 50;

/** The sentence the public schedule opens with. */
export const PLATFORM_FEE_SOVEREIGNTY_SENTENCE =
  "Organizations set their own prices and artist splits. ARTEX charges a fee only when money moves through the platform.";

/** Published alongside the schedule: CODAME's own programs are not privileged. */
export const PLATFORM_FEE_NEUTRALITY_RULE =
  "CODAME Inc's own programs pay the same published rates as any other organization.";

/** The artist-share guarantee, stated for public copy. */
export const ARTIST_PAYOUT_FLOOR_GUARANTEE =
  "On sales, artists receive at least half of everything collected after the platform fee, and can check the math themselves.";

export interface PlatformFeeItem {
  /** What the fee applies to, in plain language. */
  label: string;
  /** The rate as it reads publicly (e.g. "10% of gross", "5% plus processing"). */
  rate: string;
  /** Optional clarifier shown under the item. */
  note?: string;
}

export interface PlatformFeeGroup {
  id: "rail" | "participation" | "brokered";
  /** Short group heading. */
  title: string;
  /** One-line description of who pays and why the rate sits where it does. */
  summary: string;
  items: readonly PlatformFeeItem[];
}

/**
 * The three published fee groups (R5). Ordered lowest-touch first is tempting,
 * but the decided order leads with the everyday rail, then the lower
 * participation rate, then the higher brokered rate where ARTEX sources the deal.
 */
export const PLATFORM_FEE_SCHEDULE: readonly PlatformFeeGroup[] = [
  {
    id: "rail",
    title: "The 10% rail",
    summary: "The everyday rate when work or a subscription changes hands on the platform.",
    items: [
      {
        label: "Program subscriptions, including Print Club",
        rate: "10% of gross",
        note: "Charged on payments as they are collected. Payment processing comes out of the organization's share.",
      },
      { label: "Open editions, direct sales, commissions, and services", rate: "10% of gross" },
    ],
  },
  {
    id: "participation",
    title: "Participation payments",
    summary: "The lowest rate, because the people paying are attendees and artists.",
    items: [
      { label: "Event tickets", rate: "5% plus processing" },
      { label: "Open call entry fees", rate: "5% plus processing" },
    ],
  },
  {
    id: "brokered",
    title: "Brokered by ARTEX",
    summary: "Higher only where ARTEX sources the deal.",
    items: [
      { label: "Brokered installations", rate: "15% of the contract" },
      { label: "Sponsored placements", rate: "20% of the first year" },
    ],
  },
];
