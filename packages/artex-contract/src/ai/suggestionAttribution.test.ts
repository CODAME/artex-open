import { describe, it, expect } from "vitest";
import {
  isSuggestionAttributionType,
  isValidSuggestionAttribution,
  normalizeSuggestionAttribution,
  withSuggestionAttribution,
} from "./suggestionAttribution";
import { normalizeArtexSuggestion } from "./suggestionLifecycle";

describe("isSuggestionAttributionType", () => {
  it("accepts the four curatorial-origin types", () => {
    for (const t of ["artist-mapping", "curator", "system-context", "codame-principle"]) {
      expect(isSuggestionAttributionType(t)).toBe(true);
    }
  });
  it("rejects unknown types", () => {
    expect(isSuggestionAttributionType("ai")).toBe(false);
    expect(isSuggestionAttributionType("")).toBe(false);
    expect(isSuggestionAttributionType(undefined)).toBe(false);
  });
});

describe("isValidSuggestionAttribution — the merge gate", () => {
  it("accepts a valid attribution", () => {
    expect(isValidSuggestionAttribution({ type: "artist-mapping", label: "Based on your mapping" })).toBe(true);
  });
  it("rejects a missing/invalid type", () => {
    expect(isValidSuggestionAttribution({ label: "x" })).toBe(false);
    expect(isValidSuggestionAttribution({ type: "nonsense", label: "x" })).toBe(false);
  });
  it("rejects a missing or empty label", () => {
    expect(isValidSuggestionAttribution({ type: "curator" })).toBe(false);
    expect(isValidSuggestionAttribution({ type: "curator", label: "" })).toBe(false);
    expect(isValidSuggestionAttribution({ type: "curator", label: "   " })).toBe(false);
  });
  it("rejects non-objects", () => {
    expect(isValidSuggestionAttribution(null)).toBe(false);
    expect(isValidSuggestionAttribution("artist-mapping")).toBe(false);
  });
});

describe("normalizeSuggestionAttribution", () => {
  it("trims label and detail", () => {
    expect(normalizeSuggestionAttribution({ type: "system-context", label: "  hi  ", detail: "  more  " }))
      .toEqual({ type: "system-context", label: "hi", detail: "more" });
  });
  it("keeps curator fields only for curator type", () => {
    expect(normalizeSuggestionAttribution({ type: "curator", label: "Jordan", curatorId: "uid-j", curatorName: "Jordan Gray" }))
      .toEqual({ type: "curator", label: "Jordan", curatorId: "uid-j", curatorName: "Jordan Gray" });
    expect(normalizeSuggestionAttribution({ type: "artist-mapping", label: "x", curatorId: "uid-j" }))
      .toEqual({ type: "artist-mapping", label: "x" });
  });
  it("returns null for invalid input (dropped, never thrown)", () => {
    expect(normalizeSuggestionAttribution({ type: "bad", label: "x" })).toBeNull();
    expect(normalizeSuggestionAttribution({ type: "curator" })).toBeNull();
    expect(normalizeSuggestionAttribution(undefined)).toBeNull();
  });
});

describe("withSuggestionAttribution", () => {
  it("attaches attribution immutably", () => {
    const base = { id: "s1" };
    const attribution = { type: "artist-mapping", label: "Based on your work" } as const;
    const next = withSuggestionAttribution(base, attribution);
    expect(next).toEqual({ id: "s1", attribution });
    expect(base).toEqual({ id: "s1" }); // original untouched
  });
});

describe("normalizeArtexSuggestion — attribution round-trip + back-compat", () => {
  const baseSuggestion = {
    id: "sug-1",
    createdAt: "2026-06-20T00:00:00.000Z",
    provider: "local",
    suggestionSource: "local",
    summary: "A calm breathing variation",
    patch: {},
  };

  it("preserves a valid attribution", () => {
    const result = normalizeArtexSuggestion({
      ...baseSuggestion,
      attribution: { type: "artist-mapping", label: "Based on your work's details" },
    });
    expect(result?.attribution).toEqual({ type: "artist-mapping", label: "Based on your work's details" });
  });

  it("drops an invalid attribution but keeps the suggestion (legacy data still loads)", () => {
    const result = normalizeArtexSuggestion({ ...baseSuggestion, attribution: { type: "bogus" } });
    expect(result).not.toBeNull();
    expect(result?.attribution).toBeUndefined();
  });

  it("loads a legacy suggestion with no attribution field", () => {
    const result = normalizeArtexSuggestion(baseSuggestion);
    expect(result).not.toBeNull();
    expect(result?.attribution).toBeUndefined();
  });
});
