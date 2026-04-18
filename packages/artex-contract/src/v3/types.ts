/**
 * V3 Piece Config Types — serializable configuration for ARTEX pieces.
 *
 * These types define the configuration contract for each V3 use case:
 *
 *   WebGL Shader  → ShaderStackConfig (pass pipeline + parameters)
 *   Living Grass  → EvolutionRuleConfig + MutationPolicy (time-driven parameter drift)
 *   Illy          → BehaviourModelConfig + PersonalityConfig + InterpretationBoundary
 *   Form/Release  → SceneRecipeConfig + ParticleRecipeConfig + GestureBindingConfig
 */

import type { ArtexSignalType, TriggerRule, ArtworkStateConfig } from "../v2/types";

// ---------------------------------------------------------------------------
// Renderer subsystem declarations (replaces single RendererHint for compound)
// ---------------------------------------------------------------------------

/** Individual subsystem that a piece may require. */
export type RendererSubsystem = "shader" | "three-scene" | "particle" | "audio-reactive" | "p5js";

/**
 * Declares the rendering subsystems a piece requires.
 * Replaces the single `RendererHint` for compound use cases like Form/Release
 * which need both a Three.js scene and a particle system simultaneously.
 */
export interface RendererRequirements {
  /** Primary rendering strategy. */
  primary: RendererSubsystem;
  /** Additional subsystems this piece requires. */
  secondary?: RendererSubsystem[];
  /** GPU feature floor. */
  minGpuTier?: "low" | "medium" | "high";
}

// ---------------------------------------------------------------------------
// 1. Shader Stack (WebGL Shader use case)
// ---------------------------------------------------------------------------

/** A single pass in a shader effect pipeline. */
export interface ShaderPassConfig {
  /** Stable identifier for this pass. */
  id: string;
  /** Shader program reference (builtin ID or inline source key). */
  shaderId: string;
  /** Numeric uniforms passed to the shader. */
  params: Record<string, number>;
  /** Whether this pass is currently active. */
  enabled?: boolean;
  /** Blend mode when compositing this pass over previous output. */
  blendMode?: "normal" | "multiply" | "screen" | "overlay" | "add";
}

/** Ordered pipeline of shader passes with global parameters. */
export interface ShaderStackConfig {
  /** Ordered list of shader passes — first pass reads the source, each subsequent pass reads the previous output. */
  passes: ShaderPassConfig[];
  /** Global parameters available to all passes (e.g. time, resolution). */
  globalParams?: Record<string, number>;
  /** Resolution scale factor (1.0 = native). */
  resolutionScale?: number;
}

// ---------------------------------------------------------------------------
// 2. Evolution Rules + Mutation Policy (Living Grass use case)
// ---------------------------------------------------------------------------

/** Time-driven parameter evolution schedule. */
export type EvolutionAnchor = "install" | "calendar" | "manual";

/** Defines how a single parameter evolves over time. */
export interface EvolutionRuleConfig {
  /** Which parameter path this rule targets (e.g. "wind.strength", "palette.base"). */
  param: string;
  /** Scheduling basis. */
  anchor: EvolutionAnchor;
  /** Total duration of one evolution cycle in hours. */
  cycleDurationHours: number;
  /** Whether the cycle repeats after completion. */
  repeat: boolean;
  /**
   * Keyframes along the cycle (0–1 normalized position → target value).
   * The runtime interpolates between keyframes linearly.
   */
  keyframes: EvolutionKeyframe[];
}

export interface EvolutionKeyframe {
  /** Position in the cycle, 0.0 = start, 1.0 = end. */
  at: number;
  /** Target value at this keyframe. */
  value: number;
}

/**
 * Constrains how parameters may change during stage transitions
 * or evolution steps. Prevents jarring visual jumps.
 */
export interface MutationPolicy {
  /** Maximum allowed delta per parameter per transition. Keyed by param path. */
  maxDelta: Record<string, number>;
  /** Minimum transition duration in ms — overrides stage config if shorter. */
  minTransitionMs: number;
  /** Parameters that must never change mid-session (locked after mount). */
  lockedParams?: string[];
}

// ---------------------------------------------------------------------------
// 3. Behaviour Model + Personality + Interpretation Boundaries (Illy use case)
// ---------------------------------------------------------------------------

/**
 * Personality model — continuous dimensions that define the artwork's character.
 * Maps to V1's EngineState concept, now as a serializable piece config section.
 */
export interface PersonalityConfig {
  /** Preset personality archetype. */
  preset: PersonalityPresetId;
  /** Resting state for each dimension (the artwork returns here when idle). */
  restingState: PersonalityState;
  /** How quickly the personality returns to resting state (0 = never, 1 = instant). */
  decayRate: number;
  /** Per-dimension sensitivity multipliers. */
  sensitivity?: Partial<Record<keyof PersonalityState, number>>;
}

export type PersonalityPresetId = "threshold" | "living-canvas" | "relationship" | "custom";

/** Continuous personality dimensions (all 0–1). */
export interface PersonalityState {
  arousal: number;
  coherence: number;
  intimacy: number;
  tension: number;
  novelty: number;
  attention: number;
  memoryResidue: number;
}

/**
 * Interpretation boundary — constrains how input signals map to state changes.
 * Prevents unwanted state transitions from noisy or edge-case signal values.
 */
export interface InterpretationBoundary {
  /** The signal this boundary applies to. */
  signal: ArtexSignalType;
  /** Minimum confidence required for this signal to be considered (0–1). */
  minConfidence?: number;
  /** Signal value floor — values below this are treated as absent. */
  valueFloor?: number;
  /** Signal value ceiling — values above this are clamped. */
  valueCeiling?: number;
  /** Minimum time in ms a signal must be sustained before it affects personality. */
  sustainMs?: number;
  /** Signals in this list suppress this signal when active. */
  suppressedBy?: ArtexSignalType[];
}

/**
 * Unified behaviour model for a piece — combines trigger rules,
 * personality model, and interpretation constraints.
 */
export interface BehaviourModelConfig {
  /** Signal-driven trigger rules (from V2 contract). */
  triggers: TriggerRule[];
  /** Artwork states and layer overrides. */
  states: ArtworkStateConfig[];
  /** Personality model defining the artwork's character. */
  personality?: PersonalityConfig;
  /** Interpretation boundaries that filter/constrain signal processing. */
  boundaries?: InterpretationBoundary[];
  /** Default state when no triggers are active. */
  fallbackStateId: string;
}

// ---------------------------------------------------------------------------
// 4. Scene Recipe + Particle Recipe + Gesture Bindings (Form/Release use case)
// ---------------------------------------------------------------------------

/** Serializable description of a Three.js scene graph. */
export interface SceneRecipeConfig {
  /** Environment map or background. */
  environment?: SceneEnvironment;
  /** Light sources. */
  lights: SceneLightConfig[];
  /** Mesh objects. */
  meshes: SceneMeshConfig[];
  /** Fog settings. */
  fog?: { near: number; far: number; color: number };
}

export type SceneEnvironmentKind = "color" | "gradient" | "hdri";

export interface SceneEnvironment {
  kind: SceneEnvironmentKind;
  /** Hex color for "color" kind. */
  color?: number;
  /** Asset ID for "hdri" kind. */
  hdriAssetId?: string;
  /** Gradient stops for "gradient" kind. */
  gradientStops?: Array<{ position: number; color: number }>;
}

export interface SceneLightConfig {
  id: string;
  kind: "ambient" | "directional" | "point" | "spot";
  color: number;
  intensity: number;
  position?: [number, number, number];
  target?: [number, number, number];
  castShadow?: boolean;
}

export interface SceneMeshConfig {
  id: string;
  /** Geometry type or asset reference. */
  geometry: MeshGeometryConfig;
  /** Material reference. */
  materialId: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  /** Whether this mesh can emit particles (for mesh-vertex emitter). */
  particleEmitter?: boolean;
}

export type MeshGeometryKind = "box" | "sphere" | "plane" | "cylinder" | "torus" | "asset";

export interface MeshGeometryConfig {
  kind: MeshGeometryKind;
  /** Asset ID when kind is "asset". */
  assetId?: string;
  /** Geometry parameters (size, segments, etc.). */
  params?: Record<string, number>;
}

/** Particle system configuration. */
export interface ParticleRecipeConfig {
  /** Particle emitter definitions. */
  emitters: ParticleEmitterConfig[];
  /** Global forces applied to all particles. */
  globalForces?: ParticleForceConfig[];
  /** Maximum particle count across all emitters. */
  maxParticles: number;
}

export type ParticleEmitterShape = "point" | "sphere" | "box" | "mesh-vertex" | "ring";

export interface ParticleEmitterConfig {
  id: string;
  /** Shape of the emission volume. */
  shape: ParticleEmitterShape;
  /** For "mesh-vertex" shape: the scene mesh ID whose vertices emit particles. */
  meshId?: string;
  /** Particles per second. */
  rate: number;
  /** Particle lifetime range in seconds. */
  lifetime: { min: number; max: number };
  /** Initial velocity direction and magnitude. */
  velocity: {
    direction: [number, number, number];
    spread: number;
    speed: { min: number; max: number };
  };
  /** Particle size range. */
  size: { start: number; end: number };
  /** Particle opacity range. */
  opacity: { start: number; end: number };
  /** Color over lifetime (hex values). */
  color?: { start: number; end: number };
  /** Texture asset ID for particle sprites. */
  textureAssetId?: string;
  /** Blend mode. */
  blendMode?: "normal" | "additive" | "multiply";
  /** Local forces on this emitter. */
  forces?: ParticleForceConfig[];
}

export type ParticleForceKind = "gravity" | "wind" | "turbulence" | "attractor" | "drag";

export interface ParticleForceConfig {
  kind: ParticleForceKind;
  strength: number;
  direction?: [number, number, number];
  /** Position for attractor forces. */
  position?: [number, number, number];
  /** Frequency for turbulence forces. */
  frequency?: number;
}

/**
 * Gesture binding — continuous signal-to-parameter mapping.
 * Unlike V2 trigger rules (discrete: signal matches → fire actions),
 * bindings are continuous: while active, the signal value drives a parameter.
 */
export interface GestureBindingConfig {
  id: string;
  /** Input signal source. */
  signal: ArtexSignalType;
  /** For gesture/pose signals: which specific gesture/pose to bind. */
  gestureLabel?: string;
  /** Target parameter path (e.g. "emitters[0].rate", "lights[0].intensity"). */
  targetParam: string;
  /** Mapping function from signal value to parameter value. */
  mapping: SignalMappingConfig;
  /** Minimum confidence for this binding to be active. */
  minConfidence?: number;
  /** Smoothing factor (0 = no smoothing, 1 = very smooth). */
  smoothing?: number;
}

export interface SignalMappingConfig {
  /** Input range — signal values outside this are clamped. */
  inputRange: [number, number];
  /** Output range — mapped parameter values. */
  outputRange: [number, number];
  /** Curve shape. */
  curve?: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "step";
}

// ---------------------------------------------------------------------------
// Unified V3 Piece Config
// ---------------------------------------------------------------------------

/**
 * Complete V3 piece configuration — the top-level serializable config
 * that a piece package declares. Each section is optional; the presence
 * of a section determines which capabilities the piece uses.
 */
export interface PieceConfigV3 {
  /** Piece format version. */
  version: 3;
  /** Unique piece identifier. */
  id: string;
  /** Display title. */
  title: string;
  /** Rendering subsystem requirements. */
  renderer: RendererRequirements;
  /** Shader pass pipeline (WebGL Shader use case). */
  shaderStack?: ShaderStackConfig;
  /** Three.js scene graph recipe (Form/Release use case). */
  sceneRecipe?: SceneRecipeConfig;
  /** Particle system recipe (Form/Release use case). */
  particleRecipe?: ParticleRecipeConfig;
  /** Time-driven parameter evolution (Living Grass use case). */
  evolutionRules?: EvolutionRuleConfig[];
  /** Transition constraints (Living Grass use case). */
  mutationPolicy?: MutationPolicy;
  /** Signal-driven behaviour model (Illy use case). */
  behaviour?: BehaviourModelConfig;
  /** Continuous gesture-to-parameter bindings (Form/Release use case). */
  gestureBindings?: GestureBindingConfig[];
}
