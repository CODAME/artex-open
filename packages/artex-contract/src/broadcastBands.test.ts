import { describe, it, expect } from "vitest";
import {
  ARTEX_BROADCAST_BANDS,
  BROADCAST_BAND_IDS,
  isBroadcastBandId,
  broadcastBandReach,
  resolveOrgBroadcastReach,
  broadcastBandPriceCents,
} from "./broadcastBands";

describe("broadcast band definitions", () => {
  it("lists exactly the four reach bands, smallest first", () => {
    expect(BROADCAST_BAND_IDS).toEqual(["reach_5k", "reach_10k", "reach_25k", "reach_100k"]);
  });

  it("holds the agreed thresholds and prices (annual = 10x monthly)", () => {
    expect(ARTEX_BROADCAST_BANDS.reach_5k).toMatchObject({ reach: 5_000, monthlyPriceCents: 900, annualPriceCents: 9_000 });
    expect(ARTEX_BROADCAST_BANDS.reach_10k).toMatchObject({ reach: 10_000, monthlyPriceCents: 1900, annualPriceCents: 19_000 });
    expect(ARTEX_BROADCAST_BANDS.reach_25k).toMatchObject({ reach: 25_000, monthlyPriceCents: 3900, annualPriceCents: 39_000 });
    expect(ARTEX_BROADCAST_BANDS.reach_100k).toMatchObject({ reach: 100_000, monthlyPriceCents: 9900, annualPriceCents: 99_000 });
  });

  it("every band reach clears Workspace's included 1,000 allowance", () => {
    for (const id of BROADCAST_BAND_IDS) {
      expect(ARTEX_BROADCAST_BANDS[id].reach).toBeGreaterThan(1000);
    }
  });
});

describe("isBroadcastBandId", () => {
  it("accepts known ids, rejects everything else", () => {
    expect(isBroadcastBandId("reach_10k")).toBe(true);
    expect(isBroadcastBandId("reach_500k")).toBe(false);
    expect(isBroadcastBandId(null)).toBe(false);
    expect(isBroadcastBandId(undefined)).toBe(false);
    expect(isBroadcastBandId(10_000)).toBe(false);
  });
});

describe("broadcastBandReach", () => {
  it("returns the band reach, or 0 for no/unknown band", () => {
    expect(broadcastBandReach("reach_25k")).toBe(25_000);
    expect(broadcastBandReach(null)).toBe(0);
    expect(broadcastBandReach(undefined)).toBe(0);
    expect(broadcastBandReach("bogus")).toBe(0);
  });
});

describe("resolveOrgBroadcastReach", () => {
  it("raises the cap to the band when the band is more generous than the tier", () => {
    expect(resolveOrgBroadcastReach(1000, "reach_5k")).toBe(5_000);
    expect(resolveOrgBroadcastReach(1000, "reach_10k")).toBe(10_000);
    expect(resolveOrgBroadcastReach(1000, "reach_100k")).toBe(100_000);
  });

  it("keeps the tier reach when it already exceeds the band", () => {
    expect(resolveOrgBroadcastReach(50_000, "reach_10k")).toBe(50_000);
  });

  it("unlimited member reach always wins", () => {
    expect(resolveOrgBroadcastReach(-1, "reach_10k")).toBe(-1);
    expect(resolveOrgBroadcastReach(-1, null)).toBe(-1);
  });

  it("no band leaves the tier reach untouched", () => {
    expect(resolveOrgBroadcastReach(1000, null)).toBe(1000);
    expect(resolveOrgBroadcastReach(100, undefined)).toBe(100);
  });
});

describe("broadcastBandPriceCents", () => {
  it("returns monthly or annual per period", () => {
    expect(broadcastBandPriceCents("reach_10k", "monthly")).toBe(1900);
    expect(broadcastBandPriceCents("reach_10k", "annual")).toBe(19_000);
  });
});
