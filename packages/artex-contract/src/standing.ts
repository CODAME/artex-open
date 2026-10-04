/**
 * Collector standing — recognizing a member's participation across programs
 * when they arrive at one they have never joined.
 *
 * The fourth and last of Collection's cross-program perks (#3120). It shipped
 * last on purpose: a surface built on an undefined measure would only have to be
 * unbuilt, so the measure and its limits are settled here before any screen
 * reads them.
 *
 * THREE DECISIONS, all owner-settled (2026-09-07), and each one is a constraint
 * on this module rather than a note about it:
 *
 * 1. **What is counted: programs joined.** Breadth, not spend and not tenure.
 *    It matches the tier's own argument — Collection is the layer above every
 *    program — and it is the privacy-cheapest of the options, being a count of
 *    memberships rather than a measure of money.
 * 2. **Who can see it: the collector always; an org only on opt-in.** Default
 *    private. Standing derived from purchases IS purchase history, and the
 *    provenance profile beside it is private by default for exactly that reason.
 * 3. **What it unlocks: per-program opt-in priority, and nothing else.**
 *    Priority in a genuinely capacity-limited situation, configured per program,
 *    with a real unpenalized off state.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT EXPORT, and the reason it is written
 * this way rather than merely documented:
 *
 * There is no function here that answers "may this person buy / vote / join".
 * R3 forbids tier-gating ordinary participation with no exception, so the
 * module offers a COUNT and a COMPARATOR and nothing that returns a
 * permission. A caller cannot accidentally turn standing into a gate, because
 * there is no gate-shaped thing to call. That is the same structural guarantee
 * `buildProvenanceExport` gets by taking no entitlement argument: the promise
 * is kept by the shape, not by everyone remembering it.
 *
 * There is also no rank, no percentile and no leaderboard. A count is something
 * the collector can check against their own provenance export; a rank is a
 * claim about other people that leaks the distribution and invites gaming.
 *
 * PURE and dependency-light like its neighbours: the platform API is standalone
 * `.mjs` and cannot import this package, and the platform API is the only thing
 * that can compute standing (the entries live in Firestore). So the logic is
 * mirrored in `.services/artex-platform-api/standing.mjs`, whose test reads
 * THIS file and fails when the two drift.
 *
 * See docs/collection-tier-definition.md and #3120.
 */

/**
 * Who is asking to see a collector's standing.
 *
 * There is no `public` member, and its absence is the decision: standing is
 * never world-readable, so no configuration can make it so. Adding one would
 * mean revisiting decision 2 above, not extending this type.
 */
export type StandingViewer = "self" | "org";

/**
 * The collector's own choice about who sees their standing.
 *
 * `"private"` is the DEFAULT and the value an absent field resolves to. Named
 * for the sharing state rather than the hiding state on purpose: the sibling
 * `profileVisibility.collectionPublic` is a boolean named for its true case for
 * the same reason, because a private-by-default key sitting in a
 * public-by-default map is how somebody's purchase history gets published by a
 * copied idiom.
 */
export type StandingVisibility = "private" | "orgs";

/** Normalize a stored visibility value. Anything unrecognized is private. */
export function normalizeStandingVisibility(
  value: string | null | undefined,
): StandingVisibility {
  return value === "orgs" ? "orgs" : "private";
}

/**
 * May this viewer see this collector's standing?
 *
 * The collector always can: it is theirs, and standing they cannot inspect is
 * standing they cannot check against their own export.
 */
export function canSeeStanding(
  // Both parameters accept an arbitrary string as well as their union, and that
  // is deliberate rather than lax. `string & {}` keeps the union's autocomplete
  // while letting an unvalidated value through the type — the same idiom
  // `entitlement.ts` and `planState.ts` use for a stored tier id.
  //
  // Without it, TypeScript narrows the `"org"` test below to "always true" and
  // ESLint removes it as dead code, which is precisely how the fail-open got
  // written the first time: a two-branch version treats every viewer that is
  // not `"self"` as an org. The branch is unreachable in typed code and load
  // bearing in the untyped `.mjs` mirror, which is the copy that receives
  // request-derived strings.
  visibility: StandingVisibility | (string & {}),
  viewer: StandingViewer | (string & {}),
): boolean {
  if (viewer === "self") return true;
  if (viewer === "org") return visibility === "orgs";
  // An unknown viewer sees NOTHING. Written as an explicit third branch rather
  // than falling through to the org answer, because the fallthrough version
  // failed OPEN: any viewer string that was not "self" — a typo, a viewer kind
  // added later, an unvalidated request parameter reaching the untyped `.mjs`
  // mirror — read an opted-in collector's standing as an org would. The type
  // union prevents that here and prevents nothing on the server.
  return false;
}

/**
 * What standing is computed FROM: one row per thing the collector holds, which
 * is exactly what the provenance profile already assembles.
 *
 * Taking the entries rather than a pre-counted number keeps the derivation in
 * one place and keeps the promise in decision 1 checkable: the collector's own
 * export carries these same rows, so they can count them themselves.
 */
export interface StandingEntry {
  orgId: string;
  /** Null for a holding that came from no program (a direct sale, an offering). */
  programId?: string | null;
  /** ISO acquisition date, or empty when the source had none. */
  acquiredAt?: string | null;
}

export interface CollectorStanding {
  /** Distinct programs the collector has participated in. The measure. */
  programsJoined: number;
  /** Distinct orgs, for context on a surface that shows the count. */
  orgsSupported: number;
  /** ISO date of the earliest holding, or null. Context, never the measure. */
  since: string | null;
}

/**
 * Compute standing from a collector's holdings.
 *
 * Distinct `programId`s, so five works from one program count once: the measure
 * is breadth, and counting works would quietly make it spend.
 *
 * A holding with no `programId` (a direct sale, an offering interest) counts
 * toward `orgsSupported` but not toward `programsJoined`. That is honest rather
 * than tidy: the person did support the org, and they did not join a program.
 *
 * A holding with no `orgId` counts toward NOTHING, `since` included. Every
 * figure returned here is derived from the same accepted set, so a surface
 * cannot show a first-collected date alongside a zero it contradicts.
 */
export function resolveCollectorStanding(
  entries: readonly StandingEntry[],
): CollectorStanding {
  const programIds = new Set<string>();
  const orgIds = new Set<string>();
  let earliest: number | null = null;

  for (const entry of entries) {
    const orgId = typeof entry.orgId === "string" ? entry.orgId.trim() : "";
    // A holding with no org is one we cannot attribute, so it is skipped
    // ENTIRELY rather than partly. Letting it through for `since` alone is how
    // a profile came to read "collecting since 2024 and 0 programs": every
    // number a surface shows has to come from the same accepted set, or the
    // numbers contradict each other on screen.
    if (!orgId) continue;
    orgIds.add(orgId);
    const programId = typeof entry.programId === "string" ? entry.programId.trim() : "";
    // Namespaced by org: two orgs may both have a program called "print-club",
    // and counting a bare id would silently merge them into one.
    if (programId) programIds.add(`${orgId}/${programId}`);
    const ms = entry.acquiredAt ? Date.parse(entry.acquiredAt) : Number.NaN;
    if (Number.isFinite(ms) && (earliest === null || ms < earliest)) earliest = ms;
  }

  return {
    programsJoined: programIds.size,
    orgsSupported: orgIds.size,
    since: earliest === null ? null : new Date(earliest).toISOString(),
  };
}

/** Per-program configuration for honouring standing. */
export interface ProgramStandingPriorityConfig {
  /**
   * Whether this program gives priority by standing in capacity-limited
   * situations. Absent means NO, and no means nothing bad: an org that declines
   * is never deprioritized, hidden or nudged, on the same R9 pattern as the
   * external-ticketing opt-out and the zero-hour early access window.
   */
  enabled?: boolean | null;
}

/**
 * Does this program honour standing?
 *
 * Strict `=== true`, so an absent, null, or truthy-but-not-true stored value
 * reads as off. A capability that takes something from somebody else defaults
 * to off and is turned on deliberately, never inferred.
 */
export function isStandingPriorityEnabled(
  config: ProgramStandingPriorityConfig | null | undefined,
): boolean {
  return config?.enabled === true;
}

/**
 * Order two collectors for a capacity-limited situation, highest standing first.
 *
 * A COMPARATOR, deliberately, and the only thing this module offers for acting
 * on standing. It can order a queue; it cannot exclude anybody from one, which
 * is the R3 line. A caller that wants a gate has to write one itself, in the
 * open, rather than finding one here.
 *
 * Ties break on nothing: equal standing returns 0 and the caller's existing
 * order survives, so whatever fair rule was already in place (request time,
 * usually) continues to decide. Inventing a second criterion here would be a
 * policy nobody chose.
 */
export function compareByStanding(a: CollectorStanding, b: CollectorStanding): number {
  return b.programsJoined - a.programsJoined;
}
