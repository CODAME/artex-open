// src/types.ts

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
export type RendererMode = "webgl" | "three-experimental";
export type InteractionActionId =
  | "stop_open_palm"
  | "exit_wave"
  | "explosion_mouth_open"
  | "celebration_clap_sound"
  | "zoom_proximity";

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

export interface ArtexSuggestionPatch {
  artistTemplate?: ArtistTemplate;
  mood?: number;
  simpleInteractions?: ArtistInteraction[];
  interactionProfile?: InteractionProfile;
}

export interface ArtexSuggestion {
  id: string;
  createdAt: string;
  provider: Exclude<LLMProvider, "disabled">;
  suggestionSource: AISuggestionSource;
  summary: string;
  rationale?: string;
  inputSignature?: string;
  patch: ArtexSuggestionPatch;
}

export interface ArtworkSuggestionState {
  suggestionAvailable: boolean;
  suggestionStale: boolean;
  suggestionSource: AISuggestionSource | null;
  provider: Exclude<LLMProvider, "disabled"> | null;
  currentSetupOrigin: "manual" | "ai" | "ai_edited" | "regenerated";
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
  mediapipeTestMode?: boolean; // Enables visual tracker test panel
  interactionProfile?: InteractionProfile; // User-facing preset for interaction mapping
  actionMappings?: InteractionActionMapping[]; // Input -> effect mapping cards used by default UX
  customActionMappings?: InteractionActionMapping[]; // User-defined mappings persisted under Custom mode
  touchMediaControls?: TouchMediaControlsConfig; // Authored touch-first media pan/zoom controls
  supportsProximity?: boolean; // Legacy field, kept for backward compatibility
  supportsAmbientLight?: boolean; // Legacy field, kept for backward compatibility
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

  template?: RuntimeTemplate;
  artistTemplate?: ArtistTemplate;
  mood?: number; // 0..1, artist-facing macro control
  simpleInteractions?: ArtistInteraction[];
  contextBehavior?: ContextBehaviorConfig;

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
  };
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
