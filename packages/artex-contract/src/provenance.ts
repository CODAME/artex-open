/**
 * The collector's provenance profile — one record of everything they have
 * supported, spanning every organization they collect from.
 *
 * THE PROPERTY THAT MATTERS MOST: the record belongs to the COLLECTOR, not to
 * ARTEX and not to any one org. Two consequences, and neither is negotiable:
 *
 *   1. **Cross-org by default.** One profile spanning every org the member
 *      collects from. Scoping it to a single org would defeat the purpose of the
 *      tier — a receipt list inside one program is what every program already
 *      has, and the whole reason Collection can exist above them is that no
 *      single-org subscription can produce this.
 *   2. **The export is never gated.** It works after cancellation, after a
 *      downgrade, and while a payment is failing. Entitlement gates CAPABILITY,
 *      never POSSESSION. A record you can only keep while you keep paying is not
 *      yours, and selling it as "yours to keep" while holding it hostage would
 *      be the single most corrosive thing this tier could do.
 *
 * Visibility is OPT-IN (monetization plan §7.2): a profile is private until the
 * collector publishes it. Visibility governs only who may READ the profile, and
 * has no bearing on the owner's own export.
 *
 * PURE: assembly and serialization only. No fetching, no auth, no storage.
 *
 * See docs/collection-tier-definition.md.
 */

/** Bumped only on a breaking change to the export's shape. */
export const PROVENANCE_EXPORT_VERSION = 1;

/** Who may read a collector's profile. Private until they choose otherwise. */
export type ProvenanceVisibility = "private" | "public";

/** The default for a profile nobody has published. Opt-in, never opt-out. */
export const DEFAULT_PROVENANCE_VISIBILITY: ProvenanceVisibility = "private";

/** How a work came to be in the collection. */
export type ProvenanceSource = "edition" | "offering" | "order";

/** One work in a collector's record. */
export interface ProvenanceEntry {
  /** The published work. Stable across orgs and programs. */
  workId: string;
  workTitle: string;
  artistName: string;
  /** The org whose program this came through. */
  orgId: string;
  orgName: string;
  /** ISO timestamp of acquisition. */
  acquiredAt: string;
  source: ProvenanceSource;
  /** Edition number where the work was part of a numbered run. */
  editionNumber?: number | null;
  /** The program it came through, when it came through one. */
  programId?: string | null;
}

export interface ProvenanceProfile {
  collectorId: string;
  /** Stable public handle; the profile's URL is built from it. */
  handle: string;
  displayName: string;
  visibility: ProvenanceVisibility;
  /** Every org represented, deduplicated, in first-acquired order. */
  orgs: { orgId: string; orgName: string; count: number }[];
  entries: ProvenanceEntry[];
  /** Total works held. */
  total: number;
  /** ISO timestamp of the earliest acquisition, or null on an empty profile. */
  collectingSince: string | null;
}

const timeOf = (entry: ProvenanceEntry): number => {
  const parsed = Date.parse(entry.acquiredAt);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
};

/**
 * Assemble a profile from raw acquisition records.
 *
 * Entries are ordered newest first, which is what a reader wants; the org
 * summary is ordered by FIRST acquisition, which tells the story of how the
 * collection grew rather than which org happens to be largest.
 *
 * Records with an unparseable `acquiredAt` are kept, not dropped: a work someone
 * owns must never vanish from their own record because a timestamp is
 * malformed. They sort last.
 */
export function buildProvenanceProfile(input: {
  collectorId: string;
  handle: string;
  displayName: string;
  visibility?: ProvenanceVisibility | null;
  entries: readonly ProvenanceEntry[];
}): ProvenanceProfile {
  const entries = [...input.entries].sort((a, b) => timeOf(b) - timeOf(a));

  const byOrg = new Map<string, { orgId: string; orgName: string; count: number; firstMs: number }>();
  for (const entry of entries) {
    const existing = byOrg.get(entry.orgId);
    const ms = timeOf(entry);
    if (existing) {
      existing.count += 1;
      existing.firstMs = Math.min(existing.firstMs, ms);
    } else {
      byOrg.set(entry.orgId, { orgId: entry.orgId, orgName: entry.orgName, count: 1, firstMs: ms });
    }
  }
  const orgs = [...byOrg.values()]
    .sort((a, b) => a.firstMs - b.firstMs)
    .map(({ orgId, orgName, count }) => ({ orgId, orgName, count }));

  const earliest = entries.reduce<number | null>((acc, entry) => {
    const ms = timeOf(entry);
    if (!Number.isFinite(ms)) return acc;
    return acc === null || ms < acc ? ms : acc;
  }, null);

  return {
    collectorId: input.collectorId,
    handle: input.handle,
    displayName: input.displayName,
    visibility: input.visibility ?? DEFAULT_PROVENANCE_VISIBILITY,
    orgs,
    entries,
    total: entries.length,
    collectingSince: earliest === null ? null : new Date(earliest).toISOString(),
  };
}

/** May this profile be shown to somebody other than its owner? */
export function isProvenanceProfilePublic(profile: Pick<ProvenanceProfile, "visibility">): boolean {
  return profile.visibility === "public";
}

/**
 * The machine-readable export.
 *
 * Deliberately takes NO entitlement or subscription argument. There is no
 * parameter here that could make an export smaller, and that is the point: the
 * shape of this function is what makes "your record survives cancellation" a
 * property of the code rather than a promise in a document.
 *
 * `exportedAt` is supplied by the caller rather than read from a clock, so the
 * function stays pure and the output is reproducible in tests.
 */
export function buildProvenanceExport(
  profile: ProvenanceProfile,
  exportedAt: string,
): {
  version: number;
  exportedAt: string;
  collector: { id: string; handle: string; displayName: string };
  collectingSince: string | null;
  total: number;
  orgs: { orgId: string; orgName: string; count: number }[];
  entries: ProvenanceEntry[];
} {
  return {
    version: PROVENANCE_EXPORT_VERSION,
    exportedAt,
    collector: {
      id: profile.collectorId,
      handle: profile.handle,
      displayName: profile.displayName,
    },
    collectingSince: profile.collectingSince,
    total: profile.total,
    orgs: profile.orgs,
    // Every entry, every org. Never filtered by visibility: visibility governs
    // who may READ the profile, never what its owner may take with them.
    entries: profile.entries,
  };
}

/** The profile's stable public path. One place builds it, so links never drift. */
export function provenanceProfilePath(handle: string): string {
  return `/collectors/${encodeURIComponent(handle)}`;
}

/**
 * Is this collector's profile readable by anyone other than its owner?
 *
 * Opt-in: absent, false, or anything that is not exactly `true` means private.
 * Written as an explicit equality rather than the `!== "private"` idiom used by
 * the neighbouring profile sections, because those default to public and this
 * must default to private. See `ProfileVisibility.collectionPublic`.
 */
export function isCollectionProfilePublic(
  profileVisibility: { collectionPublic?: boolean } | null | undefined,
): boolean {
  return profileVisibility?.collectionPublic === true;
}
