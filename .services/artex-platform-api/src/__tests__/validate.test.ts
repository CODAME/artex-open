import { describe, it, expect } from "vitest";
import { deepMergePatch } from "../middleware/validate.js";

describe("deepMergePatch (RFC 7396)", () => {
  it("merges top-level fields", () => {
    const target = { a: 1, b: 2 };
    const patch = { b: 3, c: 4 };
    expect(deepMergePatch(target, patch)).toEqual({ a: 1, b: 3, c: 4 });
  });

  it("removes fields set to null", () => {
    const target = { a: 1, b: 2, c: 3 };
    const patch = { b: null };
    expect(deepMergePatch(target, patch)).toEqual({ a: 1, c: 3 });
  });

  it("deep merges nested objects", () => {
    const target = {
      animation: { baseSpeed: 1.0, breathingEnabled: true, parallaxEnabled: true },
    };
    const patch = {
      animation: { baseSpeed: 2.0 },
    };
    const result = deepMergePatch(target, patch);
    expect(result.animation.baseSpeed).toBe(2.0);
    expect(result.animation.breathingEnabled).toBe(true);
    expect(result.animation.parallaxEnabled).toBe(true);
  });

  it("replaces arrays entirely (per RFC 7396)", () => {
    const target = { tags: ["a", "b", "c"] };
    const patch = { tags: ["x"] };
    expect(deepMergePatch(target, patch)).toEqual({ tags: ["x"] });
  });

  it("replaces value with array", () => {
    const target = { x: 42 };
    const patch = { x: [1, 2] };
    expect(deepMergePatch(target, patch)).toEqual({ x: [1, 2] });
  });

  it("replaces nested object with scalar", () => {
    const target = { a: { b: 1 } };
    const patch = { a: "string" };
    expect(deepMergePatch(target, patch)).toEqual({ a: "string" });
  });

  it("handles empty patch (no-op)", () => {
    const target = { a: 1, b: 2 };
    expect(deepMergePatch(target, {})).toEqual({ a: 1, b: 2 });
  });

  it("handles patch replacing entire object", () => {
    const target = { a: 1 };
    expect(deepMergePatch(target, null)).toBeNull();
  });

  it("preserves unchanged nested values during partial update", () => {
    const target = {
      layers: {
        base: {
          parallaxDepth: 0.5,
          breathingIntensity: 0.3,
          textureDrift: 0.1,
        },
      },
    };
    const patch = {
      layers: {
        base: { breathingIntensity: 0.9 },
      },
    };
    const result = deepMergePatch(target, patch);
    expect(result.layers.base.parallaxDepth).toBe(0.5);
    expect(result.layers.base.breathingIntensity).toBe(0.9);
    expect(result.layers.base.textureDrift).toBe(0.1);
  });
});
