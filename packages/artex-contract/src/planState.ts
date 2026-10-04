/**
 * Plan state — the one resolver every "what am I on, and what happens next"
 * surface reads.
 *
 * Three things expire independently and a member can be inside all of them at
 * once: the TIER (the R2 pre-launch grace, which lands on Free), the PRICE (an
 * early adopter rate, held for two years from that member's own subscription
 * date), and the SUBSCRIPTION itself (billing). A single tier id cannot express
 * that, so `resolvePlanState` returns the whole picture and every surface reads
 * it instead of recomputing precedence for itself. Recomputation is how a plan
 * page and a badge come to disagree.
 *
 * Deliberately NOT called a license: `license` is artwork rights granted to a
 * venue, which has its own expiry and its own display. This is what the member
 * pays for. It is also distinct from `entitlement.ts`, which answers the
 * separate full-asset-vs-preview question.
 *
 * PURE and dependency-light, like its neighbours: the platform API is standalone
 * `.mjs` and cannot import this package, so anything it needs is mirrored there.
 *
 * See docs/collection-tier-definition.md and docs/pricing-business-model-v2.md.
 */
import {
  earlyAdopterHoldUntil,
  normalizeTierId,
  resolveEffectiveTierId,
  standardTierRate,
  type ArtexTierId,
  type ArtexTierRate,
  type CanonicalArtexTierId,
} from "./tiers";

/**
 * The rate a member was held at, snapshotted onto their own record when the
 * subscription was created.
 *
 * A snapshot rather than a lookup into `EARLY_ADOPTER_RATES` on purpose: a held
 * rate is a promise about a specific number, so editing the published table must
 * never move a price somebody was already given. `tierId` is carried so the hold
 * cannot leak across an upgrade — a member who moves to a different tier is
 * billed that tier's standard rate, not the rate they held on the old one.
 */
export interface HeldPrice {
  tierId: CanonicalArtexTierId;
  monthlyPriceCents: number;
  annualPriceCents: number;
  /** Epoch ms at which the hold ends. */
  until: number;
}

/**
 * Billing health, kept separate from `nextChange` because the two must never be
 * displayed alike: a held rate ending is neutral and expected, a declined card
 * is urgent. Rendering them identically trains members to ignore the urgent one.
 *
 * `canceling` is an active subscription already set to end at period close —
 * still entitled today, gone on `renewsOn`.
 */
export type PlanBillingState = "active" | "past_due" | "canceling" | "none";

/** What changes, if the member does nothing. */
export type PlanChangeKind =
  | "grace-ends"
  | "held-price-ends"
  | "subscription-ends"
  /**
   * A complimentary plan an org's invitation granted is running out. Distinct
   * from `grace-ends`, which is the R2 pre-launch grandfather: that one nobody
   * asked for and nobody can renew, while this one was a gift from a named org
   * and the member may well want to keep the tier by subscribing.
   */
  | "comp-ends";

export interface PlanChange {
  /** Epoch ms the change lands. */
  at: number;
  what: PlanChangeKind;
  /**
   * Plain identifiers for the copy layer: tier ids for a tier change, and for
   * `held-price-ends` the held monthly amount in cents, as a string.
   *
   * `to` is null for `held-price-ends` BY DECISION, not by omission: the
   * standard price at expiry is the tier's public list price at the moment the
   * rate expires (owner decision, 2026-10-03, #3107), so there is no number to
   * carry ahead of time. It is resolved when the rate ends, by the migration job
   * (`heldRateExpiry.mjs`), and a figure frozen here could be wrong by then.
   */
  from: string | null;
  to: string | null;
}

export interface PlanState {
  /** The tier the member pays for (Free when they pay for nothing). */
  tierId: CanonicalArtexTierId;
  /** The tier they actually get right now, grace included. */
  effectiveTierId: CanonicalArtexTierId;
  /** The rate they are billed at today: the held rate when one applies. */
  currentRate: ArtexTierRate;
  /** The standard published rate for `tierId`, whether or not a hold applies. */
  standardRate: ArtexTierRate;
  /** The active hold, or null when they are on the standard rate. */
  priceHeld: HeldPrice | null;
  /** Epoch ms the R2 pre-launch grace ends, when one is still running. */
  graceUntil: number | null;
  billing: PlanBillingState;
  /** Epoch ms of the next renewal, when known. Routine billing, not a change. */
  renewsOn: number | null;
  /**
   * The next thing that changes if the member does nothing, or null when
   * nothing does. Every surface answers that question from this field alone.
   * Routine renewals are deliberately NOT changes — they are `renewsOn`.
   */
  nextChange: PlanChange | null;
}

export interface PlanStateInput {
  // `string & {}` keeps ArtexTierId autocomplete while accepting any raw stored
  // string; a plain `ArtexTierId | string` collapses to `string` and trips
  // @typescript-eslint/no-redundant-type-constituents.
  subscriptionTier?: ArtexTierId | (string & {}) | null;
  subscriptionStatus?: string | null;
  /** R2 pre-launch grace boundary (epoch ms). */
  grandfatheredUntil?: number | null;
  /**
   * End of a complimentary plan (epoch ms), from `subscriptionCompedUntil`.
   *
   * A comp writes a REAL `subscriptionTier`, unlike the grandfather which only
   * shadows one. So a comped member looks like any paying member here, and
   * without this the plan surface would tell them nothing at all about the date
   * their tier goes away. That silence is the unpleasant-surprise failure the
   * grant's visibility rule exists to prevent.
   */
  compedUntil?: number | null;
  /** The held-rate snapshot from the member's own record. */
  heldPrice?: HeldPrice | null;
  /** Epoch ms of the next renewal, from the billing provider. */
  renewsOn?: number | null;
  /** Subscription is set to end at period close rather than renew. */
  cancelAtPeriodEnd?: boolean | null;
}

const isFiniteMs = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Normalize a stored subscription status plus the cancel flag into one state. */
export function resolvePlanBillingState(
  subscriptionStatus: string | null | undefined,
  cancelAtPeriodEnd: boolean | null | undefined,
): PlanBillingState {
  if (subscriptionStatus === "past_due") return "past_due";
  if (subscriptionStatus === "active") return cancelAtPeriodEnd === true ? "canceling" : "active";
  return "none";
}

/**
 * Does a stored hold still apply?
 *
 * Both conditions matter. It must not have expired, and it must be for the tier
 * the member is actually on — R2's precedence rule, carried onto price: a real
 * paid subscription at the standard price always wins, so someone who upgrades
 * is never silently returned to the rate they held on their old tier.
 */
export function isHeldPriceActive(
  heldPrice: HeldPrice | null | undefined,
  tierId: CanonicalArtexTierId,
  nowMs: number,
): boolean {
  if (!heldPrice) return false;
  if (normalizeTierId(heldPrice.tierId) !== tierId) return false;
  if (!isFiniteMs(heldPrice.until) || nowMs >= heldPrice.until) return false;
  return isFiniteMs(heldPrice.monthlyPriceCents) && isFiniteMs(heldPrice.annualPriceCents);
}

/**
 * Pick the earliest future change. Ties break toward the more consequential
 * one — losing a tier outranks a price moving — so a member who somehow has two
 * things landing on the same day is told about the one that costs them access.
 */
const KIND_PRIORITY: Record<PlanChangeKind, number> = {
  "subscription-ends": 0,
  // Losing a granted tier costs the same access as losing a paid one, so it
  // ranks with the tier losses rather than below them.
  "comp-ends": 1,
  "grace-ends": 2,
  "held-price-ends": 3,
};

function earliestChange(candidates: PlanChange[]): PlanChange | null {
  let best: PlanChange | null = null;
  for (const candidate of candidates) {
    if (best === null) {
      best = candidate;
      continue;
    }
    if (candidate.at < best.at) best = candidate;
    else if (candidate.at === best.at && KIND_PRIORITY[candidate.what] < KIND_PRIORITY[best.what]) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Resolve the member's whole plan picture at `nowMs`.
 *
 * Tier precedence is delegated to `resolveEffectiveTierId` rather than
 * reimplemented, so there is still exactly one place that decides what a grace
 * grants. This function adds the two axes that a tier id cannot carry: the price
 * they are held at, and what changes next.
 */
export function resolvePlanState(input: PlanStateInput, nowMs: number): PlanState {
  const paidTierId = normalizeTierId(input.subscriptionTier);
  const effectiveTierId = resolveEffectiveTierId(
    { subscriptionTier: input.subscriptionTier, grandfatheredUntil: input.grandfatheredUntil },
    nowMs,
  );
  const billing = resolvePlanBillingState(input.subscriptionStatus, input.cancelAtPeriodEnd);

  const heldApplies = isHeldPriceActive(input.heldPrice, paidTierId, nowMs);
  const priceHeld = heldApplies ? (input.heldPrice as HeldPrice) : null;

  const standardRate = standardTierRate(paidTierId);
  const currentRate: ArtexTierRate = priceHeld
    ? { monthlyPriceCents: priceHeld.monthlyPriceCents, annualPriceCents: priceHeld.annualPriceCents }
    : standardRate;

  // The grace only has anything left to say while it is still running AND still
  // doing something — a member on a paid tier is already past it.
  const graceUntil =
    isFiniteMs(input.grandfatheredUntil)
    && nowMs < input.grandfatheredUntil
    && paidTierId === "free"
      ? input.grandfatheredUntil
      : null;

  const renewsOn = isFiniteMs(input.renewsOn) ? input.renewsOn : null;

  // A comp still ahead of us. No `paidTierId === "free"` guard, unlike the
  // grace above: a comp writes a real tier, so requiring "free" would hide
  // every comp there is.
  const compUntil =
    isFiniteMs(input.compedUntil) && nowMs < input.compedUntil ? input.compedUntil : null;

  const candidates: PlanChange[] = [];
  if (compUntil !== null) {
    candidates.push({ at: compUntil, what: "comp-ends", from: effectiveTierId, to: "free" });
  }
  if (graceUntil !== null) {
    candidates.push({ at: graceUntil, what: "grace-ends", from: effectiveTierId, to: "free" });
  }
  if (priceHeld !== null) {
    candidates.push({
      at: priceHeld.until,
      what: "held-price-ends",
      from: String(priceHeld.monthlyPriceCents),
      // Resolved at expiry, not carried ahead. See PlanChange.
      to: null,
    });
  }
  if (billing === "canceling" && renewsOn !== null) {
    candidates.push({ at: renewsOn, what: "subscription-ends", from: paidTierId, to: "free" });
  }

  return {
    tierId: paidTierId,
    effectiveTierId,
    currentRate,
    standardRate,
    priceHeld,
    graceUntil,
    billing,
    // A subscription ending is a change, not a renewal, so it is not also
    // reported here — the two would otherwise describe the same date twice.
    renewsOn: billing === "canceling" ? null : renewsOn,
    nextChange: earliestChange(candidates),
  };
}

/**
 * Does this plan need the member to DO something (as opposed to merely knowing
 * a date)? Only a failed payment does. Surfaces use this to keep the urgent case
 * visually distinct from the expected one.
 */
export function planNeedsAttention(state: PlanState): boolean {
  return state.billing === "past_due";
}

/**
 * The held-price snapshot to write when a subscription is created at an early
 * adopter rate, or null when the tier has no such rate. Callers persist the
 * result verbatim; the hold runs from `subscribedAtMs`, that member's own date.
 */
export function buildHeldPrice(
  tierId: ArtexTierId,
  rate: ArtexTierRate | null,
  subscribedAtMs: number,
): HeldPrice | null {
  if (!rate) return null;
  // normalizeTierId already collapses anything unrecognized to `free`, so there
  // is no unknown-tier case left to guard against here.
  const canonical = normalizeTierId(tierId);
  return {
    tierId: canonical,
    monthlyPriceCents: rate.monthlyPriceCents,
    annualPriceCents: rate.annualPriceCents,
    until: earlyAdopterHoldUntil(subscribedAtMs),
  };
}
