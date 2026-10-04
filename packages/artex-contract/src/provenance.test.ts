import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROVENANCE_VISIBILITY,
  PROVENANCE_EXPORT_VERSION,
  buildProvenanceExport,
  buildProvenanceProfile,
  isCollectionProfilePublic,
  isProvenanceProfilePublic,
  provenanceProfilePath,
  type ProvenanceEntry,
} from "./provenance";

const entry = (over: Partial<ProvenanceEntry> = {}): ProvenanceEntry => ({
  workId: "w1",
  workTitle: "Drift",
  artistName: "Ada",
  orgId: "codame",
  orgName: "CODAME",
  acquiredAt: "2026-03-01T00:00:00.000Z",
  source: "edition",
  ...over,
});

const profileOf = (entries: ProvenanceEntry[], visibility?: "public" | "private") =>
  buildProvenanceProfile({
    collectorId: "u1",
    handle: "ada-collects",
    displayName: "Ada",
    visibility,
    entries,
  });

describe("cross-org by default", () => {
  it("spans every org the collector buys from, in one record", () => {
    // Scoping to a single org would defeat the tier: a receipt list inside one
    // program is what every program already has.
    const profile = profileOf([
      entry({ workId: "a", orgId: "codame", orgName: "CODAME", acquiredAt: "2026-01-01T00:00:00.000Z" }),
      entry({ workId: "b", orgId: "creativa", orgName: "Creativa", acquiredAt: "2026-02-01T00:00:00.000Z" }),
      entry({ workId: "c", orgId: "codame", orgName: "CODAME", acquiredAt: "2026-03-01T00:00:00.000Z" }),
    ]);
    expect(profile.total).toBe(3);
    expect(profile.orgs.map((o) => o.orgId)).toEqual(["codame", "creativa"]);
    expect(profile.orgs[0].count).toBe(2);
  });

  it("orders orgs by first acquisition, telling how the collection grew", () => {
    const profile = profileOf([
      entry({ workId: "a", orgId: "late", orgName: "Late", acquiredAt: "2026-05-01T00:00:00.000Z" }),
      entry({ workId: "b", orgId: "late", orgName: "Late", acquiredAt: "2026-06-01T00:00:00.000Z" }),
      entry({ workId: "c", orgId: "early", orgName: "Early", acquiredAt: "2026-01-01T00:00:00.000Z" }),
    ]);
    // Not by size: `late` has more works but `early` came first.
    expect(profile.orgs.map((o) => o.orgId)).toEqual(["early", "late"]);
  });

  it("lists works newest first and reports when collecting started", () => {
    const profile = profileOf([
      entry({ workId: "old", acquiredAt: "2026-01-01T00:00:00.000Z" }),
      entry({ workId: "new", acquiredAt: "2026-06-01T00:00:00.000Z" }),
    ]);
    expect(profile.entries.map((e) => e.workId)).toEqual(["new", "old"]);
    expect(profile.collectingSince).toBe("2026-01-01T00:00:00.000Z");
  });

  it("keeps a work with a malformed date rather than dropping it", () => {
    // A work somebody owns must never vanish from their own record because a
    // timestamp is bad.
    const profile = profileOf([
      entry({ workId: "good", acquiredAt: "2026-01-01T00:00:00.000Z" }),
      entry({ workId: "bad", acquiredAt: "not a date" }),
    ]);
    expect(profile.total).toBe(2);
    expect(profile.entries.map((e) => e.workId)).toContain("bad");
    expect(profile.collectingSince).toBe("2026-01-01T00:00:00.000Z");
  });

  it("handles an empty collection without inventing a start date", () => {
    const profile = profileOf([]);
    expect(profile.total).toBe(0);
    expect(profile.orgs).toEqual([]);
    expect(profile.collectingSince).toBeNull();
  });
});

describe("visibility is opt-in", () => {
  it("defaults to private", () => {
    expect(DEFAULT_PROVENANCE_VISIBILITY).toBe("private");
    expect(profileOf([entry()]).visibility).toBe("private");
    expect(isProvenanceProfilePublic(profileOf([entry()]))).toBe(false);
  });

  it("becomes readable only when the collector publishes it", () => {
    expect(isProvenanceProfilePublic(profileOf([entry()], "public"))).toBe(true);
  });
});

describe("the export belongs to the collector", () => {
  it("takes no entitlement argument at all, so it cannot be gated", () => {
    // The shape of the function is what makes "survives cancellation" a property
    // of the code rather than a promise in a document.
    expect(buildProvenanceExport.length).toBe(2);
  });

  it("exports the whole record from a private profile", () => {
    // Visibility governs who may READ the profile, never what its owner may take
    // with them.
    const profile = profileOf([
      entry({ workId: "a", orgId: "codame", orgName: "CODAME" }),
      entry({ workId: "b", orgId: "creativa", orgName: "Creativa" }),
    ], "private");
    const exported = buildProvenanceExport(profile, "2026-08-30T00:00:00.000Z");

    expect(exported.version).toBe(PROVENANCE_EXPORT_VERSION);
    expect(exported.total).toBe(2);
    expect(exported.entries).toHaveLength(2);
    expect(exported.orgs.map((o) => o.orgId)).toEqual(["codame", "creativa"]);
    // Nothing in the export hints at, or depends on, a subscription.
    expect(JSON.stringify(exported)).not.toMatch(/subscription|tier|entitle/i);
  });

  it("exports identically whatever the visibility", () => {
    const entries = [entry({ workId: "a" }), entry({ workId: "b", orgId: "creativa", orgName: "Creativa" })];
    const at = "2026-08-30T00:00:00.000Z";
    expect(buildProvenanceExport(profileOf(entries, "private"), at).entries)
      .toEqual(buildProvenanceExport(profileOf(entries, "public"), at).entries);
  });

  it("round-trips as JSON, so the record is machine-readable", () => {
    const exported = buildProvenanceExport(profileOf([entry()]), "2026-08-30T00:00:00.000Z");
    expect(JSON.parse(JSON.stringify(exported))).toEqual(exported);
  });
});

describe("the profile has one stable URL", () => {
  it("builds the path in exactly one place, so links cannot drift", () => {
    expect(provenanceProfilePath("ada-collects")).toBe("/collectors/ada-collects");
  });

  it("encodes a handle that would otherwise break the path", () => {
    expect(provenanceProfilePath("a/b")).toBe("/collectors/a%2Fb");
  });
});

describe("isCollectionProfilePublic", () => {
  it("is private unless explicitly published", () => {
    // Opt-in. Every falsy or missing shape must resolve private, because the
    // profile lists what somebody has bought.
    const shapes: ({ collectionPublic?: boolean } | null | undefined)[] = [
      undefined, null, {}, { collectionPublic: false }, { collectionPublic: undefined },
    ];
    for (const value of shapes) {
      expect(isCollectionProfilePublic(value)).toBe(false);
    }
  });

  it("is public only on an exact true", () => {
    expect(isCollectionProfilePublic({ collectionPublic: true })).toBe(true);
    // Not the `!== "private"` idiom its neighbours use: a truthy non-true value
    // must not publish somebody's purchase history.
    expect(isCollectionProfilePublic({ collectionPublic: "yes" } as unknown as { collectionPublic?: boolean }))
      .toBe(false);
  });
});
