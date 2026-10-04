/**
 * Plan-change notices — telling a member what is about to change, before it
 * changes.
 *
 * THE RULE THIS EXISTS FOR: a price change discovered on a bank statement is a
 * cancellation. Nothing that moves what somebody pays, or what tier they hold,
 * may land without warning them first.
 *
 * Three notices per change: 30 days, 7 days, and the day itself. The 30-day
 * notice is the one that matters — it is long enough to cancel deliberately
 * rather than in anger — and the day-of notice exists so nobody can say the
 * change arrived silently.
 *
 * Kept separate from the urgent path on purpose. A held rate ending or a grace
 * expiring is NEUTRAL and expected; a declined card is urgent and is
 * `planNeedsAttention`. Sending them through one channel with one tone is how
 * people learn to ignore the urgent one.
 *
 * PURE: the caller supplies the clock and the record of what it has already
 * sent, and gets back what is due now. No scheduling, no delivery, no storage.
 *
 * See docs/collection-tier-definition.md and #3107.
 */
import type { PlanChange, PlanState } from "./planState";

/**
 * Days before a change that a notice goes out, longest first. `0` is the day
 * the change lands.
 *
 * Ordered longest-first because the resolver walks it in order and takes the
 * first threshold that has been crossed, which is the one that has been due
 * longest and not yet sent.
 */
export const PLAN_CHANGE_NOTICE_DAYS: readonly number[] = [30, 7, 0];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DuePlanChangeNotice {
  /** Which threshold this is: 30, 7, or 0. */
  days: number;
  /** The change being announced. */
  change: PlanChange;
  /** Epoch ms the change lands, for the copy layer. */
  at: number;
}

/**
 * Which notice, if any, is due for this plan right now.
 *
 * `sentDays` is the thresholds already sent FOR THIS CHANGE. The caller keys
 * that record by the change itself (see `planChangeNoticeKey`), so a member
 * whose next change is replaced by a different one starts a fresh sequence
 * rather than inheriting a half-sent sequence for something that no longer
 * applies.
 *
 * Returns at most one notice per call. When several thresholds are overdue —
 * a cron that did not run for a month, say — the LONGEST outstanding one is
 * returned first, so the member gets the 30-day warning before the 7-day one and
 * the sequence stays in a sensible order rather than collapsing to "it changes
 * today".
 */
export function resolveDuePlanChangeNotice(
  state: PlanState,
  nowMs: number,
  sentDays: readonly number[] = [],
): DuePlanChangeNotice | null {
  const change = state.nextChange;
  if (!change) return null;
  // A change already in the past has nothing left to announce.
  if (nowMs > change.at) return null;

  // WHOLE days remaining, floored. A threshold is due once that count has fallen
  // to it or below.
  //
  // Floored rather than exact, because a daily job runs at some point during a
  // day and never at an exact millisecond: with an exact comparison the `0`
  // threshold is only satisfiable at the instant the change lands, so the
  // day-of notice would never be sent by any real caller. Flooring makes `0`
  // mean "some time on the final day", which is what day-of means.
  const daysRemaining = Math.floor((change.at - nowMs) / MS_PER_DAY);

  const sent = new Set(sentDays);
  for (const days of PLAN_CHANGE_NOTICE_DAYS) {
    if (sent.has(days)) continue;
    if (daysRemaining <= days) {
      return { days, change, at: change.at };
    }
  }
  return null;
}

/**
 * A stable key identifying one change, for recording which notices have gone
 * out.
 *
 * Includes the DATE as well as the kind: if a change is rescheduled, it is a
 * different change and deserves its own sequence. Keying on kind alone would
 * let a rescheduled change inherit "already sent" and land unannounced, which is
 * the exact failure this module exists to prevent.
 */
export function planChangeNoticeKey(change: PlanChange): string {
  return `${change.what}:${change.at}`;
}

/**
 * The plain-language notice body. Neutral by design: this is an expected date
 * arriving, not a problem.
 *
 * The held-rate notice names the date and says what follows: the plan continues
 * at the tier's standard price. It does NOT name a number, because the standard
 * price is the tier's public list price at the moment the rate ends (owner
 * decision, 2026-10-03, #3107), which this layer is not given.
 */
export function describePlanChangeNotice(
  notice: DuePlanChangeNotice,
  formatDate: (epochMs: number) => string,
): string {
  const on = formatDate(notice.at);
  const lead =
    notice.days === 0 ? "Today" : `In ${notice.days} day${notice.days === 1 ? "" : "s"}`;
  switch (notice.change.what) {
    case "held-price-ends":
      return `${lead}, on ${on}, your early adopter rate finishes its two years and your plan continues at the standard price.`;
    case "grace-ends":
      return `${lead}, on ${on}, your free ARTEX Studio year ends and your account moves to ARTEX Free. You keep everything you have made.`;
    case "comp-ends":
      // Names no org: this copy layer is given a change, not a provenance, and
      // inventing "from CODAME" here would be a guess. The billing surface,
      // which does read the source org, names it.
      return `${lead}, on ${on}, the free plan you were given ends and your account moves to ARTEX Free. You keep everything you have made, and it stays published.`;
    case "subscription-ends":
      return `${lead}, on ${on}, your plan ends and your account moves to ARTEX Free. You keep everything you have made.`;
    default:
      return `${lead}, on ${on}, your plan changes.`;
  }
}
