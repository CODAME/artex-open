import { describe, expect, it } from "vitest";
import {
  PLAN_CHANGE_NOTICE_DAYS,
  describePlanChangeNotice,
  planChangeNoticeKey,
  resolveDuePlanChangeNotice,
  type DuePlanChangeNotice,
} from "./planNotices";
import { resolvePlanState, type HeldPrice } from "./planState";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 2, 14);

const heldUntil = (at: number): HeldPrice => ({
  tierId: "collection",
  monthlyPriceCents: 700,
  annualPriceCents: 7000,
  until: at,
});

/** Narrow a resolver result, so the copy tests need no non-null assertion. */
const requireNotice = (notice: DuePlanChangeNotice | null): DuePlanChangeNotice => {
  if (!notice) throw new Error("expected a notice to be due");
  return notice;
};

const planWithHoldEnding = (at: number) => resolvePlanState(
  { subscriptionTier: "collection", subscriptionStatus: "active", heldPrice: heldUntil(at) },
  NOW,
);

describe("notice schedule", () => {
  it("warns at 30, 7, and 0 days, longest first", () => {
    expect(PLAN_CHANGE_NOTICE_DAYS).toEqual([30, 7, 0]);
  });

  it("sends nothing while the change is still far off", () => {
    const state = planWithHoldEnding(NOW + 90 * DAY);
    expect(resolveDuePlanChangeNotice(state, NOW)).toBeNull();
  });

  it("sends the 30-day notice as soon as the threshold is crossed", () => {
    const at = NOW + 30 * DAY;
    const notice = resolveDuePlanChangeNotice(planWithHoldEnding(at), NOW);
    expect(notice?.days).toBe(30);
    expect(notice?.at).toBe(at);
  });

  it("moves to the next threshold once the previous one is recorded as sent", () => {
    const state = planWithHoldEnding(NOW + 7 * DAY);
    expect(resolveDuePlanChangeNotice(state, NOW, [30])?.days).toBe(7);
    // The day-of notice is not yet due seven days out, however many earlier
    // ones have been sent.
    expect(resolveDuePlanChangeNotice(state, NOW, [30, 7])).toBeNull();

    const landingToday = planWithHoldEnding(NOW + DAY / 2);
    expect(resolveDuePlanChangeNotice(landingToday, NOW, [30, 7])?.days).toBe(0);
    expect(resolveDuePlanChangeNotice(landingToday, NOW, [30, 7, 0])).toBeNull();
  });

  it("fires the day-of notice part-way through the final day, not at an exact instant", () => {
    // A daily job runs at some point during a day. An exact comparison made the
    // `0` threshold unsatisfiable by any real caller.
    const state = planWithHoldEnding(NOW + DAY / 2);
    expect(resolveDuePlanChangeNotice(state, NOW, [30, 7])?.days).toBe(0);
  });

  it("sends the longest outstanding notice first when the job has not run for a while", () => {
    // A cron that missed a month must not collapse the sequence into "it changes
    // today" — the member still gets the warning that was due first.
    const at = NOW + 5 * DAY;
    const notice = resolveDuePlanChangeNotice(planWithHoldEnding(at), NOW, []);
    expect(notice?.days).toBe(30);
  });

  it("stops once the change has already landed", () => {
    const state = planWithHoldEnding(NOW - DAY);
    // The hold has expired, so there is no longer a change to announce at all.
    expect(resolveDuePlanChangeNotice(state, NOW)).toBeNull();
  });

  it("has nothing to send for a plan with no change coming", () => {
    const settled = resolvePlanState({ subscriptionTier: null }, NOW);
    expect(resolveDuePlanChangeNotice(settled, NOW)).toBeNull();
  });
});

describe("planChangeNoticeKey", () => {
  it("gives a rescheduled change its own sequence", () => {
    // Keying on kind alone would let a rescheduled change inherit "already
    // sent" and land unannounced, which is the failure this module prevents.
    const first = planWithHoldEnding(NOW + 30 * DAY).nextChange;
    const moved = planWithHoldEnding(NOW + 60 * DAY).nextChange;
    if (!first || !moved) throw new Error("expected both plans to have a next change");
    expect(planChangeNoticeKey(first)).not.toBe(planChangeNoticeKey(moved));
    expect(planChangeNoticeKey(first)).toBe(`held-price-ends:${NOW + 30 * DAY}`);
  });
});

describe("notice copy", () => {
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  it("names the date and carries no future price", () => {
    // The standard price at expiry is the list price on the day the rate ends
    // (#3107). Naming a figure here would freeze one that is meant to stay live.
    const at = NOW + 30 * DAY;
    const notice = requireNotice(resolveDuePlanChangeNotice(planWithHoldEnding(at), NOW));
    const body = describePlanChangeNotice(notice, fmt);
    expect(body).toContain("In 30 days");
    expect(body).toContain("early adopter rate");
    // Says what follows, never a number: the standard price is the list price on
    // the day the rate ends (#3107).
    expect(body).toContain("continues at the standard price");
    expect(body).not.toMatch(/\$\d/);
    expect(body).not.toContain("write to you");
  });

  it("reads as a date arriving, not a problem", () => {
    const notice = requireNotice(resolveDuePlanChangeNotice(planWithHoldEnding(NOW + 30 * DAY), NOW));
    const body = describePlanChangeNotice(notice, fmt);
    for (const alarm of ["failed", "urgent", "action required", "immediately", "problem"]) {
      expect(body.toLowerCase()).not.toContain(alarm);
    }
  });

  it("says Today rather than In 0 days", () => {
    // Part-way through the final day, which is when a daily job actually runs.
    const state = planWithHoldEnding(NOW + DAY / 2);
    const notice = requireNotice(resolveDuePlanChangeNotice(state, NOW, [30, 7]));
    expect(notice.days).toBe(0);
    expect(describePlanChangeNotice(notice, fmt)).toMatch(/^Today,/);
  });

  it("reassures on a tier drop that the work is kept", () => {
    const graced = resolvePlanState({ subscriptionTier: null, grandfatheredUntil: NOW + 7 * DAY }, NOW);
    const notice = requireNotice(resolveDuePlanChangeNotice(graced, NOW, [30]));
    const body = describePlanChangeNotice(notice, fmt);
    expect(body).toContain("ARTEX Free");
    expect(body).toContain("You keep everything you have made");
  });
});
