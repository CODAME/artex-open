/**
 * ARTEX Recipe Validator
 *
 * This is the single validator used by both the Studio save path and the
 * runtime player load path. There is no separate creator-side and
 * runtime-side validator.
 *
 * All validation functions return a RecipeValidationResult — never throw.
 * Callers decide what to do with errors (UI: show inline; runtime: reject load).
 */

import type {
  AnyRecipeParameter,
  ShaderParamsRecipe,
  SceneRecipe,
  ParticleRecipe,
  RecipeBundle,
  SignalBinding,
} from "./types";
import { isNumericParameter } from "./types";

// ─── Result types ─────────────────────────────────────────────────────────────

export interface RecipeValidationError {
  field: string;
  message: string;
  /** "error" = hard failure (reject load); "warning" = logged, continue. */
  severity: "error" | "warning";
}

export interface RecipeValidationResult {
  valid: boolean;
  errors: RecipeValidationError[];
  warnings: RecipeValidationError[];
}

function ok(): RecipeValidationResult {
  return { valid: true, errors: [], warnings: [] };
}

function merge(
  a: RecipeValidationResult,
  b: RecipeValidationResult
): RecipeValidationResult {
  return {
    valid: a.valid && b.valid,
    errors: [...a.errors, ...b.errors],
    warnings: [...a.warnings, ...b.warnings],
  };
}

// ─── Curve validation ─────────────────────────────────────────────────────────

const VALID_CURVES = new Set([
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "log",
  "exponential",
]);

// ─── Duration string validation ───────────────────────────────────────────────

const DURATION_RE = /^\d+(\.\d+)?s$/;

function validateDuration(
  field: string,
  value: string
): RecipeValidationResult {
  const result: RecipeValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };
  if (!DURATION_RE.test(value)) {
    result.valid = false;
    result.errors.push({
      field,
      message: `Invalid duration format "${value}". Expected format: "4s" or "1.5s".`,
      severity: "error",
    });
    return result;
  }
  const seconds = parseFloat(value);
  if (seconds > 60) {
    result.warnings.push({
      field,
      message: `mutationTransition "${value}" exceeds 60s maximum. Will be clamped to 60s at runtime.`,
      severity: "warning",
    });
  }
  return result;
}

// ─── Parameter validation ─────────────────────────────────────────────────────

function validateParameter(
  field: string,
  param: AnyRecipeParameter
): RecipeValidationResult {
  const result: RecipeValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  if (!isNumericParameter(param)) {
    return result;
  }

  const p = param;

  if (p.min > p.max) {
    result.valid = false;
    result.errors.push({
      field: `${field}.min/max`,
      message: `min (${String(p.min)}) must be ≤ max (${String(p.max)}).`,
      severity: "error",
    });
  }

  if (p.value < p.min || p.value > p.max) {
    result.valid = false;
    result.errors.push({
      field: `${field}.value`,
      message: `value (${String(p.value)}) is outside [${String(p.min)}, ${String(p.max)}].`,
      severity: "error",
    });
  }

  if (p.artistBounds !== undefined) {
    const ab = p.artistBounds;
    if (ab.min < p.min || ab.max > p.max) {
      result.valid = false;
      result.errors.push({
        field: `${field}.artistBounds`,
        message: `artistBounds [${String(ab.min)}, ${String(ab.max)}] must be a subset of [${String(p.min)}, ${String(p.max)}].`,
        severity: "error",
      });
    }
    if (ab.min > ab.max) {
      result.valid = false;
      result.errors.push({
        field: `${field}.artistBounds`,
        message: `artistBounds.min (${String(ab.min)}) must be ≤ artistBounds.max (${String(ab.max)}).`,
        severity: "error",
      });
    }
  }

  return result;
}

function validateParameters(
  prefix: string,
  params: Record<string, AnyRecipeParameter>
): RecipeValidationResult {
  return Object.entries(params).reduce(
    (acc, [key, param]) =>
      merge(acc, validateParameter(`${prefix}.${key}`, param)),
    ok()
  );
}

// ─── Signal binding validation ────────────────────────────────────────────────

function validateSignalBinding(
  field: string,
  binding: SignalBinding
): RecipeValidationResult {
  const result: RecipeValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  if (!VALID_CURVES.has(binding.curve)) {
    result.valid = false;
    result.errors.push({
      field: `${field}.curve`,
      message: `Unknown curve "${binding.curve}". Valid values: ${[...VALID_CURVES].join(", ")}.`,
      severity: "error",
    });
  }

  if (binding.smoothing !== undefined && !DURATION_RE.test(binding.smoothing)) {
    result.valid = false;
    result.errors.push({
      field: `${field}.smoothing`,
      message: `Invalid smoothing format "${binding.smoothing}". Expected "0.3s" etc.`,
      severity: "error",
    });
  }

  return result;
}

// ─── Schema version validation ────────────────────────────────────────────────

function validateSchemaVersion(
  field: string,
  version: unknown
): RecipeValidationResult {
  if (version !== "1") {
    return {
      valid: false,
      errors: [
        {
          field,
          message: `Unsupported schemaVersion "${String(version)}". Only "1" is supported.`,
          severity: "error",
        },
      ],
      warnings: [],
    };
  }
  return ok();
}

// ─── Public validators ────────────────────────────────────────────────────────

/**
 * Validate a shader params recipe.
 *
 * Hard failures: invalid schemaVersion, parameter values outside bounds,
 * artistBounds outside [min, max], unknown signal binding curve names.
 *
 * Warnings: mutationTransition > 60s.
 */
export function validateShaderParamsRecipe(
  recipe: ShaderParamsRecipe
): RecipeValidationResult {
  let result = ok();

  result = merge(result, validateSchemaVersion("schemaVersion", recipe.schemaVersion));

  if (recipe.mutationTransition !== undefined) {
    result = merge(
      result,
      validateDuration("mutationTransition", recipe.mutationTransition)
    );
  }

  result = merge(result, validateParameters("parameters", recipe.parameters));

  if (recipe.signalBindings) {
    for (const [key, binding] of Object.entries(recipe.signalBindings)) {
      result = merge(
        result,
        validateSignalBinding(`signalBindings.${key}`, binding)
      );
    }
  }

  return result;
}

/**
 * Validate a scene recipe.
 */
export function validateSceneParamsRecipe(recipe: SceneRecipe): RecipeValidationResult {
  let result = ok();

  result = merge(result, validateSchemaVersion("schemaVersion", recipe.schemaVersion));

  if (recipe.mutationTransition !== undefined) {
    result = merge(
      result,
      validateDuration("mutationTransition", recipe.mutationTransition)
    );
  }

  if (recipe.behaviourPersonality) {
    result = merge(
      result,
      validateParameters("behaviourPersonality", recipe.behaviourPersonality)
    );
  }

  if (recipe.liveSignalBindings) {
    for (const [key, binding] of Object.entries(recipe.liveSignalBindings)) {
      result = merge(
        result,
        validateSignalBinding(`liveSignalBindings.${key}`, binding)
      );
    }
  }

  const validMediaBindings = new Set(["artwork", "camera", "video", "none"]);
  if (
    recipe.mediaTextureBinding !== undefined &&
    !validMediaBindings.has(recipe.mediaTextureBinding)
  ) {
    result.valid = false;
    result.errors.push({
      field: "mediaTextureBinding",
      message: `Unknown mediaTextureBinding "${recipe.mediaTextureBinding}". Valid: ${[...validMediaBindings].join(", ")}.`,
      severity: "error",
    });
  }

  return result;
}

/**
 * Validate a particle recipe.
 *
 * Hard failure: emitterSource "mesh-vertices" without modelAsset (checked
 * at bundle level — see validateRecipeBundle).
 */
export function validateParticleParamsRecipe(
  recipe: ParticleRecipe
): RecipeValidationResult {
  let result = ok();

  result = merge(result, validateSchemaVersion("schemaVersion", recipe.schemaVersion));

  if (recipe.mutationTransition !== undefined) {
    result = merge(
      result,
      validateDuration("mutationTransition", recipe.mutationTransition)
    );
  }

  const validEmitters = new Set(["webcam-motion", "mesh-vertices"]);
  if (
    recipe.emitterSource !== undefined &&
    !validEmitters.has(recipe.emitterSource)
  ) {
    result.valid = false;
    result.errors.push({
      field: "emitterSource",
      message: `Unknown emitterSource "${recipe.emitterSource}". Valid: ${[...validEmitters].join(", ")}.`,
      severity: "error",
    });
  }

  for (const field of [
    "particleDensity",
    "turbulence",
    "trailPersistence",
    "reformGravity",
  ] as const) {
    const param = recipe[field];
    if (param !== undefined) {
      result = merge(result, validateParameter(field, param));
    }
  }

  return result;
}

/**
 * Validate an entire recipe bundle.
 *
 * Cross-recipe validation:
 * - emitterSource "mesh-vertices" in particle recipe requires a modelAsset
 *   in the scene recipe (or the package art/ directory — checked here at
 *   the bundle level since both recipes are available).
 */
export function validateRecipeBundle(bundle: RecipeBundle): RecipeValidationResult {
  let result = ok();

  if (bundle.shaderParams) {
    result = merge(result, validateShaderParamsRecipe(bundle.shaderParams));
  }
  if (bundle.scene) {
    result = merge(result, validateSceneParamsRecipe(bundle.scene));
  }
  if (bundle.particle) {
    result = merge(result, validateParticleParamsRecipe(bundle.particle));

    if (
      bundle.particle.emitterSource === "mesh-vertices" &&
      !bundle.scene?.modelAsset
    ) {
      result.valid = false;
      result.errors.push({
        field: "particle.emitterSource",
        message:
          'emitterSource "mesh-vertices" requires a modelAsset in the scene recipe. No modelAsset found.',
        severity: "error",
      });
    }
  }

  return result;
}

/**
 * Parse and validate a recipe JSON string.
 * Returns the parsed recipe and validation result, or a parse error.
 */
export function parseAndValidateShaderParams(json: string): {
  recipe: ShaderParamsRecipe | null;
  result: RecipeValidationResult;
} {
  try {
    const recipe = JSON.parse(json) as ShaderParamsRecipe;
    return { recipe, result: validateShaderParamsRecipe(recipe) };
  } catch (e) {
    return {
      recipe: null,
      result: {
        valid: false,
        errors: [
          {
            field: "json",
            message: `JSON parse error: ${e instanceof Error ? e.message : String(e)}`,
            severity: "error",
          },
        ],
        warnings: [],
      },
    };
  }
}
