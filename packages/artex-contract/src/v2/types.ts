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
  | "stillness_duration";

export type CapabilityName =
  | "time"
  | "camera"
  | "microphone"
  | "gesture"
  | "pose"
  | "proximity"
  | "audio";

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
  | StillnessDurationSignal;

export interface SignalSnapshot {
  ts: number;
  signals: ArtexSignal[];
  byType: Partial<Record<ArtexSignalType, ArtexSignal[]>>;
  values: Partial<Record<ArtexSignalType, number>>;
  labels: Partial<Record<"gesture" | "pose", string[]>>;
}

export interface CapabilityStatus {
  capability: CapabilityName;
  available: boolean;
  enabled: boolean;
  required: boolean;
  reason?: string;
}

export type ArtworkAssetKind = "image" | "video" | "audio" | "mask" | "text" | "shader-data" | "model";
export type LayerKind = "image" | "video" | "shader" | "audio" | "mask" | "text";
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

export type ArtworkLayerConfig =
  | ImageLayerConfig
  | VideoLayerConfig
  | ShaderLayerConfig
  | AudioLayerConfig
  | MaskLayerConfig
  | TextLayerConfig;

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

export interface ArtworkInputsConfig {
  camera?: CameraInputConfig;
  microphone?: MicrophoneInputConfig;
  gesture?: GestureInputConfig;
  pose?: PoseInputConfig;
  proximity?: ProximityInputConfig;
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
    renderer: "webgl";
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
  actionLog: Array<{ at: number; marker: string }>;
}
