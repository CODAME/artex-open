// Whether a project may be offered to other artists as a starting point.
//
// Background (COD-228). A catalog starter used to be a different KIND of
// record: artist-published starters lived in `libraryItems`, private drafts
// lived in `projects`, and "a draft cannot turn up in the catalog" was
// therefore true by collection. Folding the two together (docs/one-project-
// model-and-publish-destinations.md) removes that structural guarantee, so the
// line is now held by one flag — `listed` — plus the rules and the query that
// read it.
//
// This module is the client-side mirror of the `projectListingIsBacked()` rule
// in firestore.rules. The rule is the enforcement; this is so the UI can grey
// out the toggle and say why, instead of letting the artist flip it and take a
// permission error. Keep the two in step: if the condition changes here it
// changes there, and the rules tests in
// .services/artex-rules-tests/src/projects.test.ts are what prove it.
//
// The parameter is a structural shape rather than PlatformProjectRecord on
// purpose: that type lives in @artex/core, and the contract package must never
// import core (scripts/check_workspace_boundaries.mjs enforces it).

/** The listing-relevant fields of a project record. All optional — every
 *  project written before this flag existed carries none of them. */
export interface ProjectListingFields {
  listed?: boolean;
  licenseId?: string | null;
  rightsConfirmed?: boolean;
}

const hasLicense = (fields: ProjectListingFields): boolean =>
  typeof fields.licenseId === "string" && fields.licenseId.trim() !== "";

/**
 * May this project be listed at all?
 *
 * Two independent conditions, and the second is the one that matters: stating
 * terms is not the same as confirming you hold the rights to offer the work.
 * A licence does NOT imply listing — the artist states terms and separately
 * decides whether to offer the work as a starting point.
 */
export const canListProject = (fields: ProjectListingFields): boolean =>
  hasLicense(fields) && fields.rightsConfirmed === true;

/**
 * Is this project actually being offered as a starting point?
 *
 * Absent reads as private, never as unknown: the flag postdates every existing
 * project. It also refuses to honour a listing whose terms have gone missing,
 * so a hand-edited or half-migrated row cannot present itself as listed with no
 * licence behind it — the rules forbid writing that state, and this makes a
 * projection built on the helper safe even if one exists.
 */
export const isProjectListed = (fields: ProjectListingFields): boolean =>
  fields.listed === true && canListProject(fields);

/** What is missing before this project could be listed, or null if nothing is.
 *  Drives the explanation next to a disabled listing toggle. */
export const LISTING_BLOCKED_REASON = (
  fields: ProjectListingFields,
): "license" | "rights" | null => {
  if (!hasLicense(fields)) return "license";
  if (fields.rightsConfirmed !== true) return "rights";
  return null;
};

/** The listing state a write may actually ask for, with its terms. */
export interface ProjectListingResolution {
  listed: boolean;
  licenseId: string | null;
  rightsConfirmed: boolean;
}

/**
 * Resolve what a project write is allowed to ask for.
 *
 * `firestore.rules` refuses a project whose merged document is `listed` without
 * a licence and a rights confirmation. A refused write does not degrade
 * gracefully: it reaches the artist as "Missing or insufficient permissions" in
 * the middle of publishing, with no indication that a licence was the problem.
 * So the save path resolves the state it may request instead of requesting one
 * the rules will reject.
 *
 * Clearing the licence therefore withdraws the listing rather than leaving a
 * listed project with no terms — that state is refused on the next write too,
 * so preserving it would only strand the record somewhere the artist cannot
 * save from.
 */
export const resolveProjectListing = (input: {
  requestedListed?: boolean;
  licenseId?: string | null;
  rightsConfirmed?: boolean;
}): ProjectListingResolution => {
  const licenseId = input.licenseId ?? null;
  const rightsConfirmed = input.rightsConfirmed === true;
  return {
    listed: input.requestedListed === true && canListProject({ licenseId, rightsConfirmed }),
    licenseId,
    rightsConfirmed,
  };
};
