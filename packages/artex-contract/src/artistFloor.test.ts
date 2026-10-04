import { describe, expect, it } from "vitest";
import {
  ARTEX_TIERS,
  ARTIST_FLOOR,
  resolveEffectiveTierId,
  roleHasArtistFloor,
  STUDIO_DESKTOP_OPEN_TO_ARTISTS,
  tierAllowsForRole,
  tierLimitForRole,
  type ArtexTierId,
} from "./tiers";

const NOW = Date.parse("2026-10-04T00:00:00Z");

describe("tier table the Artist floor is measured against (R13)", () => {
  it("keeps the plan numbers the owner review recorded", () => {
    const f = (id: ArtexTierId) => ARTEX_TIERS[id].features;
    expect([f("free").maxPublishedPackages, f("free").aiGenerationQuota, f("free").broadcastSendReach]).toEqual([1, 0, 100]);
    expect([f("studio").maxPublishedPackages, f("studio").aiGenerationQuota, f("studio").maxInstallations, f("studio").broadcastSendReach]).toEqual([25, 200, 1, 250]);
    expect([f("stage").maxPublishedPackages, f("stage").aiGenerationQuota, f("stage").maxInstallations, f("stage").orgSeats, f("stage").broadcastSendReach]).toEqual([50, 500, 5, 10, 1000]);
    expect([f("collection").maxPublishedPackages, f("collection").aiGenerationQuota, f("collection").broadcastSendReach]).toEqual([1, 0, 100]);
    expect(f("enterprise").maxPublishedPackages).toBe(-1);
  });

  it("states the floor as five works and twenty AI calls a month", () => {
    expect(ARTIST_FLOOR.maxPublishedPackages).toBe(5);
    expect(ARTIST_FLOOR.aiGenerationQuota).toBe(20);
  });
});

describe("roleHasArtistFloor", () => {
  it("covers artist and admin, never a Visitor or an unknown role", () => {
    expect(roleHasArtistFloor("artist")).toBe(true);
    expect(roleHasArtistFloor("admin")).toBe(true);
    expect(roleHasArtistFloor("viewer")).toBe(false);
    expect(roleHasArtistFloor(null)).toBe(false);
    expect(roleHasArtistFloor(undefined)).toBe(false);
  });
});

describe("tierLimitForRole (max of floor and plan, per dimension)", () => {
  it("gives a Free Artist five works and twenty AI calls", () => {
    expect(tierLimitForRole("free", "maxPublishedPackages", "artist")).toBe(5);
    expect(tierLimitForRole("free", "aiGenerationQuota", "artist")).toBe(20);
  });

  it("lets a plan only add: Studio and Workspace keep their own larger numbers", () => {
    expect(tierLimitForRole("studio", "maxPublishedPackages", "artist")).toBe(25);
    expect(tierLimitForRole("studio", "aiGenerationQuota", "artist")).toBe(200);
    expect(tierLimitForRole("stage", "maxPublishedPackages", "artist")).toBe(50);
    expect(tierLimitForRole("venue", "aiGenerationQuota", "artist")).toBe(500);
  });

  it("never drops an Artist who holds Collection below a free Artist", () => {
    expect(tierLimitForRole("collection", "maxPublishedPackages", "artist")).toBe(5);
    expect(tierLimitForRole("collection", "aiGenerationQuota", "artist")).toBe(20);
  });

  it("keeps unlimited unlimited", () => {
    expect(tierLimitForRole("enterprise", "maxPublishedPackages", "artist")).toBe(-1);
    expect(tierLimitForRole("enterprise", "aiGenerationQuota", "artist")).toBe(-1);
  });

  it("gives a Visitor no floor: a Visitor on Collection has Collection's own numbers", () => {
    expect(tierLimitForRole("collection", "maxPublishedPackages", "viewer")).toBe(1);
    expect(tierLimitForRole("collection", "aiGenerationQuota", "viewer")).toBe(0);
    expect(tierLimitForRole("free", "maxPublishedPackages", "viewer")).toBe(1);
    expect(tierLimitForRole("free", "aiGenerationQuota", "viewer")).toBe(0);
  });

  it("does not touch dimensions the floor does not cover", () => {
    expect(tierLimitForRole("free", "storageQuotaBytes", "artist")).toBe(ARTEX_TIERS.free.features.storageQuotaBytes);
    expect(tierLimitForRole("free", "maxInstallations", "artist")).toBe(0);
    expect(tierLimitForRole("free", "broadcastSendReach", "artist")).toBe(100);
  });

  it("lands an Artist on a lapsed grandfather grace on the floor, not on one work", () => {
    const expired = resolveEffectiveTierId({ subscriptionTier: "free", grandfatheredUntil: NOW - 1 }, NOW);
    expect(expired).toBe("free");
    expect(tierLimitForRole(expired, "maxPublishedPackages", "artist")).toBe(5);
    expect(tierLimitForRole(expired, "aiGenerationQuota", "artist")).toBe(20);
  });

  it("keeps a grandfathered Artist on Studio's numbers until the grace ends", () => {
    const active = resolveEffectiveTierId({ subscriptionTier: "free", grandfatheredUntil: NOW + 1 }, NOW);
    expect(tierLimitForRole(active, "maxPublishedPackages", "artist")).toBe(25);
  });
});

describe("tierAllowsForRole (Studio Desktop while experimental)", () => {
  it("opens sign-in to every Artist on any plan while the flag is on", () => {
    expect(STUDIO_DESKTOP_OPEN_TO_ARTISTS).toBe(true);
    for (const id of ["free", "collection", "studio", "stage", "venue", "enterprise"] as ArtexTierId[]) {
      expect(tierAllowsForRole(id, "studioDesktopAccess", "artist")).toBe(true);
    }
  });

  it("leaves a Visitor on the plan alone, so Collection does not open it", () => {
    expect(tierAllowsForRole("free", "studioDesktopAccess", "viewer")).toBe(false);
    expect(tierAllowsForRole("collection", "studioDesktopAccess", "viewer")).toBe(false);
    expect(tierAllowsForRole("studio", "studioDesktopAccess", "viewer")).toBe(true);
  });

  it("reads every other feature from the plan", () => {
    expect(tierAllowsForRole("free", "customDomains", "artist")).toBe(false);
    expect(tierAllowsForRole("stage", "customDomains", "artist")).toBe(true);
  });
});
