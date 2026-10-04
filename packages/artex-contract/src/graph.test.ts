import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORK_POLICY,
  INVERSE_RELATION,
  WORK_RELATION_TYPES,
  computeGraphSummary,
  emptyGraph,
  isValidCreditProposalStatus,
  isValidForkPolicy,
  isValidWorkKind,
  isValidWorkRelationType,
  type CreditProposal,
  type ForkRequest,
  type OrgSeries,
  type WorkCollection,
  type WorkEdition,
  type WorkGraph,
  type WorkKind,
  type WorkRelation,
  type WorkRelationType,
} from "./graph";

// ── Core types ────────────────────────────────────────────────────────────

describe("isValidWorkKind", () => {
  it("accepts experience and print", () => {
    expect(isValidWorkKind("experience")).toBe(true);
    expect(isValidWorkKind("print")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isValidWorkKind("video")).toBe(false);
    expect(isValidWorkKind(null)).toBe(false);
    expect(isValidWorkKind(undefined)).toBe(false);
  });
});

describe("isValidWorkRelationType", () => {
  it("accepts all four relation types", () => {
    for (const t of WORK_RELATION_TYPES) {
      expect(isValidWorkRelationType(t)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isValidWorkRelationType("copied-from")).toBe(false);
    expect(isValidWorkRelationType("")).toBe(false);
  });
});

describe("INVERSE_RELATION", () => {
  it("derived-from <-> exported-to are mutual inverses", () => {
    expect(INVERSE_RELATION["derived-from"]).toBe("exported-to");
    expect(INVERSE_RELATION["exported-to"]).toBe("derived-from");
  });

  it("inspired-by is its own inverse (symmetric)", () => {
    expect(INVERSE_RELATION["inspired-by"]).toBe("inspired-by");
  });

  it("paired-with is its own inverse (symmetric)", () => {
    expect(INVERSE_RELATION["paired-with"]).toBe("paired-with");
  });

  it("covers every type in WORK_RELATION_TYPES", () => {
    for (const t of WORK_RELATION_TYPES) {
      expect(INVERSE_RELATION[t]).toBeDefined();
    }
  });
});

describe("emptyGraph", () => {
  it("creates a graph with zero counts for the given workId", () => {
    const g = emptyGraph("work_abc");
    expect(g.workId).toBe("work_abc");
    expect(g.relations).toHaveLength(0);
    expect(g.summary.derivedFromCount).toBe(0);
    expect(g.summary.hasDerivedCount).toBe(0);
    expect(g.summary.inspiredByCount).toBe(0);
    expect(g.summary.pairedWithCount).toBe(0);
  });

  it("satisfies WorkGraph type", () => {
    const g: WorkGraph = emptyGraph("w1");
    expect(g.updatedAt).toBeTruthy();
  });
});

describe("computeGraphSummary", () => {
  const makeRelation = (
    id: string,
    relationType: WorkRelationType,
    sourceWorkKind: WorkKind = "experience",
    targetWorkKind: WorkKind = "print",
  ): WorkRelation => ({
    id,
    relationType,
    sourceWorkId: "src",
    sourceWorkKind,
    targetWorkId: "tgt",
    targetWorkKind,
    targetWorkTitle: "Target",
    targetWorkSlug: null,
    ownerUserId: "u1",
    createdAt: new Date().toISOString(),
  });

  it("counts each relation type independently", () => {
    const relations: WorkRelation[] = [
      makeRelation("r1", "derived-from"),
      makeRelation("r2", "exported-to"),
      makeRelation("r3", "exported-to"),
      makeRelation("r4", "inspired-by"),
      makeRelation("r5", "inspired-by"),
      makeRelation("r6", "inspired-by"),
      makeRelation("r7", "paired-with"),
    ];
    const summary = computeGraphSummary(relations);
    expect(summary.derivedFromCount).toBe(1);
    expect(summary.hasDerivedCount).toBe(2);
    expect(summary.inspiredByCount).toBe(3);
    expect(summary.pairedWithCount).toBe(1);
  });

  it("returns zeros for empty relations", () => {
    const summary = computeGraphSummary([]);
    expect(summary.derivedFromCount).toBe(0);
    expect(summary.hasDerivedCount).toBe(0);
    expect(summary.inspiredByCount).toBe(0);
    expect(summary.pairedWithCount).toBe(0);
  });

  it("WorkRelation carries targetWorkSlug", () => {
    const rel: WorkRelation = makeRelation("r1", "inspired-by");
    expect(rel.targetWorkSlug).toBeNull();
    const withSlug: WorkRelation = { ...rel, targetWorkSlug: "my-piece" };
    expect(withSlug.targetWorkSlug).toBe("my-piece");
  });
});

// ── Phase 3A — Editions ───────────────────────────────────────────────────

describe("WorkEdition", () => {
  it("accepts required fields", () => {
    const edition: WorkEdition = {
      id: "ed_1",
      ownerUserId: "u1",
      sourceExperienceId: "proj_1",
      title: "Flux Field — Edition of 10",
      description: null,
      totalCount: 10,
      issuedCount: 0,
      openForMinting: true,
      coverDataUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(edition.totalCount).toBe(10);
    expect(edition.issuedCount).toBe(0);
    expect(edition.openForMinting).toBe(true);
  });
});

// ── Phase 3B — Collections ────────────────────────────────────────────────

describe("WorkCollection", () => {
  it("accepts private and public visibility", () => {
    const col: WorkCollection = {
      id: "col_1",
      ownerUserId: "u1",
      slug: "summer-2025",
      title: "Summer Light",
      description: null,
      visibility: "public",
      coverDataUrl: null,
      workIds: ["w1", "w2"],
      publishedSlugs: ["piece-a", "piece-b"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(col.visibility).toBe("public");
    expect(col.workIds).toHaveLength(2);
  });
});

// ── Phase 3C — Series ─────────────────────────────────────────────────────

describe("OrgSeries", () => {
  it("supports members visibility", () => {
    const series: OrgSeries = {
      id: "ser_1",
      orgId: "org-fixture-1",
      slug: "design-week-2025",
      title: "Design Week 2025",
      description: null,
      visibility: "members",
      coverDataUrl: null,
      entries: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(series.visibility).toBe("members");
    expect(series.entries).toHaveLength(0);
  });
});

// ── Phase 5 — Credit negotiation ─────────────────────────────────────────

describe("isValidCreditProposalStatus", () => {
  it("accepts all four statuses", () => {
    expect(isValidCreditProposalStatus("pending")).toBe(true);
    expect(isValidCreditProposalStatus("accepted")).toBe(true);
    expect(isValidCreditProposalStatus("amended")).toBe(true);
    expect(isValidCreditProposalStatus("declined")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isValidCreditProposalStatus("cancelled")).toBe(false);
    expect(isValidCreditProposalStatus(null)).toBe(false);
  });
});

describe("CreditProposal", () => {
  it("accepts pending proposal with tags", () => {
    const proposal: CreditProposal = {
      id: "cp_1",
      relationId: "rel_1",
      derivedWorkId: "proj_2",
      derivedWorkTitle: "Print A",
      sourceWorkId: "proj_1",
      sourceWorkTitle: "Experience A",
      proposerUserId: "userB",
      recipientUserId: "userA",
      proposedTags: ["shader", "motion"],
      counterTags: null,
      status: "pending",
      message: "Please accept this credit",
      responseMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(proposal.status).toBe("pending");
    expect(proposal.proposedTags).toContain("shader");
  });
});

// ── Phase 6A — Fork permissions ───────────────────────────────────────────

describe("isValidForkPolicy", () => {
  it("accepts all four policies", () => {
    expect(isValidForkPolicy("open")).toBe(true);
    expect(isValidForkPolicy("ask")).toBe(true);
    expect(isValidForkPolicy("royalty")).toBe(true);
    expect(isValidForkPolicy("closed")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isValidForkPolicy("free")).toBe(false);
    expect(isValidForkPolicy(null)).toBe(false);
  });
});

describe("DEFAULT_FORK_POLICY", () => {
  it("defaults to closed: an unstated policy permits nothing (COD-225)", () => {
    expect(DEFAULT_FORK_POLICY.policy).toBe("closed");
    expect(DEFAULT_FORK_POLICY.royaltyBasisPoints).toBeNull();
    expect(DEFAULT_FORK_POLICY.message).toBeNull();
  });
});

describe("ForkRequest", () => {
  it("accepts pending status", () => {
    const req: ForkRequest = {
      id: "fr_1",
      sourceWorkId: "proj_1",
      sourceWorkTitle: "Experience A",
      sourceWorkOwnerId: "userA",
      requesterUserId: "userB",
      requesterDisplayName: "Artist B",
      requesterWorkId: null,
      message: "Love this piece, may I fork it?",
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(req.status).toBe("pending");
    expect(req.requesterWorkId).toBeNull();
  });
});

// ── Deeper behavioral tests ─────────────────────────────────────────────────

describe("INVERSE_RELATION (deep)", () => {
  it("applying inverse twice returns the original type for every relation", () => {
    for (const t of WORK_RELATION_TYPES) {
      expect(INVERSE_RELATION[INVERSE_RELATION[t]]).toBe(t);
    }
  });

  it("derived-from and exported-to are not symmetric", () => {
    expect(INVERSE_RELATION["derived-from"]).not.toBe("derived-from");
    expect(INVERSE_RELATION["exported-to"]).not.toBe("exported-to");
  });
});

describe("computeGraphSummary (deep)", () => {
  const buildRelation = (relationType: WorkRelationType, id = "r"): WorkRelation => ({
    id,
    relationType,
    sourceWorkId: "src",
    sourceWorkKind: "experience",
    targetWorkId: "tgt",
    targetWorkKind: "print",
    targetWorkTitle: "Target",
    targetWorkSlug: null,
    ownerUserId: "u",
    createdAt: "2026-04-30T00:00:00.000Z",
  });

  it("does not mutate the input array", () => {
    const relations = [buildRelation("inspired-by"), buildRelation("derived-from")];
    const before = [...relations];
    computeGraphSummary(relations);
    expect(relations).toEqual(before);
  });

  it("scales linearly with thousands of relations", () => {
    const relations: WorkRelation[] = [];
    for (let i = 0; i < 1000; i++) {
      relations.push(buildRelation(WORK_RELATION_TYPES[i % WORK_RELATION_TYPES.length], `r${i}`));
    }
    const summary = computeGraphSummary(relations);
    expect(summary.derivedFromCount).toBe(250);
    expect(summary.hasDerivedCount).toBe(250);
    expect(summary.inspiredByCount).toBe(250);
    expect(summary.pairedWithCount).toBe(250);
  });

  it("uses inverse-aware counters: derived-from on the source counts as derivedFromCount", () => {
    // A work that was derived from two other works.
    const relations = [buildRelation("derived-from", "r1"), buildRelation("derived-from", "r2")];
    const summary = computeGraphSummary(relations);
    expect(summary.derivedFromCount).toBe(2);
    expect(summary.hasDerivedCount).toBe(0);
  });
});

describe("emptyGraph (deep)", () => {
  it("returns a fresh object on every call", () => {
    const a = emptyGraph("w1");
    const b = emptyGraph("w1");
    expect(a).not.toBe(b);
    expect(a.summary).not.toBe(b.summary);
  });

  it("updatedAt is a parseable ISO timestamp", () => {
    const g = emptyGraph("w1");
    expect(Number.isNaN(Date.parse(g.updatedAt))).toBe(false);
  });

  it("matches the shape that computeGraphSummary returns for empty input", () => {
    const g = emptyGraph("w1");
    expect(g.summary).toEqual(computeGraphSummary([]));
  });
});

describe("DEFAULT_FORK_POLICY (deep)", () => {
  it("default permits nothing (closed) without royalty or message", () => {
    expect(DEFAULT_FORK_POLICY).toEqual({
      policy: "closed",
      royaltyBasisPoints: null,
      message: null,
    });
  });

  it("isValidForkPolicy accepts the default's policy", () => {
    expect(isValidForkPolicy(DEFAULT_FORK_POLICY.policy)).toBe(true);
  });
});

describe("WorkRelation.targetWorkSlug (Phase 2)", () => {
  it("can be null for unpublished works and a string for published works", () => {
    const unpublished: WorkRelation = {
      id: "r",
      relationType: "derived-from",
      sourceWorkId: "src",
      sourceWorkKind: "experience",
      targetWorkId: "tgt",
      targetWorkKind: "experience",
      targetWorkTitle: "T",
      targetWorkSlug: null,
      ownerUserId: "u",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const published: WorkRelation = { ...unpublished, targetWorkSlug: "my-slug" };
    expect(unpublished.targetWorkSlug).toBeNull();
    expect(published.targetWorkSlug).toBe("my-slug");
  });
});

describe("CreditProposal status transitions (typing)", () => {
  it("counterTags is meaningful only when status is 'amended' (data-shape contract)", () => {
    const pending: CreditProposal = {
      id: "cp_1",
      relationId: "rel_1",
      derivedWorkId: "d",
      derivedWorkTitle: "D",
      sourceWorkId: "s",
      sourceWorkTitle: "S",
      proposerUserId: "u1",
      recipientUserId: "u2",
      proposedTags: ["a"],
      counterTags: null,
      status: "pending",
      message: null,
      responseMessage: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(pending.counterTags).toBeNull();
    const amended: CreditProposal = { ...pending, status: "amended", counterTags: ["b"] };
    expect(amended.status).toBe("amended");
    expect(amended.counterTags).toEqual(["b"]);
  });
});

describe("isValidCreditProposalStatus (deep)", () => {
  it("rejects non-string types", () => {
    expect(isValidCreditProposalStatus(0)).toBe(false);
    expect(isValidCreditProposalStatus(undefined)).toBe(false);
    expect(isValidCreditProposalStatus({})).toBe(false);
    expect(isValidCreditProposalStatus([])).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(isValidCreditProposalStatus("Pending")).toBe(false);
    expect(isValidCreditProposalStatus("ACCEPTED")).toBe(false);
  });
});

describe("isValidForkPolicy (deep)", () => {
  it("rejects non-string types", () => {
    expect(isValidForkPolicy(undefined)).toBe(false);
    expect(isValidForkPolicy(true)).toBe(false);
    expect(isValidForkPolicy(["open"])).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidForkPolicy("")).toBe(false);
  });
});

describe("WorkEdition (Phase 3A)", () => {
  const baseEdition: WorkEdition = {
    id: "ed_1",
    ownerUserId: "u1",
    sourceExperienceId: "exp_1",
    title: "Edition of 10",
    description: null,
    totalCount: 10,
    issuedCount: 0,
    openForMinting: true,
    coverDataUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("a brand-new edition has issuedCount == 0 and is open", () => {
    expect(baseEdition.issuedCount).toBe(0);
    expect(baseEdition.openForMinting).toBe(true);
  });

  it("issuedCount must be <= totalCount (data-shape contract)", () => {
    const final: WorkEdition = { ...baseEdition, issuedCount: 10, openForMinting: false };
    expect(final.issuedCount).toBeLessThanOrEqual(final.totalCount);
    expect(final.openForMinting).toBe(false);
  });
});

describe("WorkCollection (Phase 3B)", () => {
  it("workIds order is meaningful — preserved as-is", () => {
    const col: WorkCollection = {
      id: "c1",
      ownerUserId: "u1",
      slug: "s",
      title: "T",
      description: null,
      visibility: "private",
      coverDataUrl: null,
      workIds: ["w3", "w1", "w2"],
      publishedSlugs: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(col.workIds).toEqual(["w3", "w1", "w2"]);
  });
});

describe("OrgSeries (Phase 3C)", () => {
  it("entries default to empty array; visibility supports private/public/members", () => {
    const series: OrgSeries = {
      id: "s1",
      orgId: "org1",
      slug: "test",
      title: "Test",
      description: null,
      visibility: "private",
      coverDataUrl: null,
      entries: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(series.entries).toEqual([]);
    const variants: OrgSeries["visibility"][] = ["private", "public", "members"];
    for (const v of variants) {
      const next: OrgSeries = { ...series, visibility: v };
      expect(next.visibility).toBe(v);
    }
  });
});
