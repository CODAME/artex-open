import { describe, it, expect } from "vitest";
import { generateRandomVariation, applyVariationPatch } from "./random";
import { LIVING_GRASS_DEFAULT_RECIPE } from "./defaults";
import type { RecipeParameter } from "./types";

describe("generateRandomVariation", () => {
  it("does not mutate the source recipe", () => {
    const original = JSON.stringify(LIVING_GRASS_DEFAULT_RECIPE);
    generateRandomVariation(LIVING_GRASS_DEFAULT_RECIPE);
    expect(JSON.stringify(LIVING_GRASS_DEFAULT_RECIPE)).toBe(original);
  });

  it("only varies randomizable: true parameters", () => {
    const patch = generateRandomVariation(LIVING_GRASS_DEFAULT_RECIPE, 1.0, 42);
    expect("breathingAmplitude" in patch.parameters).toBe(false);
    expect("feedbackDecay" in patch.parameters).toBe(false);
    expect("nightModeIntensity" in patch.parameters).toBe(false);
  });

  it("keeps all varied values within artistBounds", () => {
    for (let seed = 0; seed < 50; seed++) {
      const patch = generateRandomVariation(LIVING_GRASS_DEFAULT_RECIPE, 1.0, seed);
      for (const [key, value] of Object.entries(patch.parameters)) {
        const param = LIVING_GRASS_DEFAULT_RECIPE.parameters[key];
        if (typeof param.value !== "number") continue;
        const lo = param.artistBounds?.min ?? param.min;
        const hi = param.artistBounds?.max ?? param.max;
        expect(value).toBeGreaterThanOrEqual(lo - 0.001);
        expect(value).toBeLessThanOrEqual(hi + 0.001);
      }
    }
  });

  it("is deterministic with the same seed", () => {
    const a = generateRandomVariation(LIVING_GRASS_DEFAULT_RECIPE, 0.5, 12345);
    const b = generateRandomVariation(LIVING_GRASS_DEFAULT_RECIPE, 0.5, 12345);
    expect(a).toEqual(b);
  });

  it("produces different results with different seeds", () => {
    const a = generateRandomVariation(LIVING_GRASS_DEFAULT_RECIPE, 0.5, 1);
    const b = generateRandomVariation(LIVING_GRASS_DEFAULT_RECIPE, 0.5, 2);
    expect(a).not.toEqual(b);
  });
});

describe("applyVariationPatch", () => {
  it("does not mutate the source recipe", () => {
    const original = JSON.stringify(LIVING_GRASS_DEFAULT_RECIPE);
    const patch = generateRandomVariation(LIVING_GRASS_DEFAULT_RECIPE, 0.5, 1);
    applyVariationPatch(LIVING_GRASS_DEFAULT_RECIPE, patch);
    expect(JSON.stringify(LIVING_GRASS_DEFAULT_RECIPE)).toBe(original);
  });

  it("returns a recipe with varied parameter values", () => {
    const patch = { parameters: { grassDensity: 0.77 } };
    const updated = applyVariationPatch(LIVING_GRASS_DEFAULT_RECIPE, patch);
    expect((updated.parameters.grassDensity as RecipeParameter).value).toBeCloseTo(0.77);
  });

  it("ignores patch keys that don't exist in the recipe", () => {
    const patch = { parameters: { nonExistentParam: 0.5 } };
    const updated = applyVariationPatch(LIVING_GRASS_DEFAULT_RECIPE, patch);
    expect("nonExistentParam" in updated.parameters).toBe(false);
  });
});
