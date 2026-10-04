import { describe, expect, it } from "vitest";
import {
  ARTIST_PAYOUT_FLOOR_GUARANTEE,
  PARTICIPATION_FEE_PERCENT,
  PLATFORM_FEE_NEUTRALITY_RULE,
  PLATFORM_FEE_SCHEDULE,
  PLATFORM_FEE_SOVEREIGNTY_SENTENCE,
  PROGRAM_SUBSCRIPTION_FEE_PERCENT,
  SALES_ARTIST_PAYOUT_FLOOR_PERCENT,
} from "./feeSchedule";

describe("platform fee schedule", () => {
  it("keeps the decided rates", () => {
    expect(PROGRAM_SUBSCRIPTION_FEE_PERCENT).toBe(10);
    expect(PARTICIPATION_FEE_PERCENT).toBe(5);
    expect(SALES_ARTIST_PAYOUT_FLOOR_PERCENT).toBe(50);
  });

  it("publishes no separate Print Club rate — it is on the 10% rail", () => {
    // Print Club sat outside the rail at "15% of profit" until the collected
    // model landed. A reappearing profit-based rate would mean the basis crept
    // back; a reappearing 15 would be the hidden price rise the 10% avoided.
    const rail = PLATFORM_FEE_SCHEDULE.find((g) => g.id === "rail");
    if (!rail) throw new Error("the schedule must publish a rail group");
    const railText = rail.items
      .flatMap((i) => [i.label, i.rate, i.note ?? ""])
      .join(" ");
    expect(railText).toMatch(/Print Club/);
    expect(railText).not.toMatch(/profit/);
    expect(railText).not.toMatch(/15%/);
  });

  it("publishes the three groups in order", () => {
    expect(PLATFORM_FEE_SCHEDULE.map((g) => g.id)).toEqual(["rail", "participation", "brokered"]);
    for (const group of PLATFORM_FEE_SCHEDULE) {
      expect(group.items.length).toBeGreaterThan(0);
      for (const item of group.items) {
        expect(item.label.length).toBeGreaterThan(0);
        expect(item.rate.length).toBeGreaterThan(0);
      }
    }
  });

  it("opens with the sovereignty sentence and publishes the neutrality rule", () => {
    expect(PLATFORM_FEE_SOVEREIGNTY_SENTENCE).toMatch(/only when money moves/);
    expect(PLATFORM_FEE_NEUTRALITY_RULE).toMatch(/same published rates/);
    // The guarantee is stated against the post-fee remainder, not "profit":
    // an artist can verify this one, where profit depended on a hard cost only
    // the org could see. Pinned so the wording cannot drift back.
    expect(ARTIST_PAYOUT_FLOOR_GUARANTEE).toMatch(/at least half/);
    expect(ARTIST_PAYOUT_FLOOR_GUARANTEE).toMatch(/after the platform fee/);
    expect(ARTIST_PAYOUT_FLOOR_GUARANTEE).not.toMatch(/profit/);
  });

  it("uses no em dashes in public copy", () => {
    const strings = [
      PLATFORM_FEE_SOVEREIGNTY_SENTENCE,
      PLATFORM_FEE_NEUTRALITY_RULE,
      ARTIST_PAYOUT_FLOOR_GUARANTEE,
      ...PLATFORM_FEE_SCHEDULE.flatMap((g) => [g.title, g.summary, ...g.items.flatMap((i) => [i.label, i.rate, i.note ?? ""])]),
    ];
    for (const s of strings) {
      expect(s).not.toContain("—");
    }
  });
});
