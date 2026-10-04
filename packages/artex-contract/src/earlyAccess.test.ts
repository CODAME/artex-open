import { describe, expect, it } from "vitest";
import {
  COLLECTION_EARLY_ACCESS_HOURS,
  EARLY_ACCESS_MAX_HOURS,
  describeEarlyAccess,
  earlyAccessActionLabel,
  hoursUntilOpen,
  isEarlyAccessOptedOut,
  isValidEarlyAccessHours,
  normalizeEarlyAccessHours,
  resolveEarlyAccessState,
} from "./earlyAccess";

const HOUR = 60 * 60 * 1000;
const OPEN_AT = Date.UTC(2026, 8, 4, 12); // Friday noon
const MEMBERS_AT = OPEN_AT - 48 * HOUR; // Wednesday noon

describe("published bounds", () => {
  it("defaults to 48 hours and caps at seven days", () => {
    expect(COLLECTION_EARLY_ACCESS_HOURS).toBe(48);
    expect(EARLY_ACCESS_MAX_HOURS).toBe(168);
  });

  it("clamps an authored window into the published range", () => {
    expect(normalizeEarlyAccessHours(48)).toBe(48);
    expect(normalizeEarlyAccessHours(999)).toBe(168);
    expect(normalizeEarlyAccessHours(-5)).toBe(0);
  });

  it("floors a fractional window so it cannot round past a bound", () => {
    expect(normalizeEarlyAccessHours(47.9)).toBe(47);
    expect(normalizeEarlyAccessHours(168.9)).toBe(168);
  });

  it("treats an unset window as opted out, never as the default", () => {
    // A program that has not configured early access has not opted IN. Handing
    // it 48 hours here would gate purchases the org never agreed to gate.
    expect(normalizeEarlyAccessHours(undefined)).toBe(0);
    expect(normalizeEarlyAccessHours(null)).toBe(0);
    expect(normalizeEarlyAccessHours("48")).toBe(0);
    expect(normalizeEarlyAccessHours(Number.NaN)).toBe(0);
  });

  it("accepts only whole hours inside the range for storage", () => {
    expect(isValidEarlyAccessHours(0)).toBe(true);
    expect(isValidEarlyAccessHours(168)).toBe(true);
    expect(isValidEarlyAccessHours(169)).toBe(false);
    expect(isValidEarlyAccessHours(-1)).toBe(false);
    expect(isValidEarlyAccessHours(47.5)).toBe(false);
    expect(isValidEarlyAccessHours("48")).toBe(false);
  });

  it("reads zero as a real opt-out rather than a missing value", () => {
    expect(isEarlyAccessOptedOut({ hours: 0 })).toBe(true);
    expect(isEarlyAccessOptedOut(null)).toBe(true);
    expect(isEarlyAccessOptedOut({ hours: 48 })).toBe(false);
  });
});

describe("resolveEarlyAccessState", () => {
  const scheduled = { generalAvailabilityAt: OPEN_AT, earlyAccessHours: 48 };

  it("lets a member buy inside the window and holds everyone else at the door", () => {
    const during = MEMBERS_AT + HOUR;
    const member = resolveEarlyAccessState({ ...scheduled, hasCollectorTier: true }, during);
    const visitor = resolveEarlyAccessState({ ...scheduled, hasCollectorTier: false }, during);

    expect(member.phase).toBe("early-access");
    expect(member.canPurchase).toBe(true);
    expect(visitor.phase).toBe("early-access");
    expect(visitor.canPurchase).toBe(false);
    // The visitor still gets the whole public story: when it opens, and in how long.
    expect(visitor.opensToEveryoneAt).toBe(OPEN_AT);
    expect(visitor.msUntilOpen).toBe(47 * HOUR);
  });

  it("opens to everyone once general availability arrives", () => {
    for (const hasCollectorTier of [true, false]) {
      const state = resolveEarlyAccessState({ ...scheduled, hasCollectorTier }, OPEN_AT);
      expect(state.phase).toBe("open");
      expect(state.canPurchase).toBe(true);
      expect(state.msUntilOpen).toBeNull();
      expect(state.windowActive).toBe(false);
    }
  });

  it("does not let a member buy before the window even opens", () => {
    // The perk is going first, not going early without limit.
    const state = resolveEarlyAccessState(
      { ...scheduled, hasCollectorTier: true },
      MEMBERS_AT - HOUR,
    );
    expect(state.phase).toBe("scheduled");
    expect(state.canPurchase).toBe(false);
  });

  it("opens to everyone at once for a program that opted out", () => {
    const during = MEMBERS_AT + HOUR;
    const state = resolveEarlyAccessState(
      { generalAvailabilityAt: OPEN_AT, earlyAccessHours: 0, hasCollectorTier: false },
      during,
    );
    // No member-only phase exists at all, so a non-member is not turned away by
    // a perk this program does not offer; they simply wait like everyone.
    expect(state.phase).toBe("scheduled");
    expect(state.canPurchase).toBe(false);
    expect(state.opensToMembersAt).toBeNull();
    expect(state.windowActive).toBe(false);
  });

  it("never gates a sale that had no schedule", () => {
    // Everything that shipped before this capability has no
    // generalAvailabilityAt, and must keep selling exactly as it did.
    const state = resolveEarlyAccessState({ hasCollectorTier: false }, OPEN_AT);
    expect(state.phase).toBe("open");
    expect(state.canPurchase).toBe(true);
    expect(state.opensToEveryoneAt).toBeNull();
    expect(state.windowActive).toBe(false);
  });

  it("clamps an over-long window rather than honouring it", () => {
    // Neutrality (R5): the bounds are the whole policy, so a program that stored
    // 30 days gets seven, whoever owns it.
    const state = resolveEarlyAccessState(
      { generalAvailabilityAt: OPEN_AT, earlyAccessHours: 720, hasCollectorTier: true },
      OPEN_AT - 200 * HOUR,
    );
    expect(state.phase).toBe("scheduled");
    expect(state.opensToMembersAt).toBe(OPEN_AT - EARLY_ACCESS_MAX_HOURS * HOUR);
  });

  it("reports windowActive only while a real window is running", () => {
    const during = MEMBERS_AT + HOUR;
    expect(resolveEarlyAccessState({ ...scheduled }, during).windowActive).toBe(true);
    expect(resolveEarlyAccessState({ ...scheduled }, OPEN_AT).windowActive).toBe(false);
    expect(resolveEarlyAccessState({ ...scheduled }, MEMBERS_AT - HOUR).windowActive).toBe(false);
  });
});

describe("public copy", () => {
  const OPEN = Date.UTC(2026, 8, 4, 12);
  const MEMBERS = OPEN - 48 * HOUR;

  it("tells a visitor when it opens and that members are in already", () => {
    const state = resolveEarlyAccessState(
      { generalAvailabilityAt: OPEN, earlyAccessHours: 48, hasCollectorTier: false },
      MEMBERS + HOUR,
    );
    expect(hoursUntilOpen(state)).toBe(47);
    expect(describeEarlyAccess(state)).toBe(
      "Opens to everyone in 47h. ARTEX Collection members can buy it now.",
    );
  });

  it("says nothing at all once the work is open", () => {
    const state = resolveEarlyAccessState({ generalAvailabilityAt: OPEN }, OPEN);
    expect(describeEarlyAccess(state)).toBeNull();
  });

  it("does not advertise the tier on a program that opted out", () => {
    const state = resolveEarlyAccessState(
      { generalAvailabilityAt: OPEN, earlyAccessHours: 0 },
      MEMBERS + HOUR,
    );
    expect(describeEarlyAccess(state)).toBe("Opens in 47h.");
    expect(describeEarlyAccess(state)).not.toContain("Collection");
  });

  it("keeps the buy control present and honest rather than removing it", () => {
    // A missing button reads as the work being gone, which is the impression the
    // whole capability is built to avoid.
    const during = MEMBERS + HOUR;
    const member = resolveEarlyAccessState(
      { generalAvailabilityAt: OPEN, earlyAccessHours: 48, hasCollectorTier: true }, during,
    );
    const visitor = resolveEarlyAccessState(
      { generalAvailabilityAt: OPEN, earlyAccessHours: 48, hasCollectorTier: false }, during,
    );
    const early = resolveEarlyAccessState(
      { generalAvailabilityAt: OPEN, earlyAccessHours: 48 }, MEMBERS - HOUR,
    );
    expect(earlyAccessActionLabel(member, "Express interest")).toBe("Express interest");
    expect(earlyAccessActionLabel(visitor, "Express interest")).toBe("Members only for now");
    expect(earlyAccessActionLabel(early, "Express interest")).toBe("Not open yet");
  });

  it("never leaks an internal phase value into copy", () => {
    for (const nowMs of [MEMBERS - HOUR, MEMBERS + HOUR]) {
      const state = resolveEarlyAccessState(
        { generalAvailabilityAt: OPEN, earlyAccessHours: 48 }, nowMs,
      );
      const copy = `${describeEarlyAccess(state) ?? ""} ${earlyAccessActionLabel(state, "Buy")}`;
      for (const leak of ["early-access", "scheduled", "canPurchase", "undefined", "null"]) {
        expect(copy).not.toContain(leak);
      }
    }
  });
});
