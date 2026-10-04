/**
 * ARTEX platform credit ledger — the net-new monetary wallet primitive for
 * referral credits (P6 of the Updates/Followers/Broadcast plan;
 * docs/broadcast-and-audience-plan.md §14, docs/credit-ledger.md).
 *
 * This file is the **shared schema only** (types + kind partitions). It is the
 * source of truth for the ledger shape that both the platform API and the
 * client agree on. The authoritative balance math lives server-side in
 * `.services/artex-platform-api/creditLedger.mjs` because the platform API is a
 * standalone service that cannot import this package — keep the two in sync
 * when the shape changes (same arrangement as feeSchedule.ts ↔ payoutSplit.mjs).
 *
 * Invariants (never weakened without a pricing/equity sign-off — AGENTS.md §6):
 *  - **Server-authoritative, append-only.** The platform API writes entries via
 *    the Admin SDK; clients only ever read. Entries are immutable — corrections
 *    are new entries, never edits.
 *  - **Credits are non-cashable, non-transferable, platform-locked, expiring.**
 *  - **ARTEX charges only.** A redemption may reduce ARTEX's own charges
 *    (platform subscriptions and fees) and **never** money that flows to an
 *    artist (prints, collecting, commissions, payouts). Enforcement lives with
 *    the redemption hook (deferred); this schema documents the constraint.
 *
 * Amounts are a positive magnitude in minor currency units (e.g. cents); the
 * sign of a movement is derived from its `kind`, never stored.
 */

/** Who holds a credit balance: an individual account or an organization. */
export type CreditHolderType = "user" | "org";

/** Identifies a credit holder. `holderId` is a uid for "user", an orgId for "org". */
export interface CreditHolderRef {
  holderType: CreditHolderType;
  holderId: string;
}

/**
 * The kinds of ledger movement. `grant` adds credit; the other three remove it.
 *  - `grant`      — credit awarded (e.g. a referral conversion, a welcome credit)
 *  - `redemption` — credit spent against an ARTEX charge (never artist-bound money)
 *  - `expiry`     — unspent credit lapsed past its expiry
 *  - `clawback`   — a grant reversed after a refund/chargeback of the qualifying purchase
 */
export type CreditLedgerEntryKind = "grant" | "redemption" | "expiry" | "clawback";

/** Every recognized entry kind, for exhaustive validation. */
export const CREDIT_LEDGER_ENTRY_KINDS: readonly CreditLedgerEntryKind[] = [
  "grant",
  "redemption",
  "expiry",
  "clawback",
];

/** Kinds that add credit (counted positive when summing a balance). */
export const CREDIT_ADDING_KINDS: readonly CreditLedgerEntryKind[] = ["grant"];

/** Kinds that remove credit (counted negative when summing a balance). */
export const CREDIT_REMOVING_KINDS: readonly CreditLedgerEntryKind[] = [
  "redemption",
  "expiry",
  "clawback",
];

/**
 * One immutable, append-only ledger entry (a Firestore doc in
 * `creditLedgerEntries`). Written only by the platform API. Never mutate — a
 * correction is a new entry.
 */
export interface CreditLedgerEntry extends CreditHolderRef {
  /** Firestore document id. */
  id: string;
  kind: CreditLedgerEntryKind;
  /** Positive magnitude in minor units (e.g. cents). The sign comes from `kind`. */
  amountMinor: number;
  /** ISO 4217 currency, lowercased (e.g. "usd", "eur"). */
  currency: string;
  /**
   * Machine reason slug for the audit trail (e.g. "referral_conversion",
   * "welcome_credit", "checkout_redemption", "ttl_expiry", "refund_clawback").
   */
  reason: string;
  /**
   * External correlation id: the referee uid for a referral grant, the Stripe
   * payment intent for a redemption/clawback, etc. Null when not applicable.
   */
  referenceId: string | null;
  /**
   * For `expiry`/`clawback`: the id of the grant entry being lapsed/reversed.
   * Null for `grant` and `redemption`.
   */
  sourceEntryId: string | null;
  /**
   * When a grant lapses, if ever (ISO 8601). Null = non-expiring. Meaningful on
   * `grant` entries only.
   */
  expiresAt: string | null;
  /** Server write time (ISO 8601). */
  createdAt: string;
  /** Who caused the write: "system" for the automated pipeline, or an admin uid. */
  createdBy: string;
}

/**
 * A holder's computed credit position in a single currency. The ledger may hold
 * more than one currency, so balances are always reported per currency.
 *
 * `balanceMinor` is the realized position (granted minus every removal). Lapsing
 * is realized by explicit `expiry` entries a server sweep appends and by an
 * expiry check at redemption time — the aggregate balance does not silently drop
 * un-swept grants. See docs/credit-ledger.md "Expiry".
 */
export interface CreditBalance {
  currency: string;
  grantedMinor: number;
  redeemedMinor: number;
  expiredMinor: number;
  clawedBackMinor: number;
  /** grantedMinor − redeemedMinor − expiredMinor − clawedBackMinor (never < 0). */
  balanceMinor: number;
}
