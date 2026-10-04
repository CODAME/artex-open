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

/**
 * Every subsystem a piece may declare, and the ONE list that says so.
 *
 * The validator derives its allow-list from this array rather than restating
 * it. The two were separate lists and drifted: the union carried six members
 * while `VALID_SUBSYSTEMS` carried four, so `p5js` and `webgpu-scene`
 * typechecked and then threw `invalid_renderer` at validation (#3622).
 *
 * That was not cosmetic. `getWebGpuSceneConfig` dispatches on
 * `renderer.primary === "webgpu-scene"`, and the runtime resolves its config
 * through `extractPieceConfig`, which wraps `validatePieceConfig` in a bare
 * `catch` and returns null — so a published WebGPU scene rendered NOTHING,
 * silently, while the Studio's preview read `pieceConfigV3` directly, skipped
 * validation, and showed it working.
 *
 * Add a member here and the validator accepts it in the same commit; there is
 * no second list to remember. Adding one is still a widening of the published
 * contract surface, so it is an owner decision, not a drive-by.
 */
export const RENDERER_SUBSYSTEMS = [
  "shader",
  "three-scene",
  "particle",
  "audio-reactive",
  "p5js",
  "webgpu-scene",
] as const;

/** Individual subsystem that a piece may require. */
export type RendererSubsystem = (typeof RENDERER_SUBSYSTEMS)[number];

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

/**
 * TSL graph config for a WebGPU shader pass.
 * Phase 1 placeholder — the runtime ignores this field on WebGL2 paths.
 * Phase 2 will add a typed node-graph descriptor here.
 */
export interface TslPassGraphConfig {
  /** Asset ID of a TSL ESM module whose default export is `(inputs) => Node`. */
  scriptId?: string;
  /** Inline TSL ESM source (dev/preview use only; prefer scriptId in production). */
  inlineScript?: string;
}

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
  /** Optional TSL node graph — used by WebGPURendererBackend in Phase 2+. */
  tslGraph?: TslPassGraphConfig;
}

/**
 * Per-frame signal-to-uniform binding for a shader stack.
 *
 * Each frame the runtime reads `signal` from the context bus, applies
 * the artist-defined `floor`/`ceiling` clamp, normalises to [0, 1],
 * applies the optional `curve`, maps to `outputRange`, applies
 * exponential `smoothing`, and writes the result to the GLSL uniform
 * named by `uniform`.
 *
 * `ceiling` is the artist-defined cap on how far the environment can push
 * the parameter. Signal values above `ceiling` are clamped to
 * `outputRange[1]`.
 */
export interface ShaderParamBinding {
  /** Stable id — used to preserve smoothing state across `setBindings` calls. */
  id: string;
  /**
   * Signal source to sample each frame.
   *
   * Either a hardware/runtime `ArtexSignalType` (e.g. "proximity", "sound_level")
   * or a World Signals source name resolved by the World Signals runtime
   * (e.g. "weather.tempNorm", "time.season"). World-signal names are merged
   * into the live `SignalSnapshot.values` map by the runtime before bindings
   * sample it, so the executor reads both kinds the same way. The open
   * `(string & {})` arm keeps known signal names autocompleting while letting
   * plugins introduce new numeric signals without a contract change.
   */
  signal: ArtexSignalType | (string & {});
  /** Target GLSL uniform name (e.g. "uPresence", "windStrength"). */
  uniform: string;
  /** Signal input floor — values below this are treated as 0. Defaults to 0. */
  floor?: number;
  /** Artist-defined signal ceiling — caps how far the environment can push
   *  this parameter. Values above this clamp to `outputRange[1]`. */
  ceiling: number;
  /** Output range [min, max] for the uniform value. Defaults to [0, 1]. */
  outputRange?: [number, number];
  /** Transfer curve applied after floor/ceiling normalisation. */
  curve?: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "step";
  /** Exponential smoothing factor in [0, 1]. 0 = passthrough. */
  smoothing?: number;
  /** When false the binding is skipped; defaults to true. */
  enabled?: boolean;
}

/** Ordered pipeline of shader passes with global parameters. */
export interface ShaderStackConfig {
  /** Ordered list of shader passes — first pass reads the source, each subsequent pass reads the previous output. */
  passes: ShaderPassConfig[];
  /** Global parameters available to all passes (e.g. time, resolution). */
  globalParams?: Record<string, number>;
  /** Resolution scale factor (1.0 = native). */
  resolutionScale?: number;
  /** Per-frame signal-to-uniform bindings evaluated each rAF tick.
   *  Results are merged into `runtimeGlobals` after evolution and
   *  gesture-binding outputs, overriding them on collision. */
  bindings?: ShaderParamBinding[];
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
  /** Artist-facing name for this rule. Optional; the Studio falls back to the
   *  generated plain-language sentence. Additive (2026-08-15) for the rule
   *  builder — a rule the artist can name is one they can find again. */
  label?: string;
  /** When false the rule is skipped at runtime, without deleting it. Defaults
   *  to true. Additive (2026-08-15) so a rule can be muted while tuning. */
  enabled?: boolean;
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
/**
 * Where a resolved scene binding writes its value (COD-124).
 *
 * Generalizes the shader-only `ShaderParamBinding.uniform` target to the 3D
 * scene graph, so any World Signal can drive geometry — a transform channel, a
 * material scalar, a morph-target influence, or a procedural generator param —
 * not just a GLSL uniform. All variants reference a mesh by `meshId`
 * (`SceneMeshConfig.id`).
 */
export type SceneBindingTarget =
  | {
      kind: "transform";
      meshId: string;
      property: "position" | "rotation" | "scale";
      axis: "x" | "y" | "z";
    }
  | {
      kind: "material";
      meshId: string;
      property: "emissiveIntensity" | "opacity" | "metalness" | "roughness";
    }
  | {
      /** Morph-target influence. `morph` is the morph target name, or its index as a string. */
      kind: "morph";
      meshId: string;
      morph: string;
    }
  | {
      /** A `MeshGeometryConfig.params` key on a procedural mesh (drives the generator). */
      kind: "param";
      meshId: string;
      param: string;
    };

/**
 * Per-frame signal-to-scene binding (COD-124).
 *
 * Reuses the exact math of `ShaderParamBinding` (floor/ceiling normalise →
 * curve → outputRange → exponential smoothing) via the shared
 * `paramBindingMath` pipeline, but writes to a `SceneBindingTarget` instead of
 * a GLSL uniform. This is the one binding engine, one more target adapter — not
 * a parallel system.
 */
export interface SceneParamBinding {
  /** Stable id — preserves smoothing state across `setBindings` calls. */
  id: string;
  /** Signal source to sample each frame (hardware/runtime signal or World Signal name). */
  signal: ArtexSignalType | (string & {});
  /** Where the resolved value is written on the scene graph. */
  target: SceneBindingTarget;
  /** Signal input floor — values below this are treated as 0. Defaults to 0. */
  floor?: number;
  /** Artist-defined signal ceiling — values above this clamp to `outputRange[1]`. */
  ceiling: number;
  /** Output range [min, max] for the written value. Defaults to [0, 1]. */
  outputRange?: [number, number];
  /** Transfer curve applied after floor/ceiling normalisation. */
  curve?: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "step";
  /** Exponential smoothing factor in [0, 1]. 0 = passthrough. */
  smoothing?: number;
  /**
   * For `transform`/`material` targets: add the resolved value to the mesh's
   * configured base value instead of replacing it. Defaults to false (replace).
   * Ignored for `morph`/`param` targets (always absolute).
   */
  additive?: boolean;
  /** When false the binding is skipped; defaults to true. */
  enabled?: boolean;
}

export interface SceneRecipeConfig {
  /** Environment map or background. */
  environment?: SceneEnvironment;
  /** Light sources. */
  lights: SceneLightConfig[];
  /** Mesh objects. */
  meshes: SceneMeshConfig[];
  /** Fog settings. */
  fog?: { near: number; far: number; color: number };
  /**
   * Per-frame signal-to-scene bindings (COD-124), evaluated each rAF tick and
   * applied to the referenced mesh's transform / material / morph / generator
   * param. Same math as shader-stack `bindings`, different target.
   */
  bindings?: SceneParamBinding[];
}

export type SceneEnvironmentKind = "color" | "gradient" | "hdri";

export interface SceneEnvironment {
  kind: SceneEnvironmentKind;
  /** Hex color for "color" kind. */
  color?: number;
  /** Asset ID for "hdri" kind (resolved through the asset bundle). */
  hdriAssetId?: string;
  /**
   * Direct HDRI URL for "hdri" kind. Takes precedence over `hdriAssetId`
   * when both are present. Lets a piece reference an externally hosted
   * environment map (CDN) without bundling it. Loaded client-side.
   */
  hdriUrl?: string;
  /** Gradient stops for "gradient" kind. */
  gradientStops?: { position: number; color: number }[];
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

export type MeshGeometryKind =
  | "box"
  | "sphere"
  | "plane"
  | "cylinder"
  | "torus"
  | "asset"
  | "procedural";

export interface MeshGeometryConfig {
  kind: MeshGeometryKind;
  /** Asset ID when kind is "asset" (resolved through the asset bundle). */
  assetId?: string;
  /**
   * Direct model URL when kind is "asset". Takes precedence over `assetId`
   * when both are present. Lets a piece reference an externally hosted
   * glTF/GLB (e.g. an eztree.dev export or a CDN model) without bundling
   * it. Loaded client-side, same trust model as an HTML-block URL source.
   */
  url?: string;
  /**
   * Generator id when kind is "procedural" — the runtime resolves this to a
   * registered procedural geometry generator (e.g. "ez-tree"). This is a
   * platform capability: the generator is one configuration point, not a
   * locked-in feature. New generators register under new ids without a
   * contract change.
   */
  generator?: string;
  /**
   * Geometry parameters. For primitive kinds: dimensions and segment counts.
   * For "procedural": the generator's flat numeric parameter surface (e.g.
   * `seed`, `branchLevels`, `leafCount`) — numeric so the same params can be
   * driven by signal bindings and evolution rules.
   */
  params?: Record<string, number>;
}

/** Particle system configuration. */
export interface ParticleRecipeConfig {
  /** Particle emitter definitions. Ignored when `flowField` is present. */
  emitters: ParticleEmitterConfig[];
  /** Global forces applied to all particles. */
  globalForces?: ParticleForceConfig[];
  /** Maximum particle count across all emitters (and the GPU texture-size
   *  cap in flow-field mode). */
  maxParticles: number;
  /**
   * When present, the runtime uses the GPU-computed flow-field simulation
   * instead of the CPU emitter sim: every vertex of `sourceAssetId` becomes a
   * persistent particle advected through a simplex-noise flow field, decaying
   * back to its base position. `emitters` is ignored in this mode.
   */
  flowField?: FlowFieldSimConfig;
}

/**
 * GPU flow-field point-field simulation (seeded from a 3D model or point
 * cloud). A platform capability: any work can dissolve / breathe its geometry
 * through a noise field, configured by source + flow params.
 */
export interface FlowFieldSimConfig {
  /** Mesh or point-cloud asset whose vertices seed the particle field. */
  sourceAssetId: string;
  /** Noise gate: how sharply the field culls motion (0..1). */
  influence: number;
  /** Advection speed multiplier (>= 0). */
  strength: number;
  /** Noise spatial frequency (> 0). */
  frequency: number;
  /** Rendered point size (> 0, world units). */
  pointSize: number;
  /** Particle "life" decay per second — controls respawn cadence (> 0). */
  decay: number;
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
  /** Artist-facing name for this rule. Optional; the Studio falls back to the
   *  generated plain-language sentence. Additive (2026-08-15) for the rule
   *  builder — a rule the artist can name is one they can find again. */
  label?: string;
  /** When false the rule is skipped at runtime, without deleting it. Defaults
   *  to true. Additive (2026-08-15) so a rule can be muted while tuning. */
  enabled?: boolean;
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
// 5. Sketch + HTML + Plugin Blocks (C.3.1: engine-agnostic composition)
// ---------------------------------------------------------------------------

/**
 * Sketch block — a P5.js or other code-driven sketch participating in the
 * composition stack. Executes in a sandboxed iframe; signal sources reach
 * the sketch via a managed param surface, not direct DOM access.
 *
 * Engine-agnostic: artists author "a sketch block," the runtime decides
 * how to host it. Today that's P5; tomorrow we could swap the host without
 * changing the schema or the artist's authoring surface.
 */
export interface SketchBlockConfig {
  /** Where the sketch source lives. */
  source: SketchSource;
  /**
   * Parameters the sketch exposes for binding. Behaviour rules
   * (gesture bindings, evolution, state machine) drive these by name.
   */
  exposedParams?: Record<string, SketchParamSpec>;
  /** Sandbox restrictions. Defaults to V3 strict sandbox. */
  sandbox?: SketchSandboxConfig;
}

export type SketchSource =
  | { kind: "inline"; code: string }
  | { kind: "asset"; assetId: string };

export interface SketchParamSpec {
  /** Parameter type. Numeric is the only kind for C.3.1. */
  type: "number";
  /** Default value the sketch uses when no binding drives the param. */
  default: number;
  /** Optional bounds for the editor UI / binding range hints. */
  range?: [number, number];
}

/**
 * Sandbox restrictions for sketch blocks. Defaults are the strictest
 * V3 sandbox; opting in to additional capabilities is explicit.
 */
export interface SketchSandboxConfig {
  /** Allow `createCapture(VIDEO)` and friends. Default false. */
  allowVideoCapture?: boolean;
  /** Allow ML libraries (ml5.js, mediapipe). Default false. */
  allowMlLibraries?: boolean;
  /** Allow outbound network fetch from sketch. Default false. */
  allowNetwork?: boolean;
}

/**
 * HTML block — an iframe or inline HTML fragment in the composition stack.
 * Runtime forwards signal data via postMessage if a contract is declared;
 * otherwise the block is purely visual.
 *
 * Iframes cannot participate in GPU compositing (Web Platform constraint),
 * so HTML blocks are layered via DOM z-index — see Phase C plan §Q7.b.
 */
export interface HtmlBlockConfig {
  /** Where the HTML source lives. */
  source: HtmlSource;
  /** PostMessage contract for forwarding signals into the iframe. */
  signalPostMessage?: HtmlSignalContract;
  /** Whether the iframe captures pointer / keyboard events. Default false. */
  capturesInput?: boolean;
}

export type HtmlSource =
  | { kind: "url"; url: string }
  | { kind: "inline"; html: string };

export interface HtmlSignalContract {
  /** PostMessage event name the iframe listens for. */
  eventName: string;
  /** Signal types to forward; default none. */
  signals?: ArtexSignalType[];
  /**
   * Origin allowlist for postMessage targeting. Empty = same-origin only.
   * Concrete origins (no wildcards) are required for cross-origin delivery.
   */
  targetOrigin?: string[];
}

/**
 * Plugin block — wraps an engine-agnostic plugin envelope as a composition
 * block. The plugin's own manifest defines its config schema; this contract
 * just captures the reference + opaque blob.
 *
 * Runtime dispatch contract: see `BlockPlayerDefinition` in `@artex/extensions`.
 */
export interface PluginBlockConfig {
  /** Plugin manifest reference; the runtime resolves this to a loader. */
  pluginId: string;
  /** Plugin-defined config blob. Validated by the plugin, not the contract. */
  pluginConfig: Record<string, unknown>;
  /**
   * Asset ids from the piece package the plugin needs to read. The runtime
   * exposes only these to the player via context.getAsset(). Empty / absent
   * = no asset access.
   */
  assetReferences?: string[];
}

/**
 * Fracture block — a 3D mesh that shatters (Voronoi fracture) in response to a
 * trigger, then disperses its fragments. A platform authoring capability: any
 * artist can drop it into any project; nothing here is program-specific.
 *
 * Fracture-only (no physics engine): fragment motion is a cheap, *seeded*
 * outward drift + fade so the same piece fractures identically every run
 * (reproducibility) and the per-frame cost stays bounded. A future
 * `physics` config point is the documented extension for gravity-driven debris.
 */
export interface FractureBlockConfig {
  /**
   * Source mesh to fracture. A primitive geometry kind (box/sphere/…) is
   * watertight and works with zero setup; `kind: "asset"` fractures an
   * imported glTF (which must be manifold — see import-validation follow-up).
   */
  geometry: MeshGeometryConfig;
  /** Material id for the mesh + fragment faces (reuses the scene material set). */
  materialId?: string;
  /** Number of Voronoi fragments to generate. */
  fragmentCount: number;
  /** Voronoi tessellation mode (matches three-pinata's VoronoiOptions). */
  mode?: "3D" | "2.5D";
  /** Deterministic seed for both the Voronoi sites and the dispersal drift. */
  seed: number;
  /** Hard cap on rendered fragments — a performance guard. */
  maxFragments: number;
  /** What fires the fracture. */
  trigger: FractureTriggerConfig;
  /** How fragments behave after the fracture (no physics). */
  dispersal: FractureDispersalConfig;
  /**
   * Evolution rules evaluated locally when `trigger.source === "evolution"`.
   * The block runs its own EvolutionRuleEvaluator and watches `trigger.key`.
   */
  evolutionRules?: EvolutionRuleConfig[];
}

/** What value the fracture watches, and the rising-edge threshold that fires it. */
export interface FractureTriggerConfig {
  /**
   * Where the trigger value comes from:
   * - `signal`: a live signal value (`key` = signal name, e.g. "sound_peak" for
   *   an audio peak, or a gesture signal) read from the signal snapshot.
   * - `evolution`: a parameter from this block's `evolutionRules` (`key` = param).
   * - `manual`: fired imperatively from the preview "Fracture now" control.
   */
  source: "signal" | "evolution" | "manual";
  /** Value key for `signal` / `evolution` sources. Ignored for `manual`. */
  key?: string;
  /** The value must cross this threshold (rising edge) to fire a fracture. */
  threshold: number;
  /** Minimum ms between fractures — a re-arm cooldown. Default 1000. */
  cooldownMs?: number;
}

/** Deterministic, physics-free fragment behaviour after a fracture. */
export interface FractureDispersalConfig {
  /** Outward drift speed from the fracture centroid, world units per second. */
  speed: number;
  /** Fragment lifetime in ms before it is fully faded/removed. */
  lifetimeMs: number;
  /** Fade fragments toward transparent over their lifetime. */
  fade: boolean;
  /**
   * After the lifetime elapses, reassemble the source mesh and re-arm the
   * trigger (living-art loop) instead of leaving the fragments gone.
   */
  reassemble?: boolean;
}

// ---------------------------------------------------------------------------
// 6. V3 Block discriminated union + Composition (C.3.1)
// ---------------------------------------------------------------------------

/**
 * The kinds of visual blocks a V3 composition can contain.
 *
 * `shader-stack`, `scene`, `particle` are reframings of the existing
 * top-level fields on `PieceConfig`. `sketch`, `html`, `plugin` are net
 * new in C.3.1.
 *
 * Render order = array order in `composition[]`. Block z-index in the
 * runtime is the same as the array index — earlier entries render
 * underneath later entries (DOM layer stack; see Phase C plan §Q7.b).
 */
export type BlockKind = "shader-stack" | "scene" | "particle" | "sketch" | "html" | "plugin" | "fracture";

/** Every block has a stable id and a kind discriminator. */
interface BlockBase {
  id: string;
  /**
   * Whether this block renders. Absent means visible — every piece stored
   * before layer visibility existed carries no flag and must keep rendering
   * exactly as it did, so the test is `enabled !== false`, never `enabled`.
   *
   * Hiding is an authoring convenience, not a publishing one: a hidden block
   * is still part of the piece, still saved, still listed in the Compose
   * editor. It is skipped only where blocks are RENDERED, and every one of
   * those sites reads `getRenderableComposition()` rather than filtering for
   * itself — see `isBlockVisible`.
   */
  enabled?: boolean;
}

export interface ShaderStackBlock extends BlockBase {
  kind: "shader-stack";
  config: ShaderStackConfig;
}

export interface SceneBlock extends BlockBase {
  kind: "scene";
  config: SceneRecipeConfig;
}

export interface ParticleBlock extends BlockBase {
  kind: "particle";
  config: ParticleRecipeConfig;
}

export interface SketchBlock extends BlockBase {
  kind: "sketch";
  config: SketchBlockConfig;
}

export interface HtmlBlock extends BlockBase {
  kind: "html";
  config: HtmlBlockConfig;
}

export interface PluginBlock extends BlockBase {
  kind: "plugin";
  config: PluginBlockConfig;
}

export interface FractureBlock extends BlockBase {
  kind: "fracture";
  config: FractureBlockConfig;
}

/** Union of every supported V3 composition block. */
export type Block =
  | ShaderStackBlock
  | SceneBlock
  | ParticleBlock
  | SketchBlock
  | HtmlBlock
  | PluginBlock
  | FractureBlock;

// ---------------------------------------------------------------------------
// Unified V3 Piece Config
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 7. Context Input Adapters (artex.frame-buffer and future adapters)
// ---------------------------------------------------------------------------

/** Oscillator waveform shapes for artex.frame-buffer. */
export type OscillatorWave = "sine" | "sawtooth" | "square" | "none";

/**
 * Ceiling on artex.frame-buffer `captureCount`, shared by the contract's
 * validator, the adapter that reads the taps, the WebGL backend that binds
 * them and the Studio control that writes the value — four places that must
 * agree on one number. Set by the texture units the backend can spare: the
 * delayed frames start at TEXTURE8 (0–7 hold the live frame, channels and
 * state images), and 12 units is the floor on the desktop hardware Echo runs
 * on. Raising it means finding units first, not editing this line.
 */
export const MAX_FRAME_BUFFER_CAPTURES = 4;

/**
 * Configuration for the artex.frame-buffer context input adapter.
 * This adapter powers the Echo experience type — a camera feed delayed by
 * an arbitrary offset, enabling dissociative self-observation in installations.
 */
export interface FrameBufferAdapterConfig {
  id: "artex.frame-buffer";
  kind: "realtime";
  /** Ring depth in seconds (1–10). */
  bufferDepthSeconds?: number;
  /** Capture rate (frames per second). */
  fps?: number;
  /** Oscillator waveform. "none" uses the static readOffset value. */
  oscillatorWave?: OscillatorWave;
  /** Oscillator frequency in Hz (0.05–2.0). */
  oscillatorRateHz?: number;
  /** How many frames each ring slot holds before advancing (1–12). */
  repeaterCount?: number;
  /** Static read position when oscillator is "none" (0 = live, 1 = oldest). */
  readOffset?: number;
  /**
   * How many past moments the piece reads from the ring at once (1–4). 1 is
   * the original single delayed frame. Above 1, the extra captures sit
   * between `readOffset` and the oldest frame and layer behind the first as
   * fading trails, so raising the count never changes the image the artist
   * already had. Capped at 4 by the texture units the WebGL backend can
   * spare; a device with fewer binds fewer and reports the real count to the
   * shader.
   */
  captureCount?: number;
  /**
   * Live/delay mix (0 = pure delayed frame, 1 = pure live camera). Written by
   * the Studio's Camera memory section and read by the Echo shader path as
   * the u_blend uniform; the adapter itself does not consume it.
   */
  blend?: number;
  /**
   * Attract loop: when the camera sees no motion (room empty) for
   * `idleSeconds`, auto-drive the oscillator so the installation keeps
   * moving instead of freezing on a still frame. Reverts the moment motion
   * returns. Solves the original idle-freeze failure mode the circular
   * buffer was built for.
   */
  attractLoop?: {
    enabled: boolean;
    /** Seconds of no motion before the attract loop engages (10–1800). */
    idleSeconds: number;
    /** Oscillator waveform to sweep while idle. */
    wave: OscillatorWave;
    /** Oscillator frequency while idle (0.05–2.0 Hz). */
    rateHz: number;
  };
  /** Fallback behavior when the camera is unavailable. */
  fallback?: "black-frame";
}

/** A signal binding that maps one adapter output to another adapter input. */
export interface ContextInputBinding {
  /** Source signal (e.g. "artex.proximity.distance"). */
  source: string;
  /** Target parameter (e.g. "artex.frame-buffer.readOffset"). */
  target: string;
  curve?: "linear" | "inverse-linear" | "ease-in" | "ease-out";
  inputRange?: [number, number];
  outputRange?: [number, number];
}

/**
 * Discriminated union of all context input adapter configs.
 * Extend this union when adding a new adapter type.
 */
export type ContextInputAdapterConfig = FrameBufferAdapterConfig;

/** Context input adapters section of a V3 piece config. */
export interface ContextInputsConfig {
  adapters: ContextInputAdapterConfig[];
  bindings?: ContextInputBinding[];
}

/**
 * Complete V3 piece configuration — the top-level serializable config
 * that a piece package declares. Each section is optional; the presence
 * of a section determines which capabilities the piece uses.
 *
 * **Composition:** the `composition` field, when present, is the canonical
 * source for the visual block stack. Pieces written before C.3.1 used
 * top-level `shaderStack` / `sceneRecipe` / `particleRecipe` fields
 * directly; those still validate, and `getComposition()` lifts them into
 * an equivalent `composition[]` for runtime consumption.
 */
/**
 * Geographic location used to resolve location-dependent World Signals
 * (e.g. weather) for a piece. Overrides the installation default location.
 */
export interface WorldSignalsLocation {
  /** Decimal latitude, -90..90. */
  lat: number;
  /** Decimal longitude, -180..180. */
  lon: number;
  /** Optional human-readable label shown in Studio (e.g. "Gallery — SF"). */
  label?: string;
}

/**
 * Per-piece World Signals overrides, stored on `PieceConfig.worldSignals`.
 *
 * Resolution chain applied by the World Signals runtime (highest precedence
 * first): **recipe override → org override → live (resolved location) →
 * emulation**. `location` only affects the live tier — it pins where
 * location-dependent signals (weather) are sampled. `overrides` pins the
 * resolved value of a signal regardless of the live source.
 */
export interface WorldSignalsRecipeConfig {
  /** Pins the sampling location for location-dependent live signals. */
  location?: WorldSignalsLocation;
  /**
   * Static per-piece signal value overrides, keyed by signal name
   * (e.g. "weather.tempNorm"). Numeric for continuous signals, string for
   * structured signals (e.g. "weather.condition").
   */
  overrides?: Record<string, string | number>;
}

// ---------------------------------------------------------------------------
// 8. WebGPU scene experiences (instanced 3D on three's WebGPURenderer via R3F)
// ---------------------------------------------------------------------------

/** Instanced-mesh primitive used by the Particle Bloom experience. */
export type WebGpuMeshType = "octahedron" | "box" | "tetrahedron" | "icosahedron" | "sphere";

/** An RGB light as authored in Studio (hex colour + intensity). */
export interface WebGpuLight {
  /** Hex colour string (e.g. "#ff3366"). */
  color: string;
  /** Light intensity (>= 0). */
  intensity: number;
}

/** A light with a 2D placement (x, y in world units; z is fixed by the player). */
export interface WebGpuPositionedLight extends WebGpuLight {
  /** [x, y] world-space placement. */
  position: [number, number];
}

/**
 * Particle Bloom — hundreds of thousands of instanced lit meshes drifting with
 * per-instance velocity, two coloured point lights, and a bloom post-process.
 * GPGPU velocity (high `count`) and bloom are wired progressively; the minimal
 * player renders a modest CPU-transformed instance set.
 */
export interface ParticleBloomConfig {
  kind: "particle-bloom";
  /** Freeze the simulation. Default false. */
  paused?: boolean;
  /** Auto-rotate the scene. Default true. */
  rotate?: boolean;
  /** Instance count (1..250000). Default 80000. */
  count?: number;
  /** Instanced primitive. Default "octahedron". */
  meshType?: WebGpuMeshType;
  /** Per-instance world size (0.01..1). Default 0.08. */
  size?: number;
  /** Max drift speed in world units/sec (0..5). Default 1. */
  maxVelocity?: number;
  /** PBR metalness (0..1). Default 0.9. */
  metalness?: number;
  /** PBR roughness (0..1). Default 0.25. */
  roughness?: number;
  light1: WebGpuLight;
  light2: WebGpuLight;
  /** Bloom post-process tuning. */
  bloom: { strength: number; radius: number; threshold: number };
}

/**
 * Structural glass quality preset. Maps to the refraction sample count baked
 * into the material's TSL node graph, so changing it rebuilds the shader (a
 * brief hitch). Studio therefore exposes it as a committed preset, never a
 * live-dragged slider, and it must never join the bindable-param surface.
 */
export type GlassQuality = "low" | "medium" | "high";

/**
 * The glass params a live signal may drive (plan §6.3). Continuous uniforms
 * only — deliberately a closed union rather than `keyof GlassMaterialParams`,
 * because three fields must never appear here:
 *
 *  - `quality` and the wobble on/off state are **structural**: they are baked
 *    into the TSL node graph, so driving them per frame would rebuild the
 *    shader every frame. See `GlassQuality`.
 *  - `attenuationColor` is a hex string, not a scalar, and the binding math
 *    resolves to a number.
 *  - `enabled` swaps the whole material.
 *
 * Adding a member here is a claim that the param is a plain uniform. Check
 * that before extending it.
 */
export type GlassBindableParam =
  | "ior"
  | "thickness"
  | "dispersion"
  | "anisotropicBlur"
  | "distortion"
  | "distortionScale"
  | "temporalDistortion"
  | "attenuationDistance"
  | "transmission";

/**
 * A signal → glass-param binding. Same envelope as {@link SceneParamBinding}
 * (floor/ceiling → normalise → curve → outputRange → smoothing, shared
 * `paramBindingMath`), with a scalar glass param as the target instead of a
 * scene-graph channel. One binding engine, one more target adapter.
 *
 * Note the interaction with the wobble optimisation: a binding on
 * `distortion` forces the noise into the graph even when the authored base
 * value is 0, because the presence of the binding is known before the
 * material is built. Without that, the binding would write to a uniform the
 * shader never reads.
 */
export interface GlassParamBinding {
  /** Stable id — preserves smoothing state across `setBindings` calls. */
  id: string;
  /** Signal source to sample each frame (hardware/runtime signal or World Signal name). */
  signal: ArtexSignalType | (string & {});
  /** Which glass param the resolved value is written to. */
  param: GlassBindableParam;
  /** Signal input floor — values below this are treated as 0. Defaults to 0. */
  floor?: number;
  /** Artist-defined signal ceiling — values above this clamp to `outputRange[1]`. */
  ceiling: number;
  /** Output range [min, max] for the written value. Defaults to [0, 1]. */
  outputRange?: [number, number];
  /** Transfer curve applied after floor/ceiling normalisation. */
  curve?: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "step";
  /** Exponential smoothing factor in [0, 1]. 0 = passthrough. */
  smoothing?: number;
  /** Add to the authored base value instead of replacing it. Defaults to false. */
  additive?: boolean;
  /** When false the binding is skipped; defaults to true. */
  enabled?: boolean;
}

/**
 * Premium glass — a multi-sample volume-refraction material
 * (docs/plans/webgpu-glass-material-plan.md). All fields except `quality`
 * are continuous uniforms: live-updatable with no shader rebuild.
 *
 * Absent on all pre-existing pieces — when omitted, players keep their
 * original single-sample physical transmission, so published works are
 * unchanged (backward compatible).
 */
export interface GlassMaterialParams {
  /** Master switch. Absent object or `false` = original transmission path. */
  enabled: boolean;
  /** Index of refraction (1..2.5). Default 1.25. */
  ior?: number;
  /** Optical thickness in world units (0..4). Default 1. */
  thickness?: number;
  /** Per-channel IOR spread — chromatic dispersion (0..1). Default 0.25. */
  dispersion?: number;
  /** Refraction-blur strength, scaled by roughness (0..1). Default 0.5. */
  anisotropicBlur?: number;
  /** Noise-driven refraction wobble strength (0..1). Default 0. */
  distortion?: number;
  /** Noise frequency for the wobble (0.1..3). Default 0.5. */
  distortionScale?: number;
  /** Wobble animation speed (0..1). Default 0.2. */
  temporalDistortion?: number;
  /** Hex colour tint absorbed through the volume (e.g. "#ffffff"). */
  attenuationColor?: string;
  /** Distance at which the tint fully absorbs (0.05..10). Default 0.5. */
  attenuationDistance?: number;
  /** Backdrop mix against lit diffuse (0..1). Default 1. */
  transmission?: number;
  /** Structural sample-count preset. Default "medium". */
  quality?: GlassQuality;
  /**
   * Live signal → glass param bindings (plan §6.3). Evaluated each frame and
   * applied over the authored values above; absent or empty means the
   * authored values stand.
   */
  bindings?: GlassParamBinding[];
}

/**
 * Refraction Particles — a few thousand instanced refractive/glass particles
 * that can follow the pointer, with PBR + transmission/thickness tuning and
 * three placed lights. (Player + settings land in a later phase; the type is
 * defined here so the union and Studio share one contract.)
 */
export interface RefractionParticlesConfig {
  kind: "refraction-particles";
  paused?: boolean;
  /** Steer particles toward the pointer. Default true. */
  followMouse?: boolean;
  /** Instance count (100..8000). Default 2000. */
  count?: number;
  /** Base particle size (0.01..1). Default 0.15. */
  size0?: number;
  /** Size variance (0..1). Default 0.3. */
  size?: number;
  /** Max drift speed (0..5). Default 0.8. */
  maxVelocity?: number;
  /** PBR metalness (0..1). Default 0. */
  metalness?: number;
  /** PBR roughness (0..1). Default 0.05. */
  roughness?: number;
  /** Transmission/thickness tuning for the physical material. */
  thickness: { distortion: number; attenuation: number; power: number; scale: number };
  /**
   * Premium glass upgrade. When present and enabled the particles render with
   * the multi-sample volume-refraction material instead of the stock
   * single-sample transmission; the `thickness.*` controls above keep driving
   * the stock path only.
   */
  glass?: GlassMaterialParams;
  light: WebGpuLight;
  light1: WebGpuPositionedLight;
  light2: WebGpuPositionedLight;
}

/** Discriminated union of WebGPU scene experiences. Extend as new ones land. */
export type WebGpuSceneConfig = ParticleBloomConfig | RefractionParticlesConfig;

/**
 * Piece-level audio track (a soundtrack). Audio is NOT a visual composition
 * block — it has no z-order and is not composited — so it lives as a top-level
 * field on the piece, like {@link WorldSignalsRecipeConfig}.
 *
 * Artist's choice (both default true when omitted):
 * - `audible`: the track plays out loud. On public surfaces this is subject to
 *   browser autoplay policy (gesture-gated).
 * - `drivesSignals`: the track's FFT feeds the `sound_level` / `sound_peak`
 *   signals — so shaders (`uAudioLevel`), behaviour triggers, and gesture
 *   bindings react to the track instead of (or alongside) the room mic. A
 *   pure-driver track routes through a silent monitor node.
 *
 * Absent on all pre-existing pieces — backward compatible.
 */
export interface AudioTrackConfig {
  /** Asset id of the uploaded audio file (catalog `audio` / `mesh`-style ref). */
  assetId: string;
  /** Plays out loud. Defaults true. */
  audible?: boolean;
  /** FFT drives sound_level / sound_peak. Defaults true. */
  drivesSignals?: boolean;
  /** Loop at end of track. Defaults true. */
  loop?: boolean;
}

export interface PieceConfig {
  /** Piece format version. */
  version: 3;
  /** Unique piece identifier. */
  id: string;
  /** Display title. */
  title: string;
  /** Rendering subsystem requirements. */
  renderer: RendererRequirements;
  /**
   * Ordered visual block stack. Render order = array order. Introduced in
   * C.3.1; absent on pre-C.3.1 pieces, in which case the runtime lifts
   * `shaderStack` / `sceneRecipe` / `particleRecipe` into an equivalent
   * single-block (or compound) composition.
   */
  composition?: Block[];
  /** Shader pass pipeline (WebGL Shader use case). Pre-C.3.1 entry point. */
  shaderStack?: ShaderStackConfig;
  /** Three.js scene graph recipe (Form/Release use case). Pre-C.3.1 entry point. */
  sceneRecipe?: SceneRecipeConfig;
  /** Particle system recipe (Form/Release use case). Pre-C.3.1 entry point. */
  particleRecipe?: ParticleRecipeConfig;
  /** Time-driven parameter evolution (Living Grass use case). */
  evolutionRules?: EvolutionRuleConfig[];
  /** Transition constraints (Living Grass use case). */
  mutationPolicy?: MutationPolicy;
  /** Signal-driven behaviour model (Illy use case). */
  behaviour?: BehaviourModelConfig;
  /** Continuous gesture-to-parameter bindings (Form/Release use case). */
  gestureBindings?: GestureBindingConfig[];
  /**
   * Context input adapters that feed realtime signals and textures into the
   * shader runtime. Introduced for the Echo experience type.
   * Absent on all pre-existing pieces — backward compatible.
   */
  contextInputs?: ContextInputsConfig;
  /**
   * Per-piece World Signals overrides (location pin + static signal values).
   * Resolved by the World Signals runtime before bindings sample the snapshot.
   * Absent on all pre-existing pieces — backward compatible.
   */
  worldSignals?: WorldSignalsRecipeConfig;
  /**
   * WebGPU scene experience config (instanced 3D on `WebGPURenderer` via R3F).
   * Present only when `renderer.primary === "webgpu-scene"`. Absent on all
   * pre-existing pieces — backward compatible.
   */
  webgpuScene?: WebGpuSceneConfig;
  /**
   * Piece-level audio track (soundtrack). Plays and/or drives the sound
   * signals — see {@link AudioTrackConfig}. Not a visual composition block.
   * Absent on all pre-existing pieces — backward compatible.
   */
  audio?: AudioTrackConfig;
}

// ---------------------------------------------------------------------------
// Backcompat lift: top-level fields → composition[]
// ---------------------------------------------------------------------------

/** Stable IDs the lift function uses for legacy → composition entries. */
export const LEGACY_BLOCK_IDS = {
  shaderStack: "legacy-shader-stack",
  scene: "legacy-scene",
  particle: "legacy-particle",
} as const;

/**
 * Lifts legacy top-level fields (`shaderStack`, `sceneRecipe`,
 * `particleRecipe`) into a `Block[]`. Render order matches the legacy
 * runtime: shader → scene → particle.
 *
 * Pure function. Does not mutate `config`.
 */
export function liftLegacyToComposition(config: PieceConfig): Block[] {
  const blocks: Block[] = [];
  if (config.shaderStack) {
    blocks.push({ kind: "shader-stack", id: LEGACY_BLOCK_IDS.shaderStack, config: config.shaderStack });
  }
  if (config.sceneRecipe) {
    blocks.push({ kind: "scene", id: LEGACY_BLOCK_IDS.scene, config: config.sceneRecipe });
  }
  if (config.particleRecipe) {
    blocks.push({ kind: "particle", id: LEGACY_BLOCK_IDS.particle, config: config.particleRecipe });
  }
  return blocks;
}

/**
 * Returns the canonical composition for a piece. If the piece has an
 * explicit `composition` array (C.3.1+), that wins; otherwise lifts
 * legacy top-level fields.
 *
 * The runtime + Studio + synthesizer all read composition through this
 * function so they don't need to care about which entry point a piece
 * uses on disk.
 */
export function getComposition(config: PieceConfig): Block[] {
  if (config.composition && config.composition.length > 0) {
    // Filter out null/undefined elements that Firestore can introduce when
    // an `undefined` splice result is persisted. Only allocate a new array
    // when nulls are actually present so callers that rely on reference
    // stability see the original array in the common case.
    const hasNulls = config.composition.some((b) => b == null);
    return hasNulls
      ? config.composition.filter((b): b is Block => b != null)
      : config.composition;
  }
  return liftLegacyToComposition(config);
}

/**
 * True when a block should render.
 *
 * The single home of the absent-means-visible rule. Anything asking "does this
 * layer draw?" goes through here or through `getRenderableComposition()`; a
 * call site writing its own `block.enabled` test is how the default drifts.
 */
export function isBlockVisible(block: Block): boolean {
  return block.enabled !== false;
}

/**
 * The blocks that actually render, in stack order.
 *
 * `getComposition()` is TOTAL and stays that way — the Compose editor has to
 * list hidden layers to let anyone unhide them, and `resolveCompositionLayersMode`
 * has to count them so a piece whose layers are all hidden does not read as a
 * piece with no layers (which would strand them out of reach for an artist
 * without the authoring grant).
 *
 * So the split is by PURPOSE, not by caller: every site that draws blocks, or
 * decides whether there is anything to draw, reads this one. That includes the
 * Studio canvas, the published `/art` page, the standalone runtime player and
 * the publish-time playback warnings. A render site left on `getComposition()`
 * is the shape-drift defect this function exists to prevent: an artist hides a
 * layer in the Studio and it keeps rendering for visitors.
 */
export function getRenderableComposition(config: PieceConfig): Block[] {
  const blocks = getComposition(config);
  return blocks.every(isBlockVisible) ? blocks : blocks.filter(isBlockVisible);
}
