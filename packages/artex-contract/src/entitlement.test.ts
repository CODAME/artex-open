import { describe, expect, it } from "vitest";
import {
  hasActiveCollectorTier,
  isEntitledOrgRole,
  resolveFullAssetEntitlement,
} from "./entitlement";

describe("hasActiveCollectorTier", () => {
  it("grants for an active collection tier", () => {
    expect(hasActiveCollectorTier("collection", "active")).toBe(true);
  });

  it("grants for an active enterprise tier", () => {
    expect(hasActiveCollectorTier("enterprise", "active")).toBe(true);
  });

  it("denies tiers without collectorAccess", () => {
    expect(hasActiveCollectorTier("free", "active")).toBe(false);
    expect(hasActiveCollectorTier("studio", "active")).toBe(false);
    expect(hasActiveCollectorTier("stage", "active")).toBe(false);
  });

  it("denies the deprecated `venue` alias (collapses to stage, no collector access)", () => {
    expect(hasActiveCollectorTier("venue", "active")).toBe(false);
  });

  it("denies a collection tier that is not active (resolve-time)", () => {
    expect(hasActiveCollectorTier("collection", "past_due")).toBe(false);
    expect(hasActiveCollectorTier("collection", "canceled")).toBe(false);
    expect(hasActiveCollectorTier("collection", "none")).toBe(false);
    expect(hasActiveCollectorTier("collection", null)).toBe(false);
    expect(hasActiveCollectorTier("collection", undefined)).toBe(false);
  });

  it("denies unknown/null tier values", () => {
    expect(hasActiveCollectorTier("garbage", "active")).toBe(false);
    expect(hasActiveCollectorTier(null, "active")).toBe(false);
    expect(hasActiveCollectorTier(undefined, "active")).toBe(false);
  });
});

describe("isEntitledOrgRole", () => {
  it("grants admin, manager, and member", () => {
    expect(isEntitledOrgRole("admin")).toBe(true);
    expect(isEntitledOrgRole("manager")).toBe(true);
    expect(isEntitledOrgRole("member")).toBe(true);
  });

  it("denies viewer and unknown/null roles", () => {
    expect(isEntitledOrgRole("viewer")).toBe(false);
    expect(isEntitledOrgRole("stranger")).toBe(false);
    expect(isEntitledOrgRole(null)).toBe(false);
    expect(isEntitledOrgRole(undefined)).toBe(false);
  });
});

describe("resolveFullAssetEntitlement", () => {
  it("grants by tier when the collection subscription is active", () => {
    expect(
      resolveFullAssetEntitlement({ subscriptionTier: "collection", subscriptionStatus: "active" }),
    ).toEqual({ entitled: true, reason: "tier" });
  });

  it("grants by ownership regardless of tier/status", () => {
    expect(
      resolveFullAssetEntitlement({
        subscriptionTier: "free",
        subscriptionStatus: "none",
        ownsEdition: true,
      }),
    ).toEqual({ entitled: true, reason: "ownership" });
  });

  it("grants by org membership", () => {
    expect(resolveFullAssetEntitlement({ orgRole: "manager" })).toEqual({
      entitled: true,
      reason: "org-member",
    });
  });

  it("denies when no axis applies", () => {
    expect(
      resolveFullAssetEntitlement({
        subscriptionTier: "free",
        subscriptionStatus: "active",
        ownsEdition: false,
        orgRole: "viewer",
      }),
    ).toEqual({ entitled: false, reason: "none" });
  });

  it("denies an empty input", () => {
    expect(resolveFullAssetEntitlement({})).toEqual({ entitled: false, reason: "none" });
  });

  it("reports ownership before tier when both apply (ownership is permanent)", () => {
    expect(
      resolveFullAssetEntitlement({
        subscriptionTier: "collection",
        subscriptionStatus: "active",
        ownsEdition: true,
      }),
    ).toEqual({ entitled: true, reason: "ownership" });
  });

  it("reports org-member before tier when both apply", () => {
    expect(
      resolveFullAssetEntitlement({
        subscriptionTier: "collection",
        subscriptionStatus: "active",
        orgRole: "member",
      }),
    ).toEqual({ entitled: true, reason: "org-member" });
  });

  it("still grants by tier when org role is a non-entitled viewer", () => {
    expect(
      resolveFullAssetEntitlement({
        subscriptionTier: "collection",
        subscriptionStatus: "active",
        orgRole: "viewer",
      }),
    ).toEqual({ entitled: true, reason: "tier" });
  });
});
