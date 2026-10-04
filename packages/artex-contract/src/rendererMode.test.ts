// `rendererMode` is a TypeScript union with no runtime validation anywhere, so
// a writer that erases the type can put a non-member into Firestore — which is
// exactly what happened with "reactive-field" (#3242). These pin the repair.
import { describe, expect, it } from "vitest";
import { isRendererMode, normalizeRendererMode, type RendererMode } from "./types";

const CANONICAL: RendererMode[] = [
  "webgl", "three-experimental", "hybrid-reactive-field", "p5js", "html", "webgpu",
];

describe("normalizeRendererMode", () => {
  it("passes every canonical mode through unchanged", () => {
    for (const mode of CANONICAL) {
      expect(normalizeRendererMode(mode)).toBe(mode);
    }
  });

  it("repairs the legacy 'reactive-field' the Create flow wrote", () => {
    // Particle and scene pieces carry this in saved data. Read raw it matches
    // no branch, so those pieces got the shader canvas instead of the hybrid
    // renderer.
    expect(normalizeRendererMode("reactive-field")).toBe("hybrid-reactive-field");
  });

  it("returns null for absent or unknown values, leaving the fallback to the caller", () => {
    expect(normalizeRendererMode(null)).toBeNull();
    expect(normalizeRendererMode(undefined)).toBeNull();
    expect(normalizeRendererMode("")).toBeNull();
    expect(normalizeRendererMode("not-a-renderer")).toBeNull();
  });
});

describe("isRendererMode", () => {
  it("accepts the canonical modes and nothing else", () => {
    for (const mode of CANONICAL) expect(isRendererMode(mode)).toBe(true);
    // The legacy alias is NOT a RendererMode — it normalizes to one, which is
    // a different question. A writer must never emit it.
    expect(isRendererMode("reactive-field")).toBe(false);
    expect(isRendererMode(null)).toBe(false);
  });
});
