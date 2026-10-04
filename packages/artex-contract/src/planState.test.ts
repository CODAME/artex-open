import { describe, expect, it } from "vitest";
import {
  buildHeldPrice,
  isHeldPriceActive,
  planNeedsAttention,
  resolvePlanBillingState,
  resolvePlanState,
  type HeldPrice,
} from "./planState";
import { earlyAdopterHoldUntil, earlyAdopterRate } from "./tiers";

const NOW = Date.UTC(2026, 2, 14); // 14 March 2026
const YEAR = 365 * 24 * 60 * 60 * 1000;

const collectionHold = (untilOffsetMs: number): HeldPrice => ({
  tierId: "collection",
  monthlyPriceCents: 700,
  annualPriceCents: 7000,
  until: NOW + untilOffsetMs,
});

describe("resolvePlanBillingState", () => {
  it("separates a failed payment from a healthy one", () => {
    expect(resolvePlanBillingState("past_due", false)).toBe("past_due");
    expect(resolvePlanBillingState("active", false)).toBe("active");
  });

  it("reports an active subscription set to end as canceling", () => {
    expect(resolvePlanBillingState("active", true)).toBe("canceling");
  });

  it("treats canceled, absent and unknown statuses as none", () => {
    expect(resolvePlanBillingState("canceled", false)).toBe("none");
    expect(resolvePlanBillingState(null, null)).toBe("none");
    expect(resolvePlanBillingState("bogus", false)).toBe("none");
  });
});

describe("isHeldPriceActive", () => {
  it("holds while the term is running and the tier matches", () => {
    expect(isHeldPriceActive(collectionHold(YEAR), "collection", NOW)).toBe(true);
  });

  it("stops holding once the term passes", () => {
    expect(isHeldPriceActive(collectionHold(-1), "collection", NOW)).toBe(false);
  });

  it("does not carry a hold across an upgrade to another tier", () => {
    // R2's precedence rule, applied to price: a real paid subscription at the
    // standard price wins, so upgrading must not silently restore the old rate.
    expect(isHeldPriceActive(collectionHold(YEAR), "studio", NOW)).toBe(false);
  });

  it("ignores a malformed snapshot rather than billing from it", () => {
    expect(isHeldPriceActive(null, "collection", NOW)).toBe(false);
    expect(
      isHeldPriceActive({ ...collectionHold(YEAR), until: Number.NaN }, "collection", NOW),
    ).toBe(false);
    expect(
      isHeldPriceActive(
        { ...collectionHold(YEAR), monthlyPriceCents: Number.NaN },
        "collection",
        NOW,
      ),
    ).toBe(false);
  });
});

describe("resolvePlanState", () => {
  it("bills a held member at the held rate and reports the standard one beside it", () => {
    const state = resolvePlanState(
      {
        subscriptionTier: "collection",
        subscriptionStatus: "active",
        heldPrice: collectionHold(2 * YEAR),
        renewsOn: NOW + 30 * 24 * 60 * 60 * 1000,
      },
      NOW,
    );
    expect(state.currentRate.monthlyPriceCents).toBe(700);
    expect(state.standardRate.monthlyPriceCents).toBe(900);
    expect(state.priceHeld?.until).toBe(NOW + 2 * YEAR);
    expect(state.billing).toBe("active");
  });

  it("falls back to the standard rate once the hold expires", () => {
    const state = resolvePlanState(
      { subscriptionTier: "collection", subscriptionStatus: "active", heldPrice: collectionHold(-1) },
      NOW,
    );
    expect(state.priceHeld).toBeNull();
    expect(state.currentRate.monthlyPriceCents).toBe(900);
  });

  it("carries no future price when the hold ends", () => {
    // Deliberate: the standard price at expiry is the tier's list price on the
    // day the rate ends (#3107), resolved then, so `to` carries nothing for a
    // copy layer to render ahead of time.
    const state = resolvePlanState(
      { subscriptionTier: "collection", subscriptionStatus: "active", heldPrice: collectionHold(YEAR) },
      NOW,
    );
    expect(state.nextChange).toEqual({
      at: NOW + YEAR,
      what: "held-price-ends",
      from: "700",
      to: null,
    });
  });

  it("reports the R2 grace as the next change for a pre-launch user", () => {
    const state = resolvePlanState(
      { subscriptionTier: null, grandfatheredUntil: NOW + YEAR },
      NOW,
    );
    expect(state.tierId).toBe("free");
    expect(state.effectiveTierId).toBe("studio");
    expect(state.graceUntil).toBe(NOW + YEAR);
    expect(state.nextChange).toEqual({ at: NOW + YEAR, what: "grace-ends", from: "studio", to: "free" });
  });

  it("reports a granted comp as the next change, on a REAL tier", () => {
    // A comp writes a real subscriptionTier, unlike the grandfather which only
    // shadows one. Without this the member is told nothing about the date their
    // tier goes away, which is the unpleasant surprise the grant's visibility
    // rule exists to prevent.
    const state = resolvePlanState(
      {
        subscriptionTier: "studio",
        subscriptionStatus: "active",
        compedUntil: NOW + YEAR,
      },
      NOW,
    );
    expect(state.tierId).toBe("studio");
    expect(state.effectiveTierId).toBe("studio");
    expect(state.nextChange).toEqual({ at: NOW + YEAR, what: "comp-ends", from: "studio", to: "free" });
  });

  it("says nothing about a comp that has already lapsed", () => {
    const state = resolvePlanState(
      { subscriptionTier: "studio", subscriptionStatus: "active", compedUntil: NOW - 1 },
      NOW,
    );
    expect(state.nextChange).toBeNull();
  });

  it("tells a comped member about the comp, not a later held-price date", () => {
    // Losing a tier outranks a rate moving, and the comp is sooner anyway.
    const state = resolvePlanState(
      {
        subscriptionTier: "collection",
        subscriptionStatus: "active",
        compedUntil: NOW + YEAR,
        heldPrice: {
          tierId: "collection",
          until: NOW + 2 * YEAR,
          monthlyPriceCents: 500,
          annualPriceCents: 5000,
        },
      },
      NOW,
    );
    expect(state.nextChange?.what).toBe("comp-ends");
  });

  it("gives one coherent answer to a member inside both the grace and a hold", () => {
    // The R2 free Studio year and a two-year Collection hold run on independent
    // clocks; the member is told about the nearer one, not both at once.
    const state = resolvePlanState(
      {
        subscriptionTier: "collection",
        subscriptionStatus: "active",
        grandfatheredUntil: NOW + YEAR,
        heldPrice: collectionHold(2 * YEAR),
      },
      NOW,
    );
    // A paid tier is already past the grace, so the grace has nothing to say.
    expect(state.graceUntil).toBeNull();
    expect(state.effectiveTierId).toBe("collection");
    expect(state.nextChange?.what).toBe("held-price-ends");
  });

  it("puts losing access ahead of a price move when both land the same day", () => {
    const state = resolvePlanState(
      {
        subscriptionTier: "collection",
        subscriptionStatus: "active",
        cancelAtPeriodEnd: true,
        renewsOn: NOW + YEAR,
        heldPrice: collectionHold(YEAR),
      },
      NOW,
    );
    expect(state.nextChange?.what).toBe("subscription-ends");
  });

  it("reports a subscription ending as a change rather than a renewal", () => {
    const state = resolvePlanState(
      {
        subscriptionTier: "collection",
        subscriptionStatus: "active",
        cancelAtPeriodEnd: true,
        renewsOn: NOW + 10_000,
      },
      NOW,
    );
    expect(state.billing).toBe("canceling");
    expect(state.renewsOn).toBeNull();
    expect(state.nextChange).toEqual({
      at: NOW + 10_000,
      what: "subscription-ends",
      from: "collection",
      to: "free",
    });
  });

  it("keeps a failed payment distinct from anything expiring", () => {
    const state = resolvePlanState(
      { subscriptionTier: "collection", subscriptionStatus: "past_due", heldPrice: collectionHold(YEAR) },
      NOW,
    );
    expect(planNeedsAttention(state)).toBe(true);
    // The hold is still running; it is not what needs the member's attention.
    expect(state.nextChange?.what).toBe("held-price-ends");
  });

  it("has nothing to report for a settled free account", () => {
    const state = resolvePlanState({ subscriptionTier: null }, NOW);
    expect(state.tierId).toBe("free");
    expect(state.nextChange).toBeNull();
    expect(planNeedsAttention(state)).toBe(false);
  });
});

describe("buildHeldPrice", () => {
  it("runs the term from the member's own subscription date", () => {
    // A rate passed explicitly: no tier publishes one today, and the snapshot
    // must still be built right for a member who took one (or a future offer).
    const held = buildHeldPrice("collection", { monthlyPriceCents: 700, annualPriceCents: 7000 }, NOW);
    expect(held).toEqual({
      tierId: "collection",
      monthlyPriceCents: 700,
      annualPriceCents: 7000,
      until: Date.UTC(2028, 2, 14),
    });
    expect(held?.until).toBe(earlyAdopterHoldUntil(NOW));
  });

  it("writes no snapshot for a tier with no early adopter rate", () => {
    expect(buildHeldPrice("studio", earlyAdopterRate("studio"), NOW)).toBeNull();
  });
});
