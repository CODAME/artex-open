// Whether AI was involved in making a work, as its artist declares it
// (docs/work-permissions.md, "Made with AI"; #6149).
//
// This is a statement about how the work was MADE, not a permission about
// what others may do with it: that is `workPermissions()` in
// projectAiPermissions.ts (`remix`, `train`, `derive`), and the two never
// read each other.
//
// Three answers, and no answer:
//   "no"       — made without generative AI;
//   "assisted" — AI helped, the artist made the work;
//   "yes"      — AI generated the work or most of it.
// Absent is "not set": every work published before the question existed,
// and never forced. Read through `workAiGenerated()`, never the raw field,
// so a hand-edited or half-written row reads as not set rather than as an
// answer the artist never gave. That reader is the whole validation: no
// firestore.rules clause polices the value, the same way `workPermissions`
// reads anything but the literal `true` as no.
//
// The parameter is structural so the contract never imports @artex/core
// (scripts/check_workspace_boundaries.mjs). The platform API cannot import
// this file; a server reader adds a `.mjs` mirror with a parity test.

/** The answers, in the order the question offers them. */
export const WORK_AI_GENERATED_VALUES = ["no", "assisted", "yes"] as const;

export type WorkAiGenerated = (typeof WORK_AI_GENERATED_VALUES)[number];

/** The artist's answer, or null when there is none (absent or not one of the three). */
export const workAiGenerated = (value: unknown): WorkAiGenerated | null =>
  typeof value === "string" && (WORK_AI_GENERATED_VALUES as readonly string[]).includes(value)
    ? (value as WorkAiGenerated)
    : null;

/**
 * The field a write should carry: the answer when there is a real one,
 * nothing otherwise. Omitted rather than null, because every writer merges
 * and an absent key leaves a stored answer alone. There is no "clear": once
 * given, an answer is changed, never withdrawn to "not set".
 */
export const workAiGeneratedWrite = (value: unknown): { aiGenerated?: WorkAiGenerated } => {
  const answer = workAiGenerated(value);
  return answer ? { aiGenerated: answer } : {};
};

/**
 * When the question started being asked. A work whose project was created
 * before this is never forced to answer, whatever its publish history: an
 * unpublished legacy work republished later is still a legacy work. Its
 * publish state cannot decide this, because unpublishing clears
 * `publishedArtworkId` (Codex review of #6160).
 */
export const WORK_AI_GENERATED_ASKED_SINCE = "2026-11-03T00:00:00.000Z";

/**
 * Whether publishing this work must have an answer: true for a project not
 * saved yet and for one created on or after `WORK_AI_GENERATED_ASKED_SINCE`.
 * A project with no readable `createdAt` predates the field's world and is
 * not forced.
 */
export const workAiGeneratedRequired = (project: { createdAt?: unknown } | null | undefined): boolean => {
  if (!project) return true;
  return typeof project.createdAt === "string" && project.createdAt >= WORK_AI_GENERATED_ASKED_SINCE;
};
