/**
 * The Collection fee waiver — ARTEX declining its own platform fee on purchases
 * made by members.
 *
 * THE LOAD-BEARING PRINCIPLE, which survives any implementation compromise:
 *
 *   The waiver never reduces artist or org revenue. The only reduction is to
 *   ARTEX's own fee. Because the artist's and org's published percentages are
 *   applied AFTER that fee, waiving it enlarges the base they are taken from, so
 *   a member sale settles HIGHER for artist and org than the same sale to a
 *   non-member, never lower.
 *
 * On a $100 sale at a 90% artist share: a non-member purchase sends $10 to ARTEX
 * and $90 onward; a member purchase sends $0 to ARTEX and $100 onward. If a
 * change makes an org's or an artist's settlement smaller because the buyer was
 * a member, it is wrong.
 *
 * This is NOT a discount on art. The buyer pays the same price; ARTEX absorbs
 * its own cut out of the subscription revenue the member already pays. A
 * discount funded by the artist or the org is explicitly out of scope and always
 * will be — it would reduce artist revenue, train collectors to wait for
 * markdowns, and make the published-split promise conditional.
 *
 * Recorded at SETTLEMENT rather than as a Checkout discount (decided 2026-08-30):
 * the buyer is charged the full price, and the org's view of the transaction
 * stays identical to a non-member sale.
 *
 * Uncapped by decision. Do not add a cap, a threshold, or a soft limit: a cap
 * tells the platform's best collectors that their benefit stops exactly where
 * their commitment gets serious. The exposure is accepted and is instead made
 * OBSERVABLE — every split reports what it waived.
 *
 * PURE and dependency-light: mirrored in
 * `.services/artex-platform-api/feeWaiver.mjs`. Keep the two in sync.
 *
 * See docs/collection-tier-definition.md.
 */

/**
 * Which published rail a transaction sits on. Named rather than inferred from a
 * rate, because two rails can share a number today and diverge tomorrow — and
 * because the waiver decision must never be reverse-engineered from a percent.
 */
export type PlatformFeeRail =
  /** Program subscriptions (Print Club included), editions, orders. */
  | "collected"
  /** Artist and org offerings: direct sales, commissions, services. */
  | "offering"
  /** Event tickets and open call entry fees. The payer is an attendee or artist. */
  | "participation"
  /** Brokered installations and sponsored placements. ARTEX sourced the deal. */
  | "brokered";

/**
 * The rails a Collection membership waives.
 *
 * `participation` is excluded because the payer is an attendee or an ARTIST
 * paying to enter an open call — a collector perk has no business there, and the
 * 5% rate is already the platform's lowest. `brokered` is excluded because ARTEX
 * sourced the deal and did the work the rate pays for.
 *
 * `offering` IS included, direct sales included, with no carve-out. Where the
 * artist is the seller this means ARTEX earns nothing on the transaction beyond
 * the member's monthly fee. That is deliberate and must not be hedged: the tier
 * earns from membership, not from transaction friction, and "Collection members
 * mean you keep 100%" is the strongest sentence available here. It should stay
 * true without an asterisk.
 */
export const WAIVER_ELIGIBLE_RAILS: ReadonlySet<PlatformFeeRail> = new Set<PlatformFeeRail>([
  "collected",
  "offering",
]);

export function isFeeWaiverEligibleRail(rail: PlatformFeeRail): boolean {
  return WAIVER_ELIGIBLE_RAILS.has(rail);
}

export interface BuyerFeeInput {
  rail: PlatformFeeRail;
  /** The rail's published rate, from the fee schedule. Never a literal. */
  publishedPercent: number;
  /** Does this buyer hold an active collector-access tier right now? */
  buyerHasCollectorTier?: boolean | null;
}

/**
 * Is the fee waived for this buyer on this rail?
 *
 * Resolve-time by design, matching `hasActiveCollectorTier`: a lapsed or
 * past-due membership waives nothing. The caller resolves the tier from live
 * subscription state.
 */
export function isFeeWaivedForBuyer(input: BuyerFeeInput): boolean {
  return input.buyerHasCollectorTier === true && isFeeWaiverEligibleRail(input.rail);
}

/**
 * The platform fee percent that actually applies to this buyer: zero when the
 * waiver applies, the published rate otherwise.
 *
 * This is the ONE place the waiver turns into a number. Everything downstream
 * (both settlement models, every split) reads a percent, so nothing else needs
 * to know the waiver exists — which is what keeps the rule from being
 * reimplemented differently in three places.
 */
export function resolveBuyerPlatformFeePercent(input: BuyerFeeInput): number {
  return isFeeWaivedForBuyer(input) ? 0 : input.publishedPercent;
}

/**
 * What the waiver was worth on a given gross, in integer cents. Zero when not
 * waived.
 *
 * Rounded the same way the fee itself is (`Math.round`), so "fee waived" and
 * "fee charged" can never disagree by a cent on the same gross.
 */
export function waivedFeeCents(input: BuyerFeeInput & { grossCents: number }): number {
  if (!isFeeWaivedForBuyer(input)) return 0;
  if (!Number.isFinite(input.grossCents) || input.grossCents < 0) return 0;
  return Math.round((input.grossCents * input.publishedPercent) / 100);
}

/**
 * The line a Collection member reads before buying, or null when the fee is not
 * waived for them on this rail.
 *
 * Says where the money goes, NOT that the price dropped — the buyer pays the
 * same either way, because the waiver is absorbed by ARTEX at settlement rather
 * than discounted at Checkout. Copy that implied a cheaper price would be
 * untrue and would train collectors to wait for markdowns.
 */
export function describeFeeWaiverForBuyer(
  input: BuyerFeeInput & { grossCents: number },
  formatCents: (cents: number) => string,
): string | null {
  const waived = waivedFeeCents(input);
  if (waived <= 0) return null;
  return `No ARTEX platform fee on this purchase. ${formatCents(waived)} more reaches the artist.`;
}

/**
 * The line an ARTIST reads about a member sale, on a settlement record.
 *
 * This surface is not decoration. Without it, "no platform fee" reads to an
 * artist as though the discount comes out of THEIR share, which is the exact
 * opposite of what happens. It also makes Collection an argument an artist can
 * make in their own interest to their own audience, which is the cheapest
 * collector acquisition ARTEX has.
 */
export function describeFeeWaiverForArtist(
  waivedCents: number,
  formatCents: (cents: number) => string,
): string | null {
  if (!Number.isFinite(waivedCents) || waivedCents <= 0) return null;
  return `Collection member purchase. ARTEX fee waived, ${formatCents(waivedCents)} additional to you.`;
}
