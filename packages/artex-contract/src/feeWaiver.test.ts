import { describe, expect, it } from "vitest";
import {
  DIRECT_SALE_FEE_PERCENT,
  PARTICIPATION_FEE_PERCENT,
  PROGRAM_SUBSCRIPTION_FEE_PERCENT,
} from "./feeSchedule";
import {
  WAIVER_ELIGIBLE_RAILS,
  describeFeeWaiverForArtist,
  describeFeeWaiverForBuyer,
  isFeeWaivedForBuyer,
  isFeeWaiverEligibleRail,
  resolveBuyerPlatformFeePercent,
  waivedFeeCents,
  type PlatformFeeRail,
} from "./feeWaiver";

const member = { buyerHasCollectorTier: true };
const visitor = { buyerHasCollectorTier: false };

describe("which rails the waiver reaches", () => {
  it("waives the everyday rails and nothing else", () => {
    expect([...WAIVER_ELIGIBLE_RAILS].sort()).toEqual(["collected", "offering"]);
    expect(isFeeWaiverEligibleRail("collected")).toBe(true);
    expect(isFeeWaiverEligibleRail("offering")).toBe(true);
  });

  it("never waives participation payments", () => {
    // The payer there is an attendee or an ARTIST entering an open call. A
    // collector perk has no business on that rail, and 5% is already the lowest
    // published rate.
    expect(isFeeWaivedForBuyer({ rail: "participation", publishedPercent: PARTICIPATION_FEE_PERCENT, ...member }))
      .toBe(false);
    expect(resolveBuyerPlatformFeePercent({ rail: "participation", publishedPercent: 5, ...member })).toBe(5);
  });

  it("never waives a deal ARTEX brokered", () => {
    expect(resolveBuyerPlatformFeePercent({ rail: "brokered", publishedPercent: 15, ...member })).toBe(15);
  });

  it("has no direct-sales carve-out", () => {
    // Where the artist is the seller this means ARTEX earns nothing on the
    // transaction beyond the member's monthly fee. Deliberate, and not to be
    // hedged into a partial waiver.
    expect(resolveBuyerPlatformFeePercent({
      rail: "offering", publishedPercent: DIRECT_SALE_FEE_PERCENT, ...member,
    })).toBe(0);
  });
});

describe("who the waiver applies to", () => {
  it("waives for a member and charges everyone else", () => {
    const base = { rail: "collected" as PlatformFeeRail, publishedPercent: PROGRAM_SUBSCRIPTION_FEE_PERCENT };
    expect(resolveBuyerPlatformFeePercent({ ...base, ...member })).toBe(0);
    expect(resolveBuyerPlatformFeePercent({ ...base, ...visitor })).toBe(10);
    expect(resolveBuyerPlatformFeePercent({ ...base })).toBe(10);
    expect(resolveBuyerPlatformFeePercent({ ...base, buyerHasCollectorTier: null })).toBe(10);
  });
});

describe("what the waiver was worth", () => {
  it("reports the waived amount so the exposure stays observable", () => {
    // Uncapped by decision, which is exactly why every split has to be able to
    // say what it gave up.
    expect(waivedFeeCents({ rail: "collected", publishedPercent: 10, grossCents: 10_000, ...member }))
      .toBe(1_000);
    expect(waivedFeeCents({ rail: "collected", publishedPercent: 10, grossCents: 10_000, ...visitor }))
      .toBe(0);
  });

  it("rounds the waived amount exactly as the fee itself rounds", () => {
    // "fee waived" and "fee charged" must never disagree by a cent on one gross.
    const grossCents = 3_333;
    const charged = Math.round((grossCents * 10) / 100);
    expect(waivedFeeCents({ rail: "collected", publishedPercent: 10, grossCents, ...member }))
      .toBe(charged);
  });

  it("reports nothing for an unusable gross rather than a negative waiver", () => {
    expect(waivedFeeCents({ rail: "collected", publishedPercent: 10, grossCents: -1, ...member })).toBe(0);
    expect(waivedFeeCents({ rail: "collected", publishedPercent: 10, grossCents: Number.NaN, ...member })).toBe(0);
  });
});

describe("the settlement invariant", () => {
  // The whole point, stated as arithmetic: because the artist's share is taken
  // AFTER the platform fee, waiving the fee enlarges the base. A member sale
  // must settle HIGHER for the artist, by exactly the waived fee.
  const settle = (grossCents: number, artistPercent: number, feePercent: number) => {
    const platformFee = Math.round((grossCents * feePercent) / 100);
    const distributable = grossCents - platformFee;
    const artist = Math.round((distributable * artistPercent) / 100);
    return { platformFee, distributable, artist, org: distributable - artist };
  };

  it("pays the artist more on a member sale, by exactly the waived fee", () => {
    const gross = 10_000;
    const nonMember = settle(gross, 100, resolveBuyerPlatformFeePercent({
      rail: "offering", publishedPercent: 10, ...visitor,
    }));
    const memberSale = settle(gross, 100, resolveBuyerPlatformFeePercent({
      rail: "offering", publishedPercent: 10, ...member,
    }));

    expect(nonMember.artist).toBe(9_000);
    expect(memberSale.artist).toBe(10_000);
    expect(memberSale.artist - nonMember.artist).toBe(
      waivedFeeCents({ rail: "offering", publishedPercent: 10, grossCents: gross, ...member }),
    );
  });

  it("never settles an org or artist lower because the buyer was a member", () => {
    for (const gross of [1, 99, 100, 4_567, 10_000, 250_000]) {
      for (const artistPercent of [50, 70, 90, 100]) {
        const nonMember = settle(gross, artistPercent, 10);
        const memberSale = settle(gross, artistPercent, 0);
        expect(memberSale.artist).toBeGreaterThanOrEqual(nonMember.artist);
        expect(memberSale.org).toBeGreaterThanOrEqual(nonMember.org);
        expect(memberSale.distributable).toBeGreaterThanOrEqual(nonMember.distributable);
        // And ARTEX's own take is the only thing that fell.
        expect(memberSale.platformFee).toBe(0);
      }
    }
  });
});

describe("what each side is told", () => {
  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  it("tells a member where the money goes, never that the price dropped", () => {
    const line = describeFeeWaiverForBuyer(
      { rail: "offering", publishedPercent: 10, grossCents: 10_000, ...member },
      fmt,
    );
    expect(line).toBe("No ARTEX platform fee on this purchase. $10.00 more reaches the artist.");
    // The buyer pays the same price either way; the waiver is absorbed at
    // settlement. Copy implying a cheaper price would be untrue.
    for (const wrong of ["discount", "off", "save", "cheaper", "reduced"]) {
      expect(line?.toLowerCase()).not.toContain(wrong);
    }
  });

  it("says nothing to a non-member, rather than upselling mid-purchase", () => {
    expect(describeFeeWaiverForBuyer(
      { rail: "offering", publishedPercent: 10, grossCents: 10_000, ...visitor }, fmt,
    )).toBeNull();
  });

  it("tells the artist a member sale paid them MORE", () => {
    // Without this, "no platform fee" reads as though it comes out of their share.
    const line = describeFeeWaiverForArtist(1_000, fmt);
    expect(line).toBe("Collection member purchase. ARTEX fee waived, $10.00 additional to you.");
    expect(line).toContain("additional to you");
  });

  it("says nothing on a sale with nothing waived", () => {
    expect(describeFeeWaiverForArtist(0, fmt)).toBeNull();
    expect(describeFeeWaiverForArtist(Number.NaN, fmt)).toBeNull();
  });
});
