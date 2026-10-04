import { describe, expect, it } from "vitest";
import {
  ARTEX_TIERS,
  EARLY_ADOPTER_HOLD_YEARS,
  EARLY_ADOPTER_RATES,
  earlyAdopterHoldUntil,
  earlyAdopterRate,
  isEarlyAdopterEligible,
  normalizeTierId,
  resolveEffectiveTierId,
  standardTierRate,
  tierAllows,
  tierLimit,
  type ArtexTierId,
  type CanonicalArtexTierId,
} from "./tiers";

const CANONICAL_IDS: ArtexTierId[] = ["free", "studio", "stage", "collection", "enterprise"];
const ALL_IDS: ArtexTierId[] = [...CANONICAL_IDS, "venue"];

describe("ARTEX_TIERS table", () => {
  it("defines every tier id including the deprecated venue alias", () => {
    for (const id of ALL_IDS) {
      expect(ARTEX_TIERS[id]).toBeDefined();
      expect(ARTEX_TIERS[id].id).toBe(id);
    }
  });

  it("prices the monetization-plan USD model", () => {
    expect(ARTEX_TIERS.free.monthlyPriceMinCents).toBe(0);
    expect(ARTEX_TIERS.studio.monthlyPriceMinCents).toBe(1200);
    expect(ARTEX_TIERS.studio.annualPriceMinCents).toBe(12000);
    expect(ARTEX_TIERS.studio.payWhatYouWant).toBe(false);
    expect(ARTEX_TIERS.stage.monthlyPriceMinCents).toBe(2900);
    expect(ARTEX_TIERS.stage.annualPriceMinCents).toBe(29000);
    expect(ARTEX_TIERS.collection.monthlyPriceMinCents).toBe(900);
    expect(ARTEX_TIERS.collection.annualPriceMinCents).toBe(9000);
    expect(ARTEX_TIERS.enterprise.annualPriceMinCents).toBe(1600000);
  });

  it("prices annual as 10x monthly (two months free) for every self-serve tier", () => {
    for (const id of ["studio", "stage", "collection"] as const) {
      expect(ARTEX_TIERS[id].annualPriceMinCents).toBe(ARTEX_TIERS[id].monthlyPriceMinCents * 10);
    }
    // The deprecated venue alias tracks stage exactly.
    expect(ARTEX_TIERS.venue.annualPriceMinCents).toBe(ARTEX_TIERS.stage.annualPriceMinCents);
  });

  it("keeps venue as a faithful alias of stage (identical features)", () => {
    expect(ARTEX_TIERS.venue.features).toEqual(ARTEX_TIERS.stage.features);
    expect(ARTEX_TIERS.venue.name).toBe(ARTEX_TIERS.stage.name);
  });

  it("populates the new feature flags for every tier", () => {
    for (const id of ALL_IDS) {
      const f = ARTEX_TIERS[id].features;
      expect(typeof f.collectorAccess).toBe("boolean");
      expect(typeof f.printEditionAccess).toBe("boolean");
      expect(typeof f.aiGenerationQuota).toBe("number");
      expect(typeof f.storageQuotaBytes).toBe("number");
      expect(typeof f.orgSeats).toBe("number");
    }
  });

  it("grants collector access only to the collector + enterprise tiers", () => {
    expect(ARTEX_TIERS.collection.features.collectorAccess).toBe(true);
    expect(ARTEX_TIERS.collection.features.printEditionAccess).toBe(true);
    expect(ARTEX_TIERS.enterprise.features.collectorAccess).toBe(true);
    expect(ARTEX_TIERS.free.features.collectorAccess).toBe(false);
    expect(ARTEX_TIERS.studio.features.collectorAccess).toBe(false);
    expect(ARTEX_TIERS.stage.features.collectorAccess).toBe(false);
  });
});

describe("normalizeTierId", () => {
  it("maps the deprecated venue alias to stage", () => {
    expect(normalizeTierId("venue")).toBe("stage");
  });

  it("returns canonical ids unchanged", () => {
    for (const id of CANONICAL_IDS) {
      expect(normalizeTierId(id)).toBe(id);
    }
  });

  it("falls back to free for unknown / nullish input", () => {
    expect(normalizeTierId("bogus")).toBe("free");
    expect(normalizeTierId(null)).toBe("free");
    expect(normalizeTierId(undefined)).toBe("free");
  });
});

describe("tierAllows", () => {
  it("reads boolean features", () => {
    expect(tierAllows("stage", "venueManagement")).toBe(true);
    expect(tierAllows("studio", "venueManagement")).toBe(false);
    expect(tierAllows("enterprise", "apiAccess")).toBe(true);
  });

  it("treats a zero numeric limit as not-allowed", () => {
    expect(tierAllows("free", "maxInstallations")).toBe(false); // 0
    expect(tierAllows("studio", "maxInstallations")).toBe(true); // 1
  });

  it("gates Studio Desktop to paid creator/org tiers, not free or collector", () => {
    expect(tierAllows("free", "studioDesktopAccess")).toBe(false);
    expect(tierAllows("collection", "studioDesktopAccess")).toBe(false);
    expect(tierAllows("studio", "studioDesktopAccess")).toBe(true);
    expect(tierAllows("stage", "studioDesktopAccess")).toBe(true);
    expect(tierAllows("venue", "studioDesktopAccess")).toBe(true);
    expect(tierAllows("enterprise", "studioDesktopAccess")).toBe(true);
  });
});

describe("publishing your own writing is not a tier feature (2026-10-04, Bruno)", () => {
  it("carries no per-tier writing gate, so every plan including free publishes writing", () => {
    // The 2026-09-25 paid-plan gate was reverted: writing is free, the tier
    // table says nothing about it, and a flag coming back here is the
    // pricing-boundary change this test exists to make someone notice.
    for (const tier of Object.values(ARTEX_TIERS)) {
      expect(Object.keys(tier.features)).not.toContain("articlePublishing");
    }
  });
});

describe("resolveEffectiveTierId (grandfather grace)", () => {
  const NOW = 1_700_000_000_000;
  const FUTURE = NOW + 1_000;
  const PAST = NOW - 1_000;

  it("treats a grandfathered free user as studio until the grace expires", () => {
    expect(resolveEffectiveTierId({ subscriptionTier: null, grandfatheredUntil: FUTURE }, NOW)).toBe("studio");
    expect(resolveEffectiveTierId({ subscriptionTier: "free", grandfatheredUntil: FUTURE }, NOW)).toBe("studio");
  });

  it("lands a grandfathered user on standard free once the grace passes", () => {
    expect(resolveEffectiveTierId({ subscriptionTier: null, grandfatheredUntil: PAST }, NOW)).toBe("free");
  });

  it("lets a real paid tier win over the grace grant", () => {
    expect(resolveEffectiveTierId({ subscriptionTier: "stage", grandfatheredUntil: FUTURE }, NOW)).toBe("stage");
    expect(resolveEffectiveTierId({ subscriptionTier: "venue", grandfatheredUntil: FUTURE }, NOW)).toBe("stage");
  });

  it("returns free when there is neither a paid tier nor an active grace", () => {
    expect(resolveEffectiveTierId({ subscriptionTier: null }, NOW)).toBe("free");
    expect(resolveEffectiveTierId({ subscriptionTier: "free", grandfatheredUntil: null }, NOW)).toBe("free");
  });
});

describe("tierLimit", () => {
  it("returns numeric capacities including the new quotas", () => {
    expect(tierLimit("studio", "maxPublishedPackages")).toBe(25);
    expect(tierLimit("stage", "maxInstallations")).toBe(5);
    expect(tierLimit("studio", "aiGenerationQuota")).toBe(200);
    expect(tierLimit("enterprise", "storageQuotaBytes")).toBe(-1);
  });

  it("resolves the venue alias to stage limits", () => {
    expect(tierLimit("venue", "maxInstallations")).toBe(tierLimit("stage", "maxInstallations"));
  });
});

describe("early adopter rates", () => {
  it("sells Collection at its standard $9/mo · $90/yr now its early adopter rate has closed", () => {
    // Closed 2026-09-28 (owner decision). A rate reappearing here is a pricing
    // change, not a refactor.
    expect(earlyAdopterRate("collection")).toBeNull();
    expect(standardTierRate("collection")).toEqual({ monthlyPriceCents: 900, annualPriceCents: 9000 });
  });

  it("keeps annual at ten months of the monthly rate, held or standard (R1)", () => {
    for (const [tierId, rate] of Object.entries(EARLY_ADOPTER_RATES)) {
      expect(rate.annualPriceCents, `${tierId} held annual`).toBe(rate.monthlyPriceCents * 10);
      const standard = standardTierRate(tierId as CanonicalArtexTierId);
      expect(standard.annualPriceCents, `${tierId} standard annual`).toBe(standard.monthlyPriceCents * 10);
    }
  });

  it("offers no tier an early adopter rate today", () => {
    // The mechanism stays for a future offer; adding a rate is a pricing change.
    expect(Object.keys(EARLY_ADOPTER_RATES)).toEqual([]);
    expect(isEarlyAdopterEligible("studio")).toBe(false);
    expect(isEarlyAdopterEligible("stage")).toBe(false);
    expect(isEarlyAdopterEligible("collection")).toBe(false);
  });

  it("holds a rate for two calendar years from the subscription date", () => {
    expect(EARLY_ADOPTER_HOLD_YEARS).toBe(2);
    expect(earlyAdopterHoldUntil(Date.UTC(2026, 2, 14))).toBe(Date.UTC(2028, 2, 14));
    // Leap day in, leap day out: a calendar-year step, not a fixed span.
    expect(earlyAdopterHoldUntil(Date.UTC(2028, 1, 29))).toBe(Date.UTC(2030, 2, 1));
  });

  it("resolves the venue alias when reading rates", () => {
    expect(standardTierRate("venue")).toEqual(standardTierRate("stage"));
  });
});
