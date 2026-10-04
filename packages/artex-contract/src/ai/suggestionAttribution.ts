/**
 * Suggestion attribution (Design Commitment 5 — Taste as Infrastructure).
 *
 * Every recommendation must carry its curatorial origin. A recommendation with
 * no valid origin is treated the same as one with no content: the validator
 * here is the merge-blocking gate. Pure-random variations are not
 * recommendations and carry no attribution (they are labelled "Pure random" by
 * the separate provenance badge).
 */
import type { SuggestionAttribution, SuggestionAttributionType } from "../types";

const VALID_TYPES: ReadonlySet<SuggestionAttributionType> = new Set([
  "artist-mapping",
  "curator",
  "system-context",
  "codame-principle",
]);

export const isSuggestionAttributionType = (value: unknown): value is SuggestionAttributionType =>
  typeof value === "string" && VALID_TYPES.has(value as SuggestionAttributionType);

/**
 * A suggestion attribution is valid only with a recognised `type` and a
 * non-empty `label`. This is the gate the PR requirement asserts against.
 */
export const isValidSuggestionAttribution = (value: unknown): value is SuggestionAttribution => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return isSuggestionAttributionType(candidate.type)
    && typeof candidate.label === "string"
    && candidate.label.trim().length > 0;
};

/**
 * Parse an untrusted attribution (e.g. from a persisted package). Returns a
 * trimmed, type-correct object, or null when invalid — never throws. Callers
 * drop the attribution on null rather than rejecting the whole suggestion, so
 * older stored suggestions without attribution still load.
 */
export const normalizeSuggestionAttribution = (value: unknown): SuggestionAttribution | null => {
  if (!isValidSuggestionAttribution(value)) return null;
  return {
    type: value.type,
    label: value.label.trim(),
    ...(typeof value.detail === "string" && value.detail.trim() ? { detail: value.detail.trim() } : {}),
    ...(value.type === "curator" && value.curatorId?.trim() ? { curatorId: value.curatorId.trim() } : {}),
    ...(value.type === "curator" && value.curatorName?.trim() ? { curatorName: value.curatorName.trim() } : {}),
  };
};

/** Attach a curatorial origin to a suggestion (immutable). */
export const withSuggestionAttribution = <T extends object>(
  suggestion: T,
  attribution: SuggestionAttribution,
): T & { attribution: SuggestionAttribution } => ({ ...suggestion, attribution });
