// src/types.ts
import type { AssetSharingSettings } from "./assetSharing";
import type { ArtexSignalType } from "./v2/types";

/** Renderer hint — selects the rendering backend for an experience */
export type RendererHint = "shader" | "particle" | "threejs" | "threejs+particle" | "p5js" | "auto";

/** Effect class categorization for automatic renderer selection */
export type EffectClass =
  | "flow-distortion"
  | "particle-trails"
  | "scene-driven-3d"
  | "2d-compositor"
  | (string & {});

/** Per-asset sharing settings map — stored inside ConfigJson. */
export interface AssetSharingConfig {
  baseImage?: AssetSharingSettings | null;
  shader?: AssetSharingSettings | null;
}

export interface EvolutionPhase {
  startDay: number;
  label: string;
  colorTemperatureShift: number; // -1..1 (cool..warm)
  noiseIntensity: number;        // 0..1
  brightnessShift: number;       // -1..1
}

export interface EvolutionMilestone {
  id: string;
  label: string;
  atDay: number;
  action?: string;
  notes?: string;
}

export interface EvolutionSchedule {
  anchor?: "install" | "specific-time" | "manual";
  startAt?: string;
  endAt?: string;
  timezone?: string;
  milestones?: EvolutionMilestone[];
}

export interface InteractionEventConfig {
  trigger: "viewer_close" | "night";
  effect: "increase_breathing" | "dim_scene";
  intensityDelta?: number;
  brightnessShift?: number;
  cooldownSeconds?: number;
}

export interface ShaderModuleConfig {
  id: string; // e.g., "flow-distortion", "color-evolution", "particle-overlay", "feedback", "depth-parallax"
  params: Record<string, number>; // Module-specific parameters
}

export type RuntimeTemplate = "none" | "flow" | "seasons" | "eyesBlink";
export type ArtistTemplate = "static" | "breathing" | "flowing" | "seasonal" | "presence" | "dream";
export type ArtistInteraction = "timeOfDay" | "presence" | "sound" | "random";
export type PreviewTimeOfDay = "dawn" | "noon" | "dusk" | "night";
export type ContextDriver = "none" | "daily" | "seasonal" | "ambience";
export type ContextAffects = "look" | "motion" | "events" | "everything";
export type ContextStyle = "calm" | "expressive" | "playful" | "cinematic";
export type ContextIntensity = "subtle" | "balanced" | "bold";

export interface ContextBehaviorConfig {
  enabled: boolean;
  driver: ContextDriver;
  affects: ContextAffects;
  style: ContextStyle;
  intensity: ContextIntensity;
}

export interface NativeAISettings {
  enabled: boolean;
  builtInSuggestions: boolean;
}

export type InteractionTarget = "media" | "shader" | "both";
export type InteractionSensitivity = "low" | "medium" | "high";
export type InteractionProfile = "stable" | "expressive" | "performance";
export type SimpleInteractionMode = "none" | InteractionProfile | "custom";
export type TouchMediaControlsDesktopFallback = "auto" | "always" | "never";
export type TouchMediaControlsResetGesture = "double-tap";
export type LLMProvider =
  | "disabled"
  | "local"
  | "openai"
  | "anthropic"
  | "mistral"
  | "google"
  | "custom_openai_compatible";
export type AIConnectionStatus = "unknown" | "ok" | "error";
export type AISuggestionSource = "local" | "remote";
export type RendererMode = "webgl" | "three-experimental" | "hybrid-reactive-field" | "p5js" | "html" | "webgpu";

/** The canonical set, for membership checks and for validating writers. */
const RENDERER_MODES: ReadonlySet<string> = new Set<RendererMode>([
  "webgl", "three-experimental", "hybrid-reactive-field", "p5js", "html", "webgpu",
]);

/**
 * Legacy `rendererMode` values that were written to saved configs but are not
 * members of {@link RendererMode}, mapped to what they were meant to be.
 *
 * `"reactive-field"` is *style/medium* vocabulary (ArtistPreferredMedium, the
 * style pickers, library tags). The Create flow wrote it as a RENDERER mode for
 * particle and scene pieces through a `Record<BlockKind, string>` that erased
 * the union, and nothing validates rendererMode at runtime — so it reached
 * Firestore and is in saved data (#3242). Every reader that branches on the
 * mode therefore fell through to its default: those pieces got the shader
 * canvas in the Studio, no hybrid runtime on the published page, and no "3D"
 * badge in the library.
 *
 * Repaired on READ rather than by backfilling the records, so a piece is
 * correct the moment it is opened and no migration has to reach every doc.
 */
const LEGACY_RENDERER_MODE_ALIASES: Readonly<Record<string, RendererMode>> = {
  "reactive-field": "hybrid-reactive-field",
};

/**
 * A stored `rendererMode` as a real {@link RendererMode}.
 *
 * Returns null for absent or unrecognized values so callers keep their own
 * fallback rather than inheriting one — `getRendererCapabilities` defaults to
 * `webgl`, but a badge or a label may want to render nothing instead.
 */
export function normalizeRendererMode(value: string | null | undefined): RendererMode | null {
  if (!value) return null;
  if (RENDERER_MODES.has(value)) return value as RendererMode;
  return LEGACY_RENDERER_MODE_ALIASES[value] ?? null;
}

/** True when `value` is a member of {@link RendererMode} as written. */
export function isRendererMode(value: string | null | undefined): value is RendererMode {
  return typeof value === "string" && RENDERER_MODES.has(value);
}
export type InteractionActionId =
  | "stop_open_palm"
  | "exit_wave"
  | "explosion_mouth_open"
  | "celebration_clap_sound"
  | "zoom_proximity"
  | "swap_shader_on_signal";

/**
 * All MediaPipe-derived gesture signals that can be bound to actions. Matches
 * the keys in `InteractionGestureSignals` (see apps/creator/src/utils/interactionLab.ts).
 */
export type GestureSignalName =
  | "pinchHold"
  | "pinchReleasePulse"
  | "pinchDistance"
  | "spread"
  | "swipe"
  | "swipeLeft"
  | "swipeRight"
  | "swipeUp"
  | "swipeDown"
  | "openPalm"
  | "mouthOpen"
  | "jawOpen"
  | "fist"
  | "fistReleasePulse"
  | "pointing"
  | "thumbsUp"
  | "thumbsDown"
  | "victory"
  | "iLoveYou"
  | "smile"
  | "frown"
  | "eyeWink"
  | "leftEyeOpen"
  | "rightEyeOpen"
  | "eyebrowRaise"
  | "handDepth"
  | "indexCurl"
  | "middleCurl"
  | "ringCurl"
  | "pinkyCurl"
  | "leftHandPresent"
  | "rightHandPresent"
  | "manualClapPulse"
  | "holdingPhone";

/**
 * Visual configuration for the skeleton/presence overlay canvas. All fields
 * are optional; missing values fall back to `DEFAULT_SKELETON_OVERLAY_STYLE`.
 */
export interface SkeletonOverlayStyle {
  showFace?: boolean;
  showHands?: boolean;
  showPose?: boolean;
  showFaceFeatures?: boolean;   // draw detailed face groups (eyes/brows/lips/iris/oval) in addition to contours
  showGestureLabels?: boolean;  // float the detected gesture label near each hand's wrist
  faceColor?: string;       // CSS color — face landmark dots & connections
  handColor?: string;       // CSS color — fallback when L/R colors are absent
  leftHandColor?: string;   // CSS color — specifically for hands labelled "Left"
  rightHandColor?: string;  // CSS color — specifically for hands labelled "Right"
  poseColor?: string;       // CSS color — pose landmarks + skeleton connections
  opacity?: number;         // 0..1 — overall overlay opacity multiplier
  lineWidth?: number;       // px — connection stroke width
  pointRadius?: number;     // px — landmark dot radius
  highlightFingertips?: boolean; // render fingertip landmarks at a larger radius for tactile emphasis
}

/**
 * User-authored gesture → action binding. When the named gesture signal rises
 * above `threshold` (default 0.5) and the binding is enabled, the bound
 * action fires (with `cooldownMs` debounce, default 500ms).
 */
export interface GestureActionBinding {
  id: string;
  gesture: GestureSignalName;
  action: InteractionActionId;
  enabled: boolean;
  threshold?: number;
  cooldownMs?: number;
  /**
   * Only read by `swap_shader_on_signal`: the builtin shader id to swap to
   * while the bound signal is above threshold. On release the runtime
   * restores the project's configured shader.
   */
  triggeredShaderId?: string;
}

/**
 * Phase 2 of the unified Interactions proposal — a **continuous** binding
 * modulates an artwork parameter with a scalar signal (e.g. camera proximity
 * drives the `bloomAmount` uniform). Complements the discrete gesture →
 * action bindings above.
 *
 * `source.id` must be a valid signal source id (`camera`, `mic`, `time`,
 * `simulator.pointer`, or a plugin-origin id). `source.signal` is one of the
 * signal names the source publishes (e.g. `proximity`, `level`, `elapsed`).
 *
 * `target.name` references `manifest.parameters.exposes[].id` from the
 * cross-runtime manifest work. For shader renderers it maps to a uniform;
 * for p5.js/html it maps to a named sketch parameter.
 *
 * This type is **additive** in this release. Runtime subscription and UI
 * for creating bindings ships in a follow-up; the type lands first so
 * downstream workstreams can reference a stable shape.
 */
export interface ContinuousBinding {
  id: string;
  /** Stable id of the signal source. */
  sourceId: string;
  /** Signal name within the source, e.g. "proximity", "level", "elapsed". */
  signal: string;
  /** Parameter id from `manifest.parameters.exposes` the binding drives. */
  parameter: string;
  /** Input multiplier applied before smoothing/clamp. Defaults to 1.0. */
  gain?: number;
  /** Output clamp applied after gain + smoothing. Defaults to [0, 1]. */
  range?: [number, number];
  /** Exponential smoothing factor in [0,1]. 0 = passthrough, 0.9 = heavy. Defaults to 0. */
  smoothing?: number;
  enabled: boolean;
}

/**
 * One parameter exposed by a manifest for binding. Lands here now so the
 * cross-runtime manifest work (PR #61 proposal) has a stable shape to target
 * — the runtime that consumes it arrives in a follow-up.
 */
export interface ParameterExposure {
  /** Stable id — referenced from `ContinuousBinding.parameter`. */
  id: string;
  label: string;
  /** Expected [min, max] range. Bindings clamp to this if no explicit range. */
  range?: [number, number];
  /** Unit hint for human-readable UI ("%", "px", "°"). */
  unit?: string;
  /** Default value when no binding is active. */
  default?: number;
}

export interface AISettings {
  enabled: boolean;
  provider: LLMProvider;
  modelId?: string;
  endpoint?: string;
  apiKeyStoredLocally?: boolean;
  allowMetadataSend: boolean;
  allowImageSend: boolean;
  allowSuggestionHistoryStorage: boolean;
  localOnly: boolean;
  connectionStatus: AIConnectionStatus;
}

export interface ProjectAIPolicy {
  allowRemoteAI: boolean;
  allowMetadataSend: boolean;
  allowImageSend: boolean;
  forceLocalOnly: boolean;
}

export interface ArtexSuggestionShaderPatch {
  source: "builtin_library";
  builtinShaderId: string;
  shaderLabel?: string;
}

export interface ArtexSuggestionPatch {
  artistTemplate?: ArtistTemplate;
  mood?: number;
  simpleInteractions?: ArtistInteraction[];
  interactionProfile?: InteractionProfile;
  shader?: ArtexSuggestionShaderPatch;
}

/**
 * The curatorial origin a recommendation traces back to (Design Commitment 5,
 * "Taste as Infrastructure"). AI amplifies human judgment; it does not replace
 * it, so every recommendation carries where its taste came from. This is
 * orthogonal to `ArtworkSuggestionState.currentSetupOrigin`, which records *how*
 * a setup was produced (manual / ai / random); attribution records *why* / from
 * whom. Helpers and validation live in `ai/suggestionAttribution`.
 */
export type SuggestionAttributionType =
  | "artist-mapping"
  | "curator"
  | "system-context"
  | "codame-principle";

export interface SuggestionAttribution {
  /** Which curatorial-origin category this recommendation traces back to. */
  type: SuggestionAttributionType;
  /** Inline, user-facing byline shown with the suggestion. Always required. */
  label: string;
  /** Optional longer explanation, surfaced on demand. */
  detail?: string;
  /** When `type === "curator"`: links to the curator's profile. */
  curatorId?: string;
  /** When `type === "curator"`: the curator's display name. */
  curatorName?: string;
}

export interface ArtexSuggestion {
  id: string;
  createdAt: string;
  provider: Exclude<LLMProvider, "disabled">;
  suggestionSource: AISuggestionSource;
  summary: string;
  rationale?: string;
  inputSignature?: string;
  /** Curatorial origin of this recommendation. Present on every AI-generated
   *  recommendation; absent on pure-random variations (not recommendations). */
  attribution?: SuggestionAttribution;
  patch: ArtexSuggestionPatch;
}

export interface ArtworkSuggestionState {
  suggestionAvailable: boolean;
  suggestionStale: boolean;
  suggestionSource: AISuggestionSource | null;
  provider: Exclude<LLMProvider, "disabled"> | null;
  currentSetupOrigin: "manual" | "ai" | "ai_edited" | "regenerated" | "randomized";
  lastAcceptedSuggestionId?: string;
  snapshotCount: number;
}

export interface ArtexSuggestionSnapshot {
  id: string;
  createdAt: string;
  origin: ArtworkSuggestionState["currentSetupOrigin"];
  suggestionId?: string;
  patch: ArtexSuggestionPatch;
}

export interface InteractionActionMapping {
  id: InteractionActionId;
  enabled: boolean;
  target: InteractionTarget;
  sensitivity: InteractionSensitivity;
  cooldownMs: number;
}

export interface TouchMediaControlsBaseline {
  translateX: number;
  translateY: number;
  scale: number;
  rotationDegrees: number;
}

export interface TouchMediaControlsConfig {
  enabled: boolean;
  desktopFallback: TouchMediaControlsDesktopFallback;
  resetGesture: TouchMediaControlsResetGesture;
  baseline: TouchMediaControlsBaseline;
}

export interface InteractionsConfig {
  simpleInteractionsEnabled?: boolean; // Master toggle for default mapped interactions
  simpleInteractionMode?: SimpleInteractionMode; // Preset mode selector for simple interactions
  audioReactive?: boolean;
  proximitySensor?: boolean;
  cameraReactive?: boolean;
  gestureLab?: boolean; // Experimental multi-signal interaction mode
  interactionSafeMode?: boolean; // Dampens extreme reactions
  interactionHud?: boolean; // Shows real-time interaction badges
  interactionLabTarget?: "media" | "shader" | "both"; // Where Gesture Lab applies effects
  interactionConsoleLogs?: boolean; // Emits live input/action traces in browser console
  mediapipeGestures?: boolean; // Camera hand gesture recognition (MediaPipe Tasks)
  mediapipeFaceProximity?: boolean; // Optional face distance cues from FaceLandmarker
  mediapipeObjectDetection?: boolean; // Opt-in MediaPipe ObjectDetector (COCO). Required for `holdingPhone` signal.
  mediapipeTestMode?: boolean; // Enables visual tracker test panel
  showSkeletonOverlayInPlayerMode?: boolean; // Skeleton/presence overlay default-on in player mode & published view
  skeletonOverlayStyle?: SkeletonOverlayStyle; // Visual configuration for presence overlay
  gestureActionBindings?: GestureActionBinding[]; // User-authored gesture → action mappings
  continuousBindings?: ContinuousBinding[]; // Phase 2: signal → parameter modulation (additive; runtime wiring ships later)
  interactionProfile?: InteractionProfile; // User-facing preset for interaction mapping
  actionMappings?: InteractionActionMapping[]; // Input -> effect mapping cards used by default UX
  customActionMappings?: InteractionActionMapping[]; // User-defined mappings persisted under Custom mode
  touchMediaControls?: TouchMediaControlsConfig; // Authored touch-first media pan/zoom controls
  audioReactiveGain?: number; // 0..1 — pre-processing gain on raw audio signal (default 0.5)
  audioReactiveIntensity?: number; // 0..1 — post-processing visual response scale (default 0.5)
  supportsProximity?: boolean; // Legacy field, kept for backward compatibility
  supportsAmbientLight?: boolean; // Legacy field, kept for backward compatibility
  // ── Music-as-input via MIDI (Phase A) ─────────────────────────────────────
  // Master toggle for Web MIDI input. When false, no MIDI processing happens.
  // See docs/video-driven-midi-plan.md.
  midiInputEnabled?: boolean;
  // Configuration block: port id, channel filter, signal mappings.
  midiInput?: MidiInputConfig;
}

// ── MIDI input config (Phase A — Music-as-input) ───────────────────────────
//
// Receives MIDI from an external music app (Ableton, Max, Logic, Bitwig…)
// via Web MIDI API. Incoming events are derived into continuous signals
// (beatPhase, tempo, CC values, note triggers) that feed the existing
// shader-interaction pipeline. See docs/video-driven-midi-plan.md for
// the full design and signal catalog.

/** Curve applied between raw MIDI signal (0..1) and destination signal. */
export type MidiCurve = "linear" | "exp" | "log" | "threshold";

/**
 * What MIDI data to read on each frame. Static-named sources cover the
 * common timing/note aggregates; the discriminated-union variants read
 * specific CCs and note triggers.
 */
export type MidiSourceId =
  | "beatPhase"        // 0..1, increments on MIDI Clock pulses, wraps per quarter note
  | "barPhase"         // 0..1, syncs to Song Position Pointer; falls back to beatPhase * 0.25
  | "tempo"            // BPM / 240, clamped 0..1
  | "noteDensity"      // count of note-ons in last second / 16, clamped
  | "activeNotes"      // count of currently-held notes / 16, clamped
  | "lastNoteVelocity" // velocity of most recent note-on, decays over 500ms
  | "lastNotePitch"    // note number of most recent note-on / 127
  | { kind: "cc"; channel: number | "any"; controller: number } // channel 1..16, controller 0..127
  | { kind: "note-trigger"; channel: number | "any"; note: number }; // pulses to 1.0 on note-on, 100ms decay

/** Destination signal slot in the shader-interaction pipeline. */
export type MidiSignalDestination =
  | "audioLevel"
  | "bassLevel"
  | "midLevel"
  | "trebleLevel"
  | "proximity"
  | "cameraLevel"
  | "mediapipeIntensity"
  | "midi.slot1"
  | "midi.slot2"
  | "midi.slot3";

/** A single MIDI source → shader-signal mapping. */
export interface MidiSignalMapping {
  id: string;
  source: MidiSourceId;
  destination: MidiSignalDestination;
  curve: MidiCurve;
  /** Smoothing alpha (0.05 = slow, 0.5 = snappy). Default 0.2. */
  smoothingAlpha: number;
}

/**
 * Per-piece MIDI input configuration. Lives on `InteractionsConfig`. The
 * `portId` is opaque (returned by `navigator.requestMIDIAccess()`) and
 * stable across reconnects within a session.
 */
export interface MidiInputConfig {
  /** Web MIDI input port id. Null/undefined = no port selected yet. */
  portId?: string | null;
  /** Optional channel filter (1..16). When omitted/empty, all channels pass. */
  channels?: number[];
  /** Source → destination mappings. Empty = use default beat-sync fallback. */
  mappings: MidiSignalMapping[];
  /** Source template id when forked from a CODAME-provided patch. */
  sourceTemplateId?: string | null;
  /** Optional human-readable label. */
  label?: string;
  /** Optional channel labels surfaced in the mapping editor + monitor. */
  channelLabels?: Record<number, string>;
}

export interface DiagnosticsSummaryItem {
  id: string;
  severity: "info" | "warning" | "error";
  title: string;
}

export interface DiagnosticsSummary {
  lastRunAt: string;
  status: "ok" | "ok_with_warnings" | "not_compatible";
  tierEstimate: "A_safe" | "B_risky" | "C_desktop_only";
  metrics?: {
    avgMsPerFrame: number;
    approxFps: number;
    w: number;
    h: number;
  };
  items: DiagnosticsSummaryItem[];
}

export interface TouchDesignerWarningSummary {
  code: string;
  path: string;
  message: string;
  severity: "info" | "warn" | "error";
}

export interface TouchDesignerEffectPassSummary {
  id: string;
  sourceTopPath: string;
  type: string;
  supported: boolean;
  params: Record<string, number | string | boolean>;
  inputPassIds: string[];
}

export interface TouchDesignerSignalNodeSummary {
  id: string;
  type: string;
  path?: string;
  params?: Record<string, number | string | boolean>;
}

export interface TouchDesignerSignalGraphSummary {
  nodes: TouchDesignerSignalNodeSummary[];
}

export interface TouchDesignerBindingSummary {
  id: string;
  sourceNodeId?: string;
  sourceChannel?: string;
  targetPath: string;
  targetParam: string;
  targetPassId?: string;
  scale: number;
  bias: number;
  clamp01: boolean;
  status: "ok" | "manual_fallback" | "missing_source";
  manualControlId?: string;
}

export interface TouchDesignerImportSummary {
  manifestVersion: "td_artex_manifest_v0.1";
  importedAt: string;
  outputTop: string;
  summary: {
    topPassesCompiled: number;
    signalNodesCompiled: number;
    bindingsCompiled: number;
    unsupportedOps: number;
  };
  warnings: TouchDesignerWarningSummary[];
  effectStack: TouchDesignerEffectPassSummary[];
  signalGraph: TouchDesignerSignalGraphSummary;
  bindings: TouchDesignerBindingSummary[];
  assetPaths?: string[];
}

export interface PreviewConfig {
  resolutionScale?: number;
  shaderWrapperDefaults?: boolean;
  shaderOnlyCanvasBackgroundColor?: string;
}

// ---------------------------------------------------------------------------
// Signal Bindings for imported runtimes (p5.js / HTML)
//
// Universal capability that maps ARTEX `artex.*` inputs onto an imported work's
// parameters without editing the imported source. Two layers:
//   - Layer 0 (`CodeInputShimConfig`): drive the runtime's NATIVE inputs
//     (p5 `mouseX`/`mouseY`, synthetic DOM pointer events) from signals — zero
//     config beyond a toggle, so existing sketches react on a display.
//   - Layer 1 (`CodeParamBinding` → `artex.params`): declarative signal→param
//     bindings the artist configures in Studio, reusing the same transform math
//     as `ShaderParamBinding` (floor/ceiling/curve/range/smoothing).
// See docs/signal-bindings-imported-runtimes.md.
// ---------------------------------------------------------------------------

/** Which signal drives the synthesized pointer position under Layer 0. */
export type CodeInputPointerSource = "point" | "face" | "movement";

/**
 * Layer 0 — native-input shimming for an imported runtime. When enabled, the
 * sandbox writes the runtime's own input channels each frame from live signals,
 * so a sketch that only reads `mouseX` / listens for `mousemove` becomes
 * reactive on a pointer-less display.
 */
export interface CodeInputShimConfig {
  /** Master switch. When false (or absent) no shimming occurs. */
  enabled: boolean;
  /**
   * Signal pair driving the synthesized cursor. `"point"` uses the pointing
   * finger (`pointX`/`pointY`), `"face"` uses face position, `"movement"`
   * sweeps with movement energy. Defaults to `"point"`.
   */
  pointerSource?: CodeInputPointerSource;
  /**
   * Signal whose value (≥ 0.5) synthesizes a pressed state (p5 `mouseIsPressed`,
   * DOM `mousedown`). E.g. `"pinch"`. When absent, no press is synthesized.
   */
  pressSignal?: ArtexSignalType | (string & {});
}

/**
 * A bindable parameter an imported work advertises (Layer 1). The work reads
 * `artex.params.<name>`; ARTEX lists declared params in the Studio binding UI.
 */
export interface CodeParamDecl {
  /** Param key the sketch reads as `artex.params[name]`. */
  name: string;
  /** Human-readable label for the Studio UI. Defaults to `name`. */
  label?: string;
  /** Resting value used when no binding is active. Defaults to 0. */
  default?: number;
}

/**
 * Layer 1 — one signal→param binding for an imported runtime. Structurally a
 * sibling of `ShaderParamBinding` (same transform pipeline) whose target is an
 * `artex.params` key rather than a GLSL uniform. Evaluated each frame by
 * `CodeParamBindingExecutor`, results posted into the sandbox's `artex.params`.
 */
export interface CodeParamBinding {
  /** Stable id — preserves smoothing state across `setBindings` calls. */
  id: string;
  /** Signal source to sample each frame (hardware/runtime or World Signal). */
  signal: ArtexSignalType | (string & {});
  /** Target `artex.params` key (must match a declared `CodeParamDecl.name`). */
  param: string;
  /** Signal input floor — values below this are treated as 0. Defaults to 0. */
  floor?: number;
  /** Artist-defined signal ceiling — caps how far the environment pushes this
   *  param. Values above this clamp to `outputRange[1]`. */
  ceiling: number;
  /** Output range [min, max] for the param value. Defaults to [0, 1]. */
  outputRange?: [number, number];
  /** Transfer curve applied after floor/ceiling normalisation. */
  curve?: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "step";
  /** Exponential smoothing factor in [0, 1]. 0 = passthrough. */
  smoothing?: number;
  /** When false the binding is skipped; defaults to true. */
  enabled?: boolean;
}

/**
 * Which major version of the p5.js runtime a sketch is authored for.
 *
 * p5 2.0 renamed core sketch APIs (`curveVertex`→`splineVertex`,
 * `curve`→`spline`, …), so a v1 sketch throws on the v2 runtime and vice
 * versa. The platform bundles both runtimes and loads the one matching this
 * field. Imports and existing work default to `"1"`; authoring against `"2"`
 * is opt-in per sketch. See docs/p5-upgrade.md.
 */
export type P5MajorVersion = "1" | "2";

/** P5.js sketch configuration stored in ConfigJson. */
export interface P5jsSketchConfig {
  /** The sketch source code (instance-mode P5.js). */
  sketchSource: string;
  /**
   * p5.js runtime major version this sketch targets. Absent/`"1"` → p5 v1
   * (the default for imports and existing work); `"2"` → p5 v2. See
   * {@link P5MajorVersion}.
   */
  p5Version?: P5MajorVersion;
  /** Whether to use P5.js WebGL mode instead of 2D canvas. */
  webglMode?: boolean;
  /** Optional libraries to load alongside P5.js (e.g. "p5.sound"). */
  libraries?: string[];
  /** Layer 0 — map ARTEX signals onto p5's native inputs (mouseX, etc.). */
  inputShim?: CodeInputShimConfig;
  /** Layer 1 — bindable params the sketch reads via `artex.params.<name>`. */
  params?: CodeParamDecl[];
  /** Layer 1 — signal→param bindings evaluated each frame. */
  paramBindings?: CodeParamBinding[];
}

/** HTML experience configuration stored in ConfigJson. */
export interface HtmlExperienceConfig {
  /** The full HTML source (including scripts). */
  htmlSource: string;
  /** Layer 0 — synthesize DOM pointer events from ARTEX signals. */
  inputShim?: CodeInputShimConfig;
  /** Layer 1 — bindable params the page reads via `artex.params.<name>`. */
  params?: CodeParamDecl[];
  /** Layer 1 — signal→param bindings evaluated each frame. */
  paramBindings?: CodeParamBinding[];
}

export interface PreviewSimulationState {
  timeOfDay: PreviewTimeOfDay;
  viewerPresence: boolean;
  viewerDistance: number;
  soundLevel: number;
  bassLevel: number;
  transientLevel: number;
  clapLevel: number;
  beatLevel: number;
  sustainedLevel: number;
  soundPulseCount: number;
  randomPulseCount: number;
}

export interface ReactiveFieldConfigJson {
  bladeCount?: number;
  fieldRadius?: number;
  palette?: {
    color1?: string;
    color2?: string;
    color3?: string;
  };
  windMultiplier?: number;
  disturbanceMultiplier?: number;
  dofFocusDistance?: number;
}

export type MediaFusionMode = "flow";
export type FusionPresencePreset = "static" | "aura" | "surface" | "breath" | "flow" | "melt" | "presence" | "custom";

export interface MediaFusionSettings {
  enabled: boolean;
  strength: number;
  mode: MediaFusionMode;
}

export interface FusionPresenceSettings {
  fusion: number;
  presence: number;
  preset: FusionPresencePreset;
}

export interface ConfigJson {
  version: number;
  artworkId?: string;
  title: string;
  artistName?: string;
  externalArtistCredits?: string[];
  story: string;
  medium?: string;

  layers: {
    base: {
      parallaxDepth: number;
      breathingIntensity: number;
      textureDrift: number;
    };
  };

  animation: {
    baseSpeed: number;
    breathingEnabled: boolean;
    parallaxEnabled: boolean;
    colorShiftEnabled: boolean;
  };

  evolution: {
    mode: "timeBased" | "eventBased" | "mixed";
    durationDays: number;
    phases: EvolutionPhase[];
    schedule?: EvolutionSchedule;
  };

  shader_modules?: ShaderModuleConfig[];
  // Preserves manually authored Shader Modules (Advanced) when switching templates.
  advancedShaderModules?: ShaderModuleConfig[];

  shader?: {
    flowIntensity: number;
    flowSpeed: number;
    flowScale: number;
  };

  rendererMode?: RendererMode;
  reactiveField?: ReactiveFieldConfigJson;
  fusion?: MediaFusionSettings;
  livingSurface?: FusionPresenceSettings;

  /** P5.js sketch configuration — present when rendererMode is "p5js". */
  p5js?: P5jsSketchConfig;
  /** HTML experience configuration — present when rendererMode is "html". */
  html?: HtmlExperienceConfig;

  template?: RuntimeTemplate;
  artistTemplate?: ArtistTemplate;
  mood?: number; // 0..1, artist-facing macro control
  simpleInteractions?: ArtistInteraction[];
  contextBehavior?: ContextBehaviorConfig;
  nativeAI?: NativeAISettings;

  seasons?: {
    enabled: boolean;
    previewSeason: 0 | 1 | 2 | 3; // 0=winter, 1=spring, 2=summer, 3=autumn
    intensity: number;
  };

  eyesBlink?: {
    enabled: boolean;
    frequency: number; // blinks per minute
    style: "natural" | "exaggerated";
    eyesOpen?: number; // 0.0 = closed, 1.0 = open (for state blending)
  };

  interaction: {
    supportsProximity: boolean;
    supportsAmbientLight: boolean;
    events: InteractionEventConfig[];
  };

  interactions?: InteractionsConfig; // New format for interaction capabilities
  preview?: PreviewConfig;
  diagnostics?: DiagnosticsSummary;
  touchDesigner?: TouchDesignerImportSummary;

  constraints: {
    protectedRegions: string[];
  };

  assets?: {
    baseImage: string;
    states?: string[]; // paths to state images: ["states/state1.png", "states/state2.png", ...]
    masks?: Record<string, string>; // { "eyes": "masks/mask_eyes.png", ... }
    depth?: string; // "maps/depth.png"
    /**
     * Bundled soundtrack path ("audio/<file>") for `pieceConfigV3.audio`. The
     * track travels inside the package so a published or displayed piece can
     * play it without reaching a catalog asset URL. `audio.assetId` stays the
     * catalog reference; this is where the bytes actually live.
     */
    audio?: string;
  };

  /**
   * Per-asset sharing settings (visibility, license, rights confirmation).
   * Stored with the config and displayed in the public artwork info panel.
   * v1: tracks sharing for the base image/video and the user shader.
   */
  assetSharing?: AssetSharingConfig;

  /** V3 piece configuration — declarative recipe for shader stacks, evolution,
   *  behaviour models, scene/particle recipes, and gesture bindings.
   *  When present, the runtime uses this instead of legacy compiled config. */
  pieceConfigV3?: import("./v3/types").PieceConfig;

  /** Rendering backend hint (optional, defaults to "auto") */
  rendererHint?: RendererHint;
  /** Effect classification for automatic renderer selection */
  effectClass?: EffectClass;
  /** Minimum render-core version required by this package */
  renderCoreVersion?: string;
  /** Target display resolution for fidelity matching */
  targetResolution?: { width: number; height: number };
}

export interface StateJson {
  artworkId?: string;
  installTimestamp: string;
  randomSeed: number;

  timeOffsetSeconds: number;
  currentPhaseLabel: string;

  parameters: {
    breathingIntensity: number;
    colorTemperature: number;
    parallaxShift: number;
    noiseIntensity: number;
  };

  eventsLog: {
    t: number;
    event: string;
  }[];
}

export type ExperiencePresetId = "threshold" | "living-canvas" | "relationship";

export interface EngineState {
  arousal: number;
  coherence: number;
  intimacy: number;
  tension: number;
  novelty: number;
  attention: number;
  memoryResidue: number;
}

export interface InputFeatures {
  audioLevel: number;
  audioPulse: number;
  audioBrightness: number;
  audioNoisiness: number;
  motionAmount: number;
  motionSmoothness: number;
  proximity: number;
  presenceCentroid: [number, number];
  stillness: number;
  interactionDuration: number;
  ambientLevel: number;
}

export interface MaterialParams {
  density: number;
  softness: number;
  porosity: number;
  viscosity: number;
  granularity: number;
  layerSeparation: number;
}

export interface MotionParams {
  flowSpeed: number;
  flowDirection: number;
  turbulence: number;
  breathingRate: number;
  breathingDepth: number;
  drift: number;
}

export interface DistortionParams {
  displacementAmount: number;
  pullStrength: number;
  stretchStrength: number;
  fractureAmount: number;
  warpScale: number;
  focusFalloff: number;
}

export interface MemoryParams {
  feedbackAmount: number;
  trailDecay: number;
  afterglow: number;
  imprintStrength: number;
  memoryBlur: number;
}

export interface LightParams {
  colorBase: [number, number, number];
  colorMid: [number, number, number];
  colorAccent: [number, number, number];
  emissive: number;
  bloom: number;
  contrast: number;
  blackLevel: number;
  vignette: number;
  saturation: number;
}

export interface VisualParams {
  material: MaterialParams;
  motion: MotionParams;
  distortion: DistortionParams;
  memory: MemoryParams;
  light: LightParams;
}

export interface ExperiencePreset {
  id: ExperiencePresetId;
  label: string;
  visual: VisualParams;
}
