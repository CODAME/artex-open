import type { RendererHint, EffectClass } from "../types";

export type ArtexSignalType =
  | "presence"
  | "proximity"
  | "gesture"
  | "pose"
  | "sound_level"
  | "sound_peak"
  | "time"
  | "idle_time"
  | "movement_energy"
  | "stillness_duration"
  | "face_present"
  | "face_x"
  | "face_y"
  | "face_size"
  | "midi_beat_phase"
  | "midi_bar_phase"
  | "midi_tempo"
  | "midi_note_density"
  | "midi_active_notes"
  | "midi_last_note_velocity"
  | "midi_last_note_pitch";

export type CapabilityName =
  | "time"
  | "camera"
  | "microphone"
  | "gesture"
  | "pose"
  | "proximity"
  | "audio"
  | "face"
  | "midi";

export interface BaseSignal {
  type: ArtexSignalType;
  ts: number;
  confidence?: number;
  source?: string;
}

export interface PresenceSignal extends BaseSignal {
  type: "presence";
  value: 0 | 1;
}

export interface ProximitySignal extends BaseSignal {
  type: "proximity";
  value: number;
}

export interface GestureSignal extends BaseSignal {
  type: "gesture";
  value: string;
}

export interface PoseSignal extends BaseSignal {
  type: "pose";
  value: string;
}

export interface SoundLevelSignal extends BaseSignal {
  type: "sound_level";
  value: number;
}

export interface SoundPeakSignal extends BaseSignal {
  type: "sound_peak";
  value: number;
}

export interface TimeSignal extends BaseSignal {
  type: "time";
  value: number;
}

export interface IdleTimeSignal extends BaseSignal {
  type: "idle_time";
  value: number;
}

export interface MovementEnergySignal extends BaseSignal {
  type: "movement_energy";
  value: number;
}

export interface StillnessDurationSignal extends BaseSignal {
  type: "stillness_duration";
  value: number;
}

export interface FacePresentSignal extends BaseSignal {
  type: "face_present";
  value: number; // 0..1 smoothed presence
}

export interface FaceXSignal extends BaseSignal {
  type: "face_x";
  value: number; // 0..1 normalized face center X (image-space, left→right)
}

export interface FaceYSignal extends BaseSignal {
  type: "face_y";
  value: number; // 0..1 normalized face center Y (image-space, top→bottom)
}

export interface FaceSizeSignal extends BaseSignal {
  type: "face_size";
  value: number; // 0..1 face area relative to frame
}

// ── MIDI-derived signals ────────────────────────────────────────────────────
// Produced by @artex/sensing-midi's MidiInputAdapter when a piece has
// `interactions.midiInputEnabled === true` and a MIDI input port is
// connected. All values normalized to 0..1.
//
// See docs/video-driven-midi-plan.md for the design.

export interface MidiBeatPhaseSignal extends BaseSignal {
  type: "midi_beat_phase";
  value: number; // 0..1, wraps every quarter note. Driven by MIDI Clock (24 PPQN).
}

export interface MidiBarPhaseSignal extends BaseSignal {
  type: "midi_bar_phase";
  value: number; // 0..1, wraps every bar. Song Position Pointer-aware.
}

export interface MidiTempoSignal extends BaseSignal {
  type: "midi_tempo";
  value: number; // BPM / 240, clamped 0..1.
}

export interface MidiNoteDensitySignal extends BaseSignal {
  type: "midi_note_density";
  value: number; // Count of note-ons in last second / 16.
}

export interface MidiActiveNotesSignal extends BaseSignal {
  type: "midi_active_notes";
  value: number; // Count of currently-held notes / 16.
}

export interface MidiLastNoteVelocitySignal extends BaseSignal {
  type: "midi_last_note_velocity";
  value: number; // Velocity of most recent note-on, decays over 500ms.
}

export interface MidiLastNotePitchSignal extends BaseSignal {
  type: "midi_last_note_pitch";
  value: number; // Note number of most recent note-on / 127. Sticky.
}

export type ArtexSignal =
  | PresenceSignal
  | ProximitySignal
  | GestureSignal
  | PoseSignal
  | SoundLevelSignal
  | SoundPeakSignal
  | TimeSignal
  | IdleTimeSignal
  | MovementEnergySignal
  | StillnessDurationSignal
  | FacePresentSignal
  | FaceXSignal
  | FaceYSignal
  | FaceSizeSignal
  | MidiBeatPhaseSignal
  | MidiBarPhaseSignal
  | MidiTempoSignal
  | MidiNoteDensitySignal
  | MidiActiveNotesSignal
  | MidiLastNoteVelocitySignal
  | MidiLastNotePitchSignal;

export interface SignalSnapshot {
  ts: number;
  signals: ArtexSignal[];
  byType: Partial<Record<ArtexSignalType, ArtexSignal[]>>;
  values: Partial<Record<ArtexSignalType, number>>;
  labels: Partial<Record<"gesture" | "pose", string[]>>;
  /**
   * Derived per-frame outputs merged in by the runtime — behaviour state flags
   * (`state_<id>` = 1 for the active state), personality dims, and (later)
   * evolution params. Open string keys, distinct from `values` (which is keyed
   * by the closed `ArtexSignalType` union). Absent until a central evaluator
   * populates it, so any block player (plugin, scene, particle) can react to
   * behaviour state through the snapshot ref it already reads. See
   * docs/behaviour-outputs-to-blocks.md.
   */
  params?: Record<string, number>;
}

export interface CapabilityStatus {
  capability: CapabilityName;
  available: boolean;
  enabled: boolean;
  required: boolean;
  reason?: string;
}

export type ArtworkAssetKind = "image" | "video" | "audio" | "mask" | "text" | "shader-data" | "model";
export type LayerKind = "image" | "video" | "shader" | "audio" | "mask" | "text" | "model3d";
export const LAYER_KINDS: readonly LayerKind[] = [
  "image",
  "video",
  "shader",
  "audio",
  "mask",
  "text",
  "model3d",
] as const;
export type RuntimeRenderer = "webgl" | "three-experimental";
export const RUNTIME_RENDERERS: readonly RuntimeRenderer[] = [
  "webgl",
  "three-experimental",
] as const;
export type LayerBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "softlight"
  | "add";
export type MediaBehaviorKind =
  | "play_once"
  | "loop_while_active"
  | "fade_in"
  | "fade_out"
  | "scrub_by_proximity"
  | "scrub_by_gesture_progress"
  | "play_segment"
  | "reverse"
  | "freeze_last_frame"
  | "blend_into_still"
  | "masked_reveal";
export type ConditionOperator =
  | "equals"
  | "gte"
  | "lte"
  | "present"
  | "changed_to"
  | "held_for_ms"
  | "inactive_for_ms";
export type TransitionEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

export interface ArtworkAsset {
  id: string;
  kind: ArtworkAssetKind;
  path: string;
  fileName?: string;
  mimeType?: string;
  posterPath?: string;
}

export interface MediaBehaviorConfig {
  id: string;
  kind: MediaBehaviorKind;
  signal?: ArtexSignalType;
  startMs?: number;
  endMs?: number;
  durationMs?: number;
  min?: number;
  max?: number;
  amount?: number;
  reverse?: boolean;
  holdLastFrame?: boolean;
}

export interface BaseLayerConfig {
  id: string;
  kind: LayerKind;
  name: string;
  zIndex: number;
  visible?: boolean;
  opacity?: number;
  blendMode?: LayerBlendMode;
  stateScope?: string[];
}

export interface ImageLayerConfig extends BaseLayerConfig {
  kind: "image";
  assetId: string;
}

export interface VideoLayerConfig extends BaseLayerConfig {
  kind: "video";
  assetId: string;
  posterAssetId?: string;
  durationMs?: number;
  muted?: boolean;
  loop?: boolean;
  playbackRate?: number;
  behaviors?: MediaBehaviorConfig[];
}

export interface ShaderLayerConfig extends BaseLayerConfig {
  kind: "shader";
  shaderId: string;
  params?: Record<string, number>;
  maskLayerId?: string;
}

export interface AudioLayerConfig extends BaseLayerConfig {
  kind: "audio";
  assetId: string;
  muted?: boolean;
  loop?: boolean;
}

export interface MaskLayerConfig extends BaseLayerConfig {
  kind: "mask";
  assetId: string;
}

export interface TextLayerConfig extends BaseLayerConfig {
  kind: "text";
  text: string;
}

/**
 * 3D model layer. Renders a .glb / .gltf / .obj / .ply / .stl asset via the
 * three-experimental renderer path. Transform fields are in artwork-local
 * units (fit inside a unit cube centered at origin by default).
 *
 * Requires `runtime.renderer === "three-experimental"` — the plain WebGL
 * compositor has no mesh-loader and will refuse to plan this layer.
 */
/**
 * Visual look-and-feel presets for model3d layers. Each preset is a named
 * bundle of (material family, environment IBL on/off, lighting baseline) so
 * artists can pick a look by intent rather than wiring individual knobs.
 *
 * - `studio` — neutral PBR (matte-ish, low metalness) with studio IBL. Default.
 * - `matte`  — diffuse, no IBL. Looks like clay; cheapest to render.
 * - `chrome` — high metalness + clearcoat with studio IBL. Sculpture / metallic.
 */
export type Model3DPreset = "studio" | "matte" | "chrome";

export const MODEL_3D_PRESETS: readonly Model3DPreset[] = ["studio", "matte", "chrome"] as const;

export interface Model3DLayerConfig extends BaseLayerConfig {
  kind: "model3d";
  assetId: string;
  /** Optional embedded animation clip name. Defaults to first clip or none. */
  animationClip?: string;
  autoRotate?: boolean;
  /** Uniform scale multiplier applied after auto-fit. Defaults to 1. */
  scale?: number;
  /** Euler rotation in radians (x, y, z). Defaults to zeros. */
  rotation?: { x: number; y: number; z: number };
  /** Local translation (artwork-normalised, -1..1 per axis). Defaults to zeros. */
  position?: { x: number; y: number; z: number };
  /** Camera field-of-view in degrees. Defaults to 35. */
  cameraFov?: number;
  /** Environment map asset id for IBL (optional). */
  environmentAssetId?: string;
  /** Background colour (CSS hex, e.g. "#000000"). Defaults to transparent. */
  background?: string;
  /** Visual preset. Defaults to "studio". See {@link Model3DPreset}. */
  preset?: Model3DPreset;
  /**
   * If true, the runtime modulates lighting and emissive material colour from
   * the live `sound_level` / `sound_peak` signals (rainbow hue cycle that
   * accelerates with audio peaks). Off by default — opt-in per artwork.
   */
  soundReactive?: boolean;
}

export type ArtworkLayerConfig =
  | ImageLayerConfig
  | VideoLayerConfig
  | ShaderLayerConfig
  | AudioLayerConfig
  | MaskLayerConfig
  | TextLayerConfig
  | Model3DLayerConfig;

export interface Condition {
  signal: ArtexSignalType;
  operator: ConditionOperator;
  value?: number | string;
  durationMs?: number;
  confidenceGte?: number;
}

export type Action =
  | { type: "enter_state"; stateId: string }
  | { type: "set_layer_visibility"; layerId: string; visible: boolean }
  | { type: "set_layer_opacity"; layerId: string; opacity: number }
  | { type: "set_video_behavior"; layerId: string; behavior: MediaBehaviorConfig }
  | { type: "set_shader_param"; layerId: string; param: string; value: number }
  | { type: "emit_marker"; marker: string };

export interface TriggerRule {
  id: string;
  when: Condition[];
  match?: "all" | "any";
  debounceMs?: number;
  cooldownMs?: number;
  then: Action[];
  /** Artist-facing name for this rule. Optional; the Studio falls back to the
   *  generated plain-language sentence. Additive (2026-08-15) for the rule
   *  builder — a rule the artist can name is one they can find again. */
  label?: string;
  /** When false the rule is skipped at runtime, without deleting it. Defaults
   *  to true. Additive (2026-08-15) so a rule can be muted while tuning. */
  enabled?: boolean;
}

export interface ArtworkStateLayerOverride {
  layerId: string;
  visible?: boolean;
  opacity?: number;
  activeBehaviorId?: string;
}

export interface ArtworkStateConfig {
  id: string;
  label: string;
  initial?: boolean;
  layerOverrides?: ArtworkStateLayerOverride[];
  entryActions?: Action[];
  exitActions?: Action[];
}

export interface TransitionConfig {
  id: string;
  from: string;
  to: string;
  durationMs: number;
  easing?: TransitionEasing;
}

export interface CameraInputConfig {
  enabled: boolean;
  detectPresence?: boolean;
  detectProximity?: boolean;
}

export interface MicrophoneInputConfig {
  enabled: boolean;
  analyzeLevel?: boolean;
  analyzePeak?: boolean;
}

export interface GestureInputConfig {
  enabled: boolean;
  gestures: string[];
}

export interface PoseInputConfig {
  enabled: boolean;
  poses: string[];
}

export interface ProximityInputConfig {
  enabled: boolean;
  strategy: "camera-scale" | "device-proximity" | "time-fallback";
}

export interface MidiInputConfigV2 {
  enabled: boolean;
  /**
   * Web MIDI input port id (opaque, from `navigator.requestMIDIAccess()`).
   * Stable across reconnects within a session; the runtime auto-attaches
   * on start when present. When null/undefined, the adapter requests
   * access but does not attach to any specific port.
   */
  portId?: string | null;
}

export interface ArtworkInputsConfig {
  camera?: CameraInputConfig;
  microphone?: MicrophoneInputConfig;
  gesture?: GestureInputConfig;
  pose?: PoseInputConfig;
  proximity?: ProximityInputConfig;
  midi?: MidiInputConfigV2;
}

export interface ArtworkCapabilityRequirement {
  capability: CapabilityName;
  required: boolean;
  reason: string;
}

export interface CapabilitiesManifestV2 {
  localFirst: boolean;
  recordsByDefault: false;
  uploadsByDefault: false;
  requirements: ArtworkCapabilityRequirement[];
}

export interface ArtworkConfigV2 {
  version: 2;
  id: string;
  title: string;
  artistName?: string;
  story?: string;
  assets: ArtworkAsset[];
  layers: ArtworkLayerConfig[];
  inputs: ArtworkInputsConfig;
  states: ArtworkStateConfig[];
  triggers: TriggerRule[];
  transitions: TransitionConfig[];
  fallbackState: string;
  runtime: {
    renderer: RuntimeRenderer;
    localFirst: true;
    allowRecording: false;
    allowCloudUpload: false;
  };
  /** Rendering backend hint (optional, defaults to "auto") */
  rendererHint?: RendererHint;
  /** Effect classification for automatic renderer selection */
  effectClass?: EffectClass;
  /** Minimum render-core version required by this package */
  renderCoreVersion?: string;
  /** Target display resolution for fidelity matching */
  targetResolution?: { width: number; height: number };
}

export interface VideoLayerRuntimeState {
  playheadMs: number;
  playing: boolean;
  opacity: number;
  visible: boolean;
  behaviorId: string | null;
  frozen: boolean;
}

export interface StateJsonV2 {
  artworkId: string;
  activeStateId: string;
  previousStateId: string | null;
  enteredStateAt: number;
  layerState: Record<string, VideoLayerRuntimeState>;
  capabilityStatus: CapabilityStatus[];
  timers: Record<string, number>;
  actionLog: { at: number; marker: string }[];
}
