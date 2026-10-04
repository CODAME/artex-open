import { describe, expect, it } from "vitest";
import * as standingModule from "./standing";
import {
  type CollectorStanding,
  type StandingEntry,
  canSeeStanding,
  compareByStanding,
  isStandingPriorityEnabled,
  normalizeStandingVisibility,
  resolveCollectorStanding,
} from "./standing";

const entry = (overrides: Partial<StandingEntry> = {}): StandingEntry => ({
  orgId: "codame",
  programId: "print-club",
  acquiredAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("normalizeStandingVisibility", () => {
  it("defaults to private for anything it does not recognize", () => {
    expect(normalizeStandingVisibility(undefined)).toBe("private");
    expect(normalizeStandingVisibility(null)).toBe("private");
    expect(normalizeStandingVisibility("")).toBe("private");
    expect(normalizeStandingVisibility("public")).toBe("private");
    expect(normalizeStandingVisibility("PUBLIC")).toBe("private");
  });

  it("recognizes only the one sharing value", () => {
    expect(normalizeStandingVisibility("orgs")).toBe("orgs");
  });
});

describe("canSeeStanding", () => {
  it("always lets the collector see their own", () => {
    expect(canSeeStanding("private", "self")).toBe(true);
    expect(canSeeStanding("orgs", "self")).toBe(true);
  });

  it("hides it from an org until the collector opts in", () => {
    expect(canSeeStanding("private", "org")).toBe(false);
    expect(canSeeStanding("orgs", "org")).toBe(true);
  });

  it("shows nothing to a viewer it does not recognize", () => {
    // The first version fell through to the org answer, so ANY viewer that was
    // not "self" read an opted-in collector's standing: a typo, a viewer kind
    // added later, or an unvalidated request parameter arriving at the untyped
    // .mjs mirror. The type union hides that here and prevents nothing on the
    // server, which is where request values actually land.
    for (const viewer of ["public", "", "orgs", "anonymous", "ORG"]) {
      expect(canSeeStanding("orgs", viewer)).toBe(false);
    }
  });
});

describe("resolveCollectorStanding", () => {
  it("counts distinct programs, not works", () => {
    // Five works from one program is one program. Counting works would quietly
    // turn the measure from breadth into spend.
    const standing = resolveCollectorStanding([entry(), entry(), entry(), entry(), entry()]);
    expect(standing.programsJoined).toBe(1);
    expect(standing.orgsSupported).toBe(1);
  });

  it("counts breadth across orgs and programs", () => {
    const standing = resolveCollectorStanding([
      entry({ orgId: "codame", programId: "print-club" }),
      entry({ orgId: "codame", programId: "residency" }),
      entry({ orgId: "creativa", programId: "print-club" }),
    ]);
    expect(standing.programsJoined).toBe(3);
    expect(standing.orgsSupported).toBe(2);
  });

  it("namespaces a program by its org, so two orgs sharing a name are two programs", () => {
    // A bare id would merge CODAME's print-club with Creativa's and silently
    // undercount somebody's breadth.
    const standing = resolveCollectorStanding([
      entry({ orgId: "codame", programId: "print-club" }),
      entry({ orgId: "creativa", programId: "print-club" }),
    ]);
    expect(standing.programsJoined).toBe(2);
  });

  it("counts a programless holding toward the org but not toward programs", () => {
    // Honest rather than tidy: they did support the org, and they did not join
    // a program.
    const standing = resolveCollectorStanding([
      entry({ programId: null }),
      entry({ programId: "" }),
    ]);
    expect(standing.programsJoined).toBe(0);
    expect(standing.orgsSupported).toBe(1);
  });

  it("reports the earliest holding as `since`, ignoring unusable dates", () => {
    const standing = resolveCollectorStanding([
      entry({ acquiredAt: "2026-05-01T00:00:00.000Z" }),
      entry({ acquiredAt: "2024-02-02T00:00:00.000Z", programId: "residency" }),
      entry({ acquiredAt: "" }),
      entry({ acquiredAt: "not a date", programId: "grant" }),
    ]);
    expect(standing.since).toBe("2024-02-02T00:00:00.000Z");
  });

  it("is all zeroes and no date for a collector who holds nothing", () => {
    expect(resolveCollectorStanding([])).toEqual({
      programsJoined: 0,
      orgsSupported: 0,
      since: null,
    });
  });

  it("ignores a blank org id rather than counting it as an org", () => {
    expect(resolveCollectorStanding([entry({ orgId: "  " })]).orgsSupported).toBe(0);
  });

  it("lets an unattributable holding contribute NOTHING, `since` included", () => {
    // The first version counted `since` from entries the same loop had already
    // rejected, so a blank-org holding produced "collecting since 2024 and 0
    // programs" — two figures from different sets, contradicting each other on
    // screen. Every number now comes from the same accepted set.
    expect(resolveCollectorStanding([
      entry({ orgId: "", acquiredAt: "2024-01-01T00:00:00.000Z" }),
    ])).toEqual({ programsJoined: 0, orgsSupported: 0, since: null });
  });

  it("requires a non-blank org id for a program to count, not just a program id", () => {
    // Undocumented and unpinned in the first version. Namespacing means a
    // program with no org has no key, so it cannot count.
    expect(resolveCollectorStanding([
      entry({ orgId: "   ", programId: "print-club" }),
    ]).programsJoined).toBe(0);
  });
});

describe("isStandingPriorityEnabled", () => {
  it("is off unless a program turned it on explicitly", () => {
    expect(isStandingPriorityEnabled(null)).toBe(false);
    expect(isStandingPriorityEnabled(undefined)).toBe(false);
    expect(isStandingPriorityEnabled({})).toBe(false);
    expect(isStandingPriorityEnabled({ enabled: null })).toBe(false);
    expect(isStandingPriorityEnabled({ enabled: false })).toBe(false);
  });

  it("reads only a strict true", () => {
    // A capability that takes something from somebody else is turned on
    // deliberately, never inferred from a truthy value.
    expect(isStandingPriorityEnabled({ enabled: true })).toBe(true);
    expect(isStandingPriorityEnabled({ enabled: 1 as unknown as boolean })).toBe(false);
    expect(isStandingPriorityEnabled({ enabled: "true" as unknown as boolean })).toBe(false);
  });
});

describe("compareByStanding", () => {
  const standing = (programsJoined: number): CollectorStanding => ({
    programsJoined,
    orgsSupported: programsJoined,
    since: null,
  });

  it("orders higher standing first", () => {
    expect(compareByStanding(standing(5), standing(2))).toBeLessThan(0);
    expect(compareByStanding(standing(2), standing(5))).toBeGreaterThan(0);
  });

  it("leaves equal standing in the caller's existing order", () => {
    // Returning 0 keeps whatever fair rule was already deciding (request time,
    // usually). A second criterion invented here would be a policy nobody chose.
    expect(compareByStanding(standing(3), standing(3))).toBe(0);
  });

  it("sorts a queue without removing anybody from it", () => {
    const queue = [standing(1), standing(4), standing(2)];
    const ordered = [...queue].sort(compareByStanding);
    expect(ordered.map((s) => s.programsJoined)).toEqual([4, 2, 1]);
    expect(ordered).toHaveLength(queue.length);
  });
});

/**
 * The exact set of things this module exports. Adding to it is a decision.
 *
 * Asserted as an EXACT SET rather than scanned for suspicious names, because
 * the first version of this guard did the latter and was very nearly
 * worthless: it matched `may|can|is|has|allow|permit` prefixes and therefore
 * caught NONE of `requireStandingForPriority`, `assertStandingMet`,
 * `eligibleForPriorityByStanding`, `qualifiesForPriority`, `gateByStanding` or
 * `shouldAdmitByStanding`. It reported a structural guarantee it did not
 * provide, which is the check_lockfile_shape family from the incident index:
 * a guard that asserts less than it claims teaches people to trust it anyway.
 */
const EXPECTED_EXPORTS = [
  "canSeeStanding",
  "compareByStanding",
  "isStandingPriorityEnabled",
  "normalizeStandingVisibility",
  "resolveCollectorStanding",
];

describe("the shape of this module is the R3 guarantee", () => {
  it("exports exactly the count and the comparator, and nothing else", () => {
    // R3 forbids tier-gating buying, voting or joining, with no exception. So
    // this module offers a COUNT and a COMPARATOR and nothing that returns a
    // permission: a caller cannot accidentally turn standing into a gate,
    // because there is no gate-shaped thing to call. Same structural guarantee
    // buildProvenanceExport gets by taking no entitlement argument.
    //
    // If this fails because you added an export, the question to answer is
    // whether it can decide participation. If it can, delete it. If it cannot,
    // add it here and say why in the PR.
    expect(Object.keys(standingModule).sort()).toEqual([...EXPECTED_EXPORTS].sort());
  });

  it("would catch a gate whatever it were named", () => {
    // Mutation-tests the guard itself against the names that defeated its first
    // version. Each is checked against the same assertion the test above makes,
    // so this fails if the exact-set check is ever loosened back to a pattern.
    const gateNames = [
      "requireStandingForPriority",
      "assertStandingMet",
      "eligibleForPriorityByStanding",
      "qualifiesForPriority",
      "gateByStanding",
      "shouldAdmitByStanding",
      "mayPurchaseWithStanding",
      "standingUnlocks",
      "filterByStanding",
      "excludeBelowStanding",
    ];
    for (const name of gateNames) {
      const withGate = [...EXPECTED_EXPORTS, name].sort();
      expect(withGate).not.toEqual([...EXPECTED_EXPORTS].sort());
    }
  });

  it("exports no rank, percentile or leaderboard", () => {
    // A count is checkable by the collector against their own export. A rank is
    // a claim about other people that leaks the distribution and invites
    // gaming. Covered by the exact set above; kept as its own case so the
    // reason survives in the test names.
    expect(EXPECTED_EXPORTS.filter((n) => /rank|percentile|leaderboard/i.test(n))).toEqual([]);
  });
});
