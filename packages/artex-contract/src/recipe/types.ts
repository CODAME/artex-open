import type { EffectClass } from "../types";

/**
 * ARTEX Recipe Types
 *
 * The recipe is the canonical configuration primitive for all ARTEX experiences.
 * It sits between the artist-facing creator UI and the runtime player.
 *
 * Two editing surfaces write to the recipe:
 *   - Guided UI:  sliders/toggles per experience type, no schema knowledge needed
 *   - Raw editor: direct JSON edit, validated on save
 *
 * Both Random Variation and AI Suggestion write to the recipe as producers,
 * subject to per-field bounds and artist-defined interpretation boundaries.
 */

// ─── Shared primitives ────────────────────────────────────────────────────────

/**
 * A single recipe parameter with bounds, mutability flags, and optional
 * artist-defined interpretation boundaries.
 *
 * artistBounds — when present, Random Variation and AI Suggestion must operate
 * within artistBounds, not min/max. Must satisfy: min ≤ artistBounds.min and
 * artistBounds.max ≤ max.
 *
 * randomizable — when false, the parameter is locked from Random Variation and
 * AI Suggestion. Use for: parameters with dangerous interaction effects at range
 * extremes, simulation-state parameters whose change mid-run causes glitches,
 * and parameters owned by the evolution rule system rather than the artist.
 */
export interface RecipeParameter {
  /** Display label shown in the guided UI. null = hidden (raw editor only). */
  label: string | null;
  /** Current value. Must satisfy min ≤ value ≤ max. */
  value: number;
  min: number;
  max: number;
  step?: number;
  /** When false, excluded from Random Variation and AI Suggestion. Default: true. */
  randomizable: boolean;
  /**
   * Artist-defined bounds for Random Variation and AI Suggestion.
   * Must be a subset of [min, max].
   * When absent, Random Variation and AI Suggestion use [min, max].
   */
  artistBounds?: { min: number; max: number };
  /** Whether this parameter appears in the guided UI. Default: false. */
  ui?: boolean;
  /** Design rationale — why bounds and randomizable are set as they are. */
  rationale?: string;
}

/** Boolean parameter variant. */
export interface RecipeBooleanParameter {
  label: string | null;
  value: boolean;
  /** When false, excluded from Random Variation and AI Suggestion. */
  randomizable: boolean;
  ui?: boolean;
  rationale?: string;
}

export type AnyRecipeParameter = RecipeParameter | RecipeBooleanParameter;

/** Type guard for numeric parameters. */
export function isNumericParameter(p: AnyRecipeParameter): p is RecipeParameter {
  return typeof p.value === "number";
}

/** Type guard for boolean parameters. */
export function isBooleanParameter(
  p: AnyRecipeParameter
): p is RecipeBooleanParameter {
  return typeof p.value === "boolean";
}

// ─── Signal bindings ──────────────────────────────────────────────────────────

export type SignalCurve =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "log"
  | "exponential";

/** Maps a continuous sensor signal to a named recipe parameter. */
export interface SignalBinding {
  /** Name of the parameter in the recipe's parameters object. */
  target: string;
  curve: SignalCurve;
  /** Sensor value range to map from. */
  inputRange: [number, number];
  /** Parameter value range to map to. */
  outputRange: [number, number];
  /**
   * Smoothing duration — how long signal changes are interpolated over.
   * Format: "0.3s", "1.5s", "2.0s". Default: "0s" (no smoothing).
   */
  smoothing?: string;
}

/**
 * Gesture bindings — distinct from signal bindings.
 *
 * Gesture events are discrete (fire once, trigger a state change).
 * Signal bindings are continuous (map a scalar to a parameter value).
 *
 * Required by compound renderer experiences (Form/Release).
 * Optional for all other experience types.
 */
export interface GestureBinding {
  /** Named state machine transition target. */
  trigger: string;
  /** Duration string, e.g. "2.4s". */
  transitionDuration: string;
  transitionCurve: "ease-in" | "ease-out" | "ease-in-out" | "linear";
}

// ─── Mutation transition ──────────────────────────────────────────────────────

/**
 * How long the runtime interpolates recipe changes during live playback.
 *
 * Format: duration string, e.g. "0s", "4s", "8s", "30s".
 * Default when absent: "4s".
 * Clamped at runtime to a maximum of 60 seconds.
 *
 * - Shader experiences: "2s"–"8s"
 * - Character-driven experiences: "4s"–"12s"
 * - Compound (Form/Release): "0s" (live mutation disabled)
 */
export type MutationTransition = string;

// ─── Renderer hints ───────────────────────────────────────────────────────────
// RendererHint and EffectClass are already exported from the top-level types.ts;
// importing here only for use in the recipe interface field types below.

// ─── Shader params recipe ─────────────────────────────────────────────────────

/**
 * Recipe for shader-based experiences (WebGLShaderRenderer).
 * File: recipes/shader-params.json
 *
 * Reference experiences: V3 Experience, Living Grass
 */
export interface ShaderParamsRecipe {
  schemaVersion: "1";
  effectClass?: EffectClass;
  mutationTransition?: MutationTransition;
  /** Ordered array of shader pass names registered in @artex/shaders. */
  shaderStack?: string[];
  /** Named parameter entries. */
  parameters: Record<string, AnyRecipeParameter>;
  /**
   * Maps signal names to parameter binding configs.
   * Keys: "audio.level", "proximity", "cameraMotion", etc.
   */
  signalBindings?: Record<string, SignalBinding>;
}

// ─── Scene recipe ─────────────────────────────────────────────────────────────

/**
 * Named state model: maps state names to parameter value overrides.
 * Used by character-driven experiences (Illy: A Primitive Intelligence).
 */
export type StateModel = Record<string, Record<string, number | boolean>>;

/**
 * Recipe for Three.js scene-driven experiences.
 * File: recipes/scene-recipe.json
 *
 * Reference experiences: Illy: A Primitive Intelligence, Form/Release (form phase)
 */
export interface SceneRecipe {
  schemaVersion: "1";
  effectClass?: EffectClass;
  mutationTransition?: MutationTransition;
  /** Filename of GLB/GLTF asset in art/. */
  modelAsset?: string;
  sceneLayout?: string;
  lightingTreatment?: string;
  materialStyle?: string;
  cameraGrammar?: string;
  mediaTextureBinding?: "artwork" | "camera" | "video" | "none";
  /**
   * Personality parameters for character-driven experiences.
   * Same shape as shader parameters, including artistBounds support.
   */
  behaviourPersonality?: Record<string, AnyRecipeParameter>;
  /**
   * Named states mapping state names to personality parameter overrides.
   * Only meaningful when behaviourPersonality is defined.
   */
  stateModel?: StateModel;
  liveSignalBindings?: Record<string, SignalBinding>;
}

// ─── Particle recipe ──────────────────────────────────────────────────────────

export type EmitterSource = "webcam-motion" | "mesh-vertices";

export type DissolvePattern =
  | "outward-gravity"
  | "uniform"
  | "directional"
  | (string & {});

/**
 * Recipe for particle/flow and compound experiences.
 * File: recipes/particle-recipe.json
 *
 * Reference experiences: Form/Release (particle phase)
 */
export interface ParticleRecipe {
  schemaVersion: "1";
  effectClass?: EffectClass;
  /**
   * Set to "0s" for compound experiences where live mutation is disabled.
   * Live mutation of particle recipes during dissolution causes visible artifacts.
   */
  mutationTransition?: MutationTransition;
  /**
   * "mesh-vertices": particles originate from the loaded GLB mesh vertex
   * positions. Requires ThreeJSRenderer to have loaded a modelAsset and
   * exported a vertex buffer. Particles carry mesh face color when
   * colorFromMesh is true.
   */
  emitterSource?: EmitterSource;
  /**
   * When true and emitterSource is "mesh-vertices", particles inherit the
   * color of their source mesh face.
   */
  colorFromMesh?: boolean;
  dissolvePattern?: DissolvePattern;
  particleDensity?: RecipeParameter;
  turbulence?: RecipeParameter;
  trailPersistence?: RecipeParameter;
  /** Only meaningful when CrossfadeAdapter is active. */
  reformGravity?: RecipeParameter;
}

// ─── Gesture bindings (config.json top-level) ─────────────────────────────────

/**
 * Gesture binding map for the config.json top-level gestureBindings field.
 *
 * Keys are named gesture events emitted by the gesture classifier:
 *   "gesture.pushAway", "gesture.pullToward", etc.
 *
 * Values are discrete state machine transition triggers.
 *
 * Distinct from signalBindings (continuous) — gesture events fire once.
 */
export type GestureBindings = Record<string, GestureBinding>;

// ─── Full recipe bundle ───────────────────────────────────────────────────────

/**
 * All recipe files that a package may carry.
 * Each is independently optional and backward compatible.
 */
export interface RecipeBundle {
  shaderParams?: ShaderParamsRecipe;
  scene?: SceneRecipe;
  particle?: ParticleRecipe;
}
