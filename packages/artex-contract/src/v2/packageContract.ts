import type {
  ArtexSignalType,
  ArtworkCapabilityRequirement,
  ArtworkConfigV2,
  ArtworkLayerConfig,
  CapabilitiesManifestV2,
  Condition,
  LayerKind,
  RuntimeRenderer,
  StateJsonV2,
  TransitionConfig,
  TriggerRule,
  VideoLayerRuntimeState,
} from "./types";
import { LAYER_KINDS, MODEL_3D_PRESETS, RUNTIME_RENDERERS } from "./types";

export const ARTEX_V2_PACKAGE_VERSION = 2;
export const ARTEX_V2_ARTWORK_PATH = "config/artwork.json";
export const ARTEX_V2_STATE_PATH = "config/state.json";
export const ARTEX_V2_CAPABILITIES_PATH = "meta/capabilities.json";
export const ARTEX_V2_PROJECT_PATH = "config/project.json";
export const ARTEX_V1_CONFIG_PATH = "config.json";

export type ArtexPackageArchiveVersion = 1 | 2 | null;

export interface LoadedArtexV2Package {
  artwork: ArtworkConfigV2;
  state: StateJsonV2;
  capabilities: CapabilitiesManifestV2;
  files: Map<string, Blob>;
  projectData: unknown;
  previewPosterPath: string | null;
  previewVideoPath: string | null;
}

export class PackageContractV2Error extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PackageContractV2Error";
    this.code = code;
  }
}

export interface ReadArtexV2PackageOptions {
  /** Semver string of the current render-core (e.g. RENDER_CORE_VERSION from
   *  @artex/render-core). When provided, packages with a renderCoreVersion
   *  that exceeds it are rejected with code "incompatible_render_core_version". */
  renderCoreVersion?: string;
}

/**
 * Compares two semver strings: returns true when `required` ≤ `current`.
 * Only handles the numeric major.minor.patch form.
 */
function isRenderCoreCompatible(required: string, current: string): boolean {
  const parse = (v: string): [number, number, number] => {
    const parts = v.replace(/^[^0-9]*/, "").split(".").map(Number);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  };
  const [rMaj, rMin, rPatch] = parse(required);
  const [cMaj, cMin, cPatch] = parse(current);
  if (rMaj !== cMaj) return rMaj < cMaj;
  if (rMin !== cMin) return rMin < cMin;
  return rPatch <= cPatch;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isSignalType = (value: unknown): value is ArtexSignalType => (
  value === "presence"
  || value === "proximity"
  || value === "gesture"
  || value === "pose"
  || value === "sound_level"
  || value === "sound_peak"
  || value === "time"
  || value === "idle_time"
  || value === "movement_energy"
  || value === "stillness_duration"
);

const validateCondition = (condition: Condition, ruleId: string): void => {
  if (!isSignalType(condition.signal)) {
    throw new PackageContractV2Error("invalid_condition", `Rule "${ruleId}" contains an unsupported signal.`);
  }
  if (
    condition.operator !== "equals"
    && condition.operator !== "gte"
    && condition.operator !== "lte"
    && condition.operator !== "present"
    && condition.operator !== "changed_to"
    && condition.operator !== "held_for_ms"
    && condition.operator !== "inactive_for_ms"
  ) {
    throw new PackageContractV2Error("invalid_condition", `Rule "${ruleId}" contains an unsupported operator.`);
  }
};

const validateTriggerRule = (rule: TriggerRule): void => {
  if (typeof rule.id !== "string" || rule.id.trim().length === 0) {
    throw new PackageContractV2Error("invalid_rule", "Every trigger rule must have a stable id.");
  }
  if (!Array.isArray(rule.when) || rule.when.length === 0) {
    throw new PackageContractV2Error("invalid_rule", `Rule "${rule.id}" must define at least one condition.`);
  }
  if (!Array.isArray(rule.then) || rule.then.length === 0) {
    throw new PackageContractV2Error("invalid_rule", `Rule "${rule.id}" must define at least one action.`);
  }
  for (const condition of rule.when) {
    validateCondition(condition, rule.id);
  }
};

const isLayerKind = (value: unknown): value is LayerKind =>
  typeof value === "string" && (LAYER_KINDS as readonly string[]).includes(value);

const isRuntimeRenderer = (value: unknown): value is RuntimeRenderer =>
  typeof value === "string" && (RUNTIME_RENDERERS as readonly string[]).includes(value);

const validateLayer = (
  layer: ArtworkLayerConfig,
  assetIds: Set<string>,
  runtime: RuntimeRenderer,
): void => {
  if (typeof layer.id !== "string" || layer.id.trim().length === 0) {
    throw new PackageContractV2Error("invalid_layer", "Every layer must have a stable id.");
  }
  if (!isLayerKind(layer.kind)) {
    throw new PackageContractV2Error(
      "invalid_layer",
      `Layer "${layer.id}" has unsupported kind "${String(layer.kind)}". Allowed: ${LAYER_KINDS.join(", ")}.`,
    );
  }
  if (layer.kind === "model3d") {
    if (runtime !== "three-experimental") {
      throw new PackageContractV2Error(
        "invalid_layer",
        `Layer "${layer.id}" is model3d but runtime.renderer is "${runtime}". Set runtime.renderer to "three-experimental".`,
      );
    }
    const model = layer as { assetId?: unknown; preset?: unknown; soundReactive?: unknown };
    if (typeof model.assetId !== "string" || !assetIds.has(model.assetId)) {
      throw new PackageContractV2Error(
        "invalid_layer",
        `Model3D layer "${layer.id}" references unknown assetId "${String(model.assetId)}".`,
      );
    }
    if (
      model.preset !== undefined
      && (typeof model.preset !== "string"
        || !(MODEL_3D_PRESETS as readonly string[]).includes(model.preset))
    ) {
      throw new PackageContractV2Error(
        "invalid_layer",
        `Model3D layer "${layer.id}" has unsupported preset "${model.preset as string}". Allowed: ${MODEL_3D_PRESETS.join(", ")}.`,
      );
    }
    if (model.soundReactive !== undefined && typeof model.soundReactive !== "boolean") {
      throw new PackageContractV2Error(
        "invalid_layer",
        `Model3D layer "${layer.id}" soundReactive must be a boolean if set.`,
      );
    }
  }
};

const validateTransition = (transition: TransitionConfig): void => {
  if (!transition.id.trim() || !transition.from.trim() || !transition.to.trim()) {
    throw new PackageContractV2Error("invalid_transition", "Transitions must declare id, from, and to states.");
  }
  if (!isFiniteNumber(transition.durationMs) || transition.durationMs < 0) {
    throw new PackageContractV2Error("invalid_transition", `Transition "${transition.id}" needs a non-negative duration.`);
  }
};

export const validateArtworkConfigV2 = (artwork: ArtworkConfigV2): void => {
  if (artwork.version !== ARTEX_V2_PACKAGE_VERSION) {
    throw new PackageContractV2Error(
      "unsupported_version",
      `Expected ARTEX artwork version ${String(ARTEX_V2_PACKAGE_VERSION)}, received ${String(artwork.version)}.`,
    );
  }
  if (!artwork.id.trim() || !artwork.title.trim()) {
    throw new PackageContractV2Error("invalid_artwork", "Artwork id and title are required.");
  }
  if (!Array.isArray(artwork.assets) || artwork.assets.length === 0) {
    throw new PackageContractV2Error("invalid_artwork", "At least one asset is required.");
  }
  if (!Array.isArray(artwork.layers) || artwork.layers.length === 0) {
    throw new PackageContractV2Error("invalid_artwork", "At least one layer is required.");
  }
  if (!Array.isArray(artwork.states) || artwork.states.length === 0) {
    throw new PackageContractV2Error("invalid_artwork", "At least one artwork state is required.");
  }
  if (!artwork.states.some((state) => state.id === artwork.fallbackState)) {
    throw new PackageContractV2Error("invalid_artwork", `Fallback state "${artwork.fallbackState}" is not declared.`);
  }
  if (!artwork.runtime || !isRuntimeRenderer(artwork.runtime.renderer)) {
    throw new PackageContractV2Error(
      "invalid_artwork",
      `runtime.renderer must be one of: ${RUNTIME_RENDERERS.join(", ")}.`,
    );
  }
  const assetIds = new Set(artwork.assets.map((asset) => asset.id));
  for (const layer of artwork.layers) {
    validateLayer(layer, assetIds, artwork.runtime.renderer);
  }
  for (const rule of artwork.triggers) {
    validateTriggerRule(rule);
  }
  for (const transition of artwork.transitions) {
    validateTransition(transition);
  }
};

export const buildCapabilitiesManifestV2 = (artwork: ArtworkConfigV2): CapabilitiesManifestV2 => {
  const requirements: ArtworkCapabilityRequirement[] = [{ capability: "time", required: true, reason: "Core runtime clock" }];
  const pushRequirement = (capability: ArtworkCapabilityRequirement["capability"], reason: string): void => {
    if (requirements.some((entry) => entry.capability === capability)) return;
    requirements.push({ capability, required: true, reason });
  };

  if (artwork.inputs.camera?.enabled) pushRequirement("camera", "Camera-driven sensing enabled");
  if (artwork.inputs.microphone?.enabled) pushRequirement("microphone", "Microphone sensing enabled");
  if (artwork.inputs.gesture?.enabled) pushRequirement("gesture", "Gesture recognition enabled");
  if (artwork.inputs.pose?.enabled) pushRequirement("pose", "Pose interpretation enabled");
  if (artwork.inputs.proximity?.enabled) pushRequirement("proximity", "Proximity interpretation enabled");
  if (artwork.inputs.microphone?.enabled) pushRequirement("audio", "Audio-reactive mappings enabled");
  if (artwork.inputs.midi?.enabled) pushRequirement("midi", "Music-as-input via MIDI enabled");

  // Layer-level inferences — some look-and-feel flags transitively require an
  // input capability. Surfacing them here means the runtime UI shows the badge
  // and the venue install report flags missing hardware even when the artist
  // forgot to also flip the corresponding `inputs.*.enabled` toggle.
  const hasSoundReactiveLayer = artwork.layers.some(
    (layer) => layer.kind === "model3d" && (layer as { soundReactive?: boolean }).soundReactive === true,
  );
  if (hasSoundReactiveLayer) {
    pushRequirement("microphone", "model3d layer requested soundReactive lighting");
    pushRequirement("audio", "model3d layer requested soundReactive lighting");
  }

  return {
    localFirst: true,
    recordsByDefault: false,
    uploadsByDefault: false,
    requirements,
  };
};

const createLayerRuntimeState = (): VideoLayerRuntimeState => ({
  playheadMs: 0,
  playing: false,
  opacity: 1,
  visible: true,
  behaviorId: null,
  frozen: false,
});

export const createDefaultStateV2 = (
  artwork: ArtworkConfigV2,
  capabilityStatus: StateJsonV2["capabilityStatus"] = [],
): StateJsonV2 => {
  validateArtworkConfigV2(artwork);
  const initialStateId = artwork.states.find((state) => state.initial)?.id ?? artwork.fallbackState;
  return {
    artworkId: artwork.id,
    activeStateId: initialStateId,
    previousStateId: null,
    enteredStateAt: 0,
    layerState: Object.fromEntries(artwork.layers.map((layer) => [layer.id, createLayerRuntimeState()])),
    capabilityStatus,
    timers: {},
    actionLog: [],
  };
};

export const validateStateJsonV2 = (state: StateJsonV2, artwork: ArtworkConfigV2): void => {
  if (state.artworkId !== artwork.id) {
    throw new PackageContractV2Error("invalid_state", "State artworkId does not match artwork.json.");
  }
  if (!artwork.states.some((entry) => entry.id === state.activeStateId)) {
    throw new PackageContractV2Error("invalid_state", `Unknown active state "${state.activeStateId}".`);
  }
};

export async function detectArtexPackageArchiveVersion(
  zipFile: Blob | ArrayBuffer | Uint8Array,
): Promise<ArtexPackageArchiveVersion> {
  const JSZip = (await import("jszip")).default;
  const normalizedInput = zipFile instanceof Blob ? await zipFile.arrayBuffer() : zipFile;
  const zip = await JSZip.loadAsync(normalizedInput);

  const v2ArtworkEntry = zip.file(ARTEX_V2_ARTWORK_PATH);
  if (v2ArtworkEntry) {
    try {
      const parsed = JSON.parse(await v2ArtworkEntry.async("string")) as { version?: unknown };
      if (parsed.version === ARTEX_V2_PACKAGE_VERSION) {
        return 2;
      }
    } catch {
      return 2;
    }
  }

  if (zip.file(ARTEX_V1_CONFIG_PATH)) {
    return 1;
  }

  return null;
}

export async function readArtexV2PackageArchive(
  zipFile: Blob | ArrayBuffer | Uint8Array,
  options?: ReadArtexV2PackageOptions,
): Promise<LoadedArtexV2Package> {
  const JSZip = (await import("jszip")).default;
  const normalizedInput = zipFile instanceof Blob ? await zipFile.arrayBuffer() : zipFile;
  const zip = await JSZip.loadAsync(normalizedInput);
  const zipEntries = Object.keys(zip.files).filter((path) => !zip.files[path].dir);

  const artworkEntry = zip.file(ARTEX_V2_ARTWORK_PATH);
  if (!artworkEntry) {
    throw new PackageContractV2Error("missing_artwork", `${ARTEX_V2_ARTWORK_PATH} is required.`);
  }
  const artwork = JSON.parse(await artworkEntry.async("string")) as ArtworkConfigV2;
  validateArtworkConfigV2(artwork);

  if (artwork.renderCoreVersion && options?.renderCoreVersion) {
    if (!isRenderCoreCompatible(artwork.renderCoreVersion, options.renderCoreVersion)) {
      throw new PackageContractV2Error(
        "incompatible_render_core_version",
        `Package requires render-core ${artwork.renderCoreVersion} but runtime has ${options.renderCoreVersion}.`,
      );
    }
  }

  const capabilitiesEntry = zip.file(ARTEX_V2_CAPABILITIES_PATH);
  const capabilities = capabilitiesEntry
    ? JSON.parse(await capabilitiesEntry.async("string")) as CapabilitiesManifestV2
    : buildCapabilitiesManifestV2(artwork);

  const stateEntry = zip.file(ARTEX_V2_STATE_PATH);
  const state = stateEntry
    ? JSON.parse(await stateEntry.async("string")) as StateJsonV2
    : createDefaultStateV2(artwork);
  validateStateJsonV2(state, artwork);

  const projectEntry = zip.file(ARTEX_V2_PROJECT_PATH);
  const projectData = projectEntry ? JSON.parse(await projectEntry.async("string")) as unknown : null;

  const files = new Map<string, Blob>();
  for (const asset of artwork.assets) {
    const entry = zip.file(asset.path);
    if (!entry) {
      throw new PackageContractV2Error("missing_asset", `Missing artwork asset "${asset.path}".`);
    }
    files.set(asset.path, await entry.async("blob"));
  }
  const previewPosterPath = zipEntries.find((path) => path.startsWith("preview/") && /\.(png|jpg|jpeg|webp)$/i.test(path)) ?? null;
  const previewVideoPath = zipEntries.find((path) => path.startsWith("preview/") && /\.(mp4|webm|mov)$/i.test(path)) ?? null;

  return {
    artwork,
    state,
    capabilities,
    files,
    projectData,
    previewPosterPath,
    previewVideoPath,
  };
}
