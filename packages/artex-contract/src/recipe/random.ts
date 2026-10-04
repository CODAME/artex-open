/**
 * Random Variation for recipe parameters.
 *
 * Random Variation samples within per-field bounds (artistBounds if present,
 * otherwise [min, max]) and respects randomizable: false flags.
 *
 * The output is a partial parameter patch — only the fields that were varied
 * are included. The caller merges this patch onto the current recipe after
 * artist approval.
 */

import type { ShaderParamsRecipe, AnyRecipeParameter } from "./types";
import { isNumericParameter } from "./types";

export interface RandomVariationPatch {
  parameters: Record<string, number>;
}

/**
 * Generate a random variation patch for a shader params recipe.
 *
 * @param recipe   The current recipe.
 * @param strength 0–1. 0 = no change, 1 = full range variation. Default: 0.5.
 * @param seed     Optional seed for deterministic output. Uses Math.random() if absent.
 */
export function generateRandomVariation(
  recipe: ShaderParamsRecipe,
  strength = 0.5,
  seed?: number
): RandomVariationPatch {
  const rng = seed !== undefined ? seededRandom(seed) : Math.random;
  const patch: Record<string, number> = {};

  for (const [key, param] of Object.entries(recipe.parameters)) {
    if (!isNumericParameter(param)) continue;
    if (!param.randomizable) continue;

    const lo = param.artistBounds?.min ?? param.min;
    const hi = param.artistBounds?.max ?? param.max;
    const range = hi - lo;

    const target = lo + rng() * range;
    const varied = param.value + (target - param.value) * strength;

    const step = param.step ?? 0.01;
    const clamped = Math.max(lo, Math.min(hi, varied));
    patch[key] = Math.round(clamped / step) * step;
  }

  return { parameters: patch };
}

/**
 * Apply a variation patch to a recipe, returning a new recipe.
 * Does not mutate the input.
 */
export function applyVariationPatch(
  recipe: ShaderParamsRecipe,
  patch: RandomVariationPatch
): ShaderParamsRecipe {
  const updatedParams = { ...recipe.parameters };

  for (const [key, value] of Object.entries(patch.parameters)) {
    const existing = updatedParams[key] as AnyRecipeParameter | undefined;
    if (existing !== undefined && isNumericParameter(existing)) {
      updatedParams[key] = { ...existing, value };
    }
  }

  return { ...recipe, parameters: updatedParams };
}

/** Simple seeded pseudo-random number generator (mulberry32). */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
