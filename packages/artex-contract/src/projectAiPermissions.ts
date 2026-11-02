// What an artist has allowed to be done with one of their works
// (docs/work-permissions.md).
//
// Four permissions, read as one model. Two already existed implicitly and
// get no new field: a work may be EXHIBITED because it is published, and it
// may be REMIXED because it is listed with a licence and confirmed rights
// (projectListing.ts). Two are new and explicit: whether the work may TRAIN
// a model, and whether a machine may GENERATE DERIVATIVES of it.
//
// The new two are never implied. Not by publishing, not by listing, not by
// any licence: each is its own artist action, and absent means no. Every
// project written before the flags existed carries neither, which is the
// truthful state ("our policy says no") without a migration.
//
// Every consumer (UI, server, internal pipelines) reads through this helper,
// never the raw booleans, for the same reason `isProjectListed` exists: a
// half-migrated or hand-edited row must not read as a grant.
//
// The parameter is a structural shape, not PlatformProjectRecord: that type
// lives in @artex/core, and the contract package must never import core
// (scripts/check_workspace_boundaries.mjs). The platform API cannot import
// this file either, and today it neither reads nor writes these fields, so
// there is no server mirror. The first server reader adds a `.mjs` mirror
// with a parity test (docs/artist-licensing-and-offerings-plan.md §5.7).

import { isProjectListed, type ProjectListingFields } from "./projectListing";

/** The permission-relevant fields of a project record. All optional. */
export interface WorkPermissionFields extends ProjectListingFields {
  status?: string | null;
  /** May train a model. Absent or anything but `true` means no. */
  allowAiTraining?: boolean;
  /** May a machine generate derivatives (variations, restyles, extensions).
   *  Human adaptation under a reuse licence is the licence's business, not
   *  this flag's. Absent or anything but `true` means no. */
  allowAiDerivatives?: boolean;
}

export interface WorkPermissions {
  /** Shown publicly: the work is published. */
  exhibit: boolean;
  /** Offered to other artists as a starting point (listed, licensed, rights confirmed). */
  remix: boolean;
  /** May be used to train a model. */
  train: boolean;
  /** A machine may generate derivatives of it. */
  derive: boolean;
}

/**
 * The four permissions for one work.
 *
 * `train` and `derive` require the literal `true`: a string "true", a 1, or a
 * missing field all read as no, because a grant has to be something the
 * artist did, not something a loose comparison inferred.
 */
export const workPermissions = (fields: WorkPermissionFields): WorkPermissions => ({
  exhibit: fields.status === "published",
  remix: isProjectListed(fields),
  train: fields.allowAiTraining === true,
  derive: fields.allowAiDerivatives === true,
});

/** The AI-use fields a project write may carry. */
export type WorkAiPermissionsPatch = Partial<Pick<WorkPermissionFields, "allowAiTraining" | "allowAiDerivatives">>;

/**
 * The AI-use fields a project write should carry: only those that change.
 *
 * firestore.rules lets only the owner change either flag, and compares the
 * stored and requested values with `get(field, null)`. A save that writes
 * `false` over an absent field therefore counts as a change, and a
 * collaborator's or admin's ordinary save would be refused for touching
 * consent it never meant to touch. Writing only real changes keeps every
 * other save clear of the rule, and keeps the absent-means-no state absent.
 *
 * `undefined` requested means "not asked": nothing is written. A stored value
 * that is not a boolean (a hand edit) is replaced by any answer given, so the
 * owner can always put the record right.
 */
const changes = (stored: unknown, requested: boolean | undefined): requested is boolean => {
  if (requested === undefined) return false;
  if (stored !== undefined && stored !== null && typeof stored !== "boolean") return true;
  return requested !== (stored === true);
};

export const resolveWorkAiPermissionsWrite = (
  stored: { allowAiTraining?: unknown; allowAiDerivatives?: unknown },
  requested: WorkAiPermissionsPatch,
): WorkAiPermissionsPatch => {
  const patch: WorkAiPermissionsPatch = {};
  if (changes(stored.allowAiTraining, requested.allowAiTraining)) {
    patch.allowAiTraining = requested.allowAiTraining;
  }
  if (changes(stored.allowAiDerivatives, requested.allowAiDerivatives)) {
    patch.allowAiDerivatives = requested.allowAiDerivatives;
  }
  return patch;
};
