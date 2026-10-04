import { describe, it, expect } from "vitest";
import {
  validateShaderParamsRecipe,
  validateSceneParamsRecipe,
  validateParticleParamsRecipe,
  validateRecipeBundle,
  parseAndValidateShaderParams,
} from "./validate";
import type { ShaderParamsRecipe, SceneRecipe, ParticleRecipe } from "./types";
import { LIVING_GRASS_DEFAULT_RECIPE } from "./defaults";

// ─── ShaderParamsRecipe ───────────────────────────────────────────────────────

describe("validateShaderParamsRecipe", () => {
  it("passes for the Living Grass default recipe", () => {
    const result = validateShaderParamsRecipe(LIVING_GRASS_DEFAULT_RECIPE);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails for unknown schemaVersion", () => {
    const recipe = { ...LIVING_GRASS_DEFAULT_RECIPE, schemaVersion: "99" as "1" };
    const result = validateShaderParamsRecipe(recipe);
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.field).toBe("schemaVersion");
  });

  it("fails when parameter value is outside [min, max]", () => {
    const recipe: ShaderParamsRecipe = {
      ...LIVING_GRASS_DEFAULT_RECIPE,
      parameters: {
        ...LIVING_GRASS_DEFAULT_RECIPE.parameters,
        grassDensity: {
          label: "Grass Density",
          value: 2.0,
          min: 0.1,
          max: 1.0,
          step: 0.01,
          randomizable: true,
          ui: true,
        },
      },
    };
    const result = validateShaderParamsRecipe(recipe);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.field === "parameters.grassDensity.value")
    ).toBe(true);
  });

  it("fails when artistBounds is outside [min, max]", () => {
    const recipe: ShaderParamsRecipe = {
      ...LIVING_GRASS_DEFAULT_RECIPE,
      parameters: {
        ...LIVING_GRASS_DEFAULT_RECIPE.parameters,
        grassDensity: {
          label: "Grass Density",
          value: 0.6,
          min: 0.1,
          max: 1.0,
          step: 0.01,
          randomizable: true,
          artistBounds: { min: 0.0, max: 1.5 },
          ui: true,
        },
      },
    };
    const result = validateShaderParamsRecipe(recipe);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field.includes("artistBounds"))).toBe(true);
  });

  it("warns but passes for mutationTransition > 60s", () => {
    const recipe = { ...LIVING_GRASS_DEFAULT_RECIPE, mutationTransition: "90s" };
    const result = validateShaderParamsRecipe(recipe);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.field === "mutationTransition")).toBe(true);
  });

  it("fails for invalid signal binding curve", () => {
    const recipe: ShaderParamsRecipe = {
      ...LIVING_GRASS_DEFAULT_RECIPE,
      signalBindings: {
        "audio.level": {
          target: "windStrength",
          curve: "invalid-curve" as "linear",
          inputRange: [0, 1],
          outputRange: [0, 1],
        },
      },
    };
    const result = validateShaderParamsRecipe(recipe);
    expect(result.valid).toBe(false);
  });

  it("fails for malformed duration string", () => {
    const recipe = {
      ...LIVING_GRASS_DEFAULT_RECIPE,
      mutationTransition: "8 seconds",
    };
    const result = validateShaderParamsRecipe(recipe);
    expect(result.valid).toBe(false);
  });
});

// ─── SceneRecipe ─────────────────────────────────────────────────────────────

describe("validateSceneParamsRecipe", () => {
  const validScene: SceneRecipe = {
    schemaVersion: "1",
    effectClass: "scene-driven-character",
    mutationTransition: "8s",
    modelAsset: "illy.glb",
    lightingTreatment: "soft-ambient",
    mediaTextureBinding: "none",
  };

  it("passes for a valid scene recipe", () => {
    const result = validateSceneParamsRecipe(validScene);
    expect(result.valid).toBe(true);
  });

  it("fails for invalid mediaTextureBinding", () => {
    const recipe = {
      ...validScene,
      mediaTextureBinding: "unknown" as "artwork",
    };
    const result = validateSceneParamsRecipe(recipe);
    expect(result.valid).toBe(false);
  });
});

// ─── ParticleRecipe ───────────────────────────────────────────────────────────

describe("validateParticleParamsRecipe", () => {
  const validParticle: ParticleRecipe = {
    schemaVersion: "1",
    effectClass: "scene-particle-compound",
    mutationTransition: "0s",
    emitterSource: "mesh-vertices",
    colorFromMesh: true,
    particleDensity: {
      label: "Particle Density",
      value: 0.8,
      min: 0.3,
      max: 1.0,
      step: 0.01,
      randomizable: true,
    },
  };

  it("passes for a valid particle recipe", () => {
    const result = validateParticleParamsRecipe(validParticle);
    expect(result.valid).toBe(true);
  });

  it("fails for invalid emitterSource", () => {
    const recipe = {
      ...validParticle,
      emitterSource: "bad-source" as "webcam-motion",
    };
    const result = validateParticleParamsRecipe(recipe);
    expect(result.valid).toBe(false);
  });
});

// ─── RecipeBundle ─────────────────────────────────────────────────────────────

describe("validateRecipeBundle", () => {
  it("fails when mesh-vertices emitter has no modelAsset in scene recipe", () => {
    const result = validateRecipeBundle({
      particle: {
        schemaVersion: "1",
        emitterSource: "mesh-vertices",
      },
      scene: {
        schemaVersion: "1",
      },
    });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.field === "particle.emitterSource")
    ).toBe(true);
  });

  it("passes when mesh-vertices emitter has modelAsset", () => {
    const result = validateRecipeBundle({
      particle: {
        schemaVersion: "1",
        emitterSource: "mesh-vertices",
      },
      scene: {
        schemaVersion: "1",
        modelAsset: "form.glb",
      },
    });
    expect(result.valid).toBe(true);
  });
});

// ─── parseAndValidateShaderParams ─────────────────────────────────────────────

describe("parseAndValidateShaderParams", () => {
  it("returns parse error for invalid JSON", () => {
    const { recipe, result } = parseAndValidateShaderParams("not json {{{");
    expect(recipe).toBeNull();
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.field).toBe("json");
  });

  it("parses and validates a valid JSON string", () => {
    const json = JSON.stringify(LIVING_GRASS_DEFAULT_RECIPE);
    const { recipe, result } = parseAndValidateShaderParams(json);
    expect(recipe).not.toBeNull();
    expect(result.valid).toBe(true);
  });
});
