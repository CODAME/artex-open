import { describe, expect, it } from "vitest";
import {
  SELF_ADMITTED_AUTO_ASSIGNED_REASONS,
  hasActiveCollectorTier,
  isEntitledOrgRole,
  isSelfAdmittedOrgMember,
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

  it("denies a self-admitted member and keeps admins and managers entitled", () => {
    expect(isEntitledOrgRole("member", true)).toBe(false);
    expect(isEntitledOrgRole("member", false)).toBe(true);
    expect(isEntitledOrgRole("member", null)).toBe(true);
    expect(isEntitledOrgRole("admin", true)).toBe(true);
    expect(isEntitledOrgRole("manager", true)).toBe(true);
    expect(isEntitledOrgRole("viewer", false)).toBe(false);
  });
});

// Mirrored case for case in .services/artex-platform-api/entitlement.test.mjs.
describe("isSelfAdmittedOrgMember", () => {
  const cases: Array<[string, Parameters<typeof isSelfAdmittedOrgMember>[0], boolean]> = [
    ["no row", null, false],
    ["the open door (stored marker)", { role: "member", selfAdmitted: true }, true],
    ["an invite (stored marker)", { role: "member", selfAdmitted: false }, false],
    ["an admin-assigned role over a trusted-domain row", { role: "member", selfAdmitted: false, autoAssigned: true, autoAssignedReason: "trusted_domain" }, false],
    ["a trusted-domain row from before the marker", { role: "member", autoAssigned: true, autoAssignedReason: "trusted_domain" }, true],
    ["a ticket row from before 2026-10-29", { role: "viewer", autoAssigned: true, autoAssignedReason: "ticket_purchase" }, true],
    ["a subscription row from before 2026-10-29", { role: "member", autoAssigned: true, autoAssignedReason: "program_subscription" }, true],
    ["a legacy Visitor row", { role: "viewer" }, true],
    ["a Visitor row dues lifted", { role: "member", autoAssigned: true, autoAssignedReason: "ticket_purchase", roleGrantedBy: "org_dues" }, false],
    ["a seat dues created", { role: "member", autoAssigned: true, autoAssignedReason: "org_dues" }, false],
    ["the org creator", { role: "admin", autoAssigned: true, autoAssignedReason: "org-creator" }, false],
    ["a member row from before the marker, no auto-assignment", { role: "member" }, false],
    ["an unlisted reason without the auto flag", { role: "member", autoAssignedReason: "trusted_domain" }, false],
  ];
  for (const [name, member, expected] of cases) {
    it(`${name} → ${String(expected)}`, () => {
      expect(isSelfAdmittedOrgMember(member)).toBe(expected);
    });
  }

  it("names exactly the walk-in reasons", () => {
    expect([...SELF_ADMITTED_AUTO_ASSIGNED_REASONS].sort()).toEqual(
      ["program_subscription", "ticket_purchase", "trusted_domain"],
    );
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

  it("denies the org-member axis to a self-admitted member", () => {
    expect(resolveFullAssetEntitlement({ orgRole: "member", orgMemberSelfAdmitted: true })).toEqual({
      entitled: false,
      reason: "none",
    });
    expect(resolveFullAssetEntitlement({ orgRole: "member", orgMemberSelfAdmitted: false })).toEqual({
      entitled: true,
      reason: "org-member",
    });
  });

  it("still grants a self-admitted member by tier", () => {
    expect(
      resolveFullAssetEntitlement({
        subscriptionTier: "collection",
        subscriptionStatus: "active",
        orgRole: "member",
        orgMemberSelfAdmitted: true,
      }),
    ).toEqual({ entitled: true, reason: "tier" });
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
