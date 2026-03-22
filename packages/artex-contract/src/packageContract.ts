import type { ConfigJson, StateJson } from "./types";
import type { ProjectPackageData, ProjectShaderChannelSource } from "./projectPackage";
import { normalizeProjectAIPolicy } from "./ai/policy";
import {
  normalizeArtexSuggestion,
  normalizeArtexSuggestionSnapshot,
  normalizeArtworkSuggestionState,
} from "./ai/suggestionLifecycle";
import { normalizeReferenceEffectRecipeData } from "./referenceEffectRecipeContract";
import { normalizeReferenceVideoExperienceData } from "./referenceVideoContract";

export const ARTEX_CONFIG_VERSION = 1;
export const ARTEX_PROJECT_PACKAGE_VERSION = 1;

export interface PackageAssetManifest {
  baseImagePath: string;
  statePaths: string[];
  maskPaths: Record<string, string>;
  depthPath: string | null;
  shaderChannelPaths: (string | null)[];
}

export interface LoadedCodamePackage {
  config: ConfigJson;
  state: StateJson;
  projectData: ProjectPackageData | null;
  assets: PackageAssetManifest;
  files: Map<string, Blob>;
  warnings: string[];
}

export class PackageContractError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PackageContractError";
    this.code = code;
  }
}

const normalizeProjectShaderChannelSources = (
  sources: unknown,
): ProjectShaderChannelSource[] | undefined => {
  if (!Array.isArray(sources)) return undefined;

  const normalized: ProjectShaderChannelSource[] = [];
  for (const rawSource of sources.slice(0, 4)) {
    const source = typeof rawSource === "string" ? rawSource : "";
    if (source === "camera" || source === "file" || source === "none") {
      normalized.push(source);
    } else {
      normalized.push("none");
    }
  }

  while (normalized.length < 4) {
    normalized.push("none");
  }

  return normalized;
};

export const normalizeProjectPackageData = (
  parsed: unknown,
): ProjectPackageData | null => {
  if (!parsed || typeof parsed !== "object") return null;

  const candidate = parsed as Partial<ProjectPackageData>;
  if (
    typeof candidate.version !== "number"
    || !Number.isFinite(candidate.version)
    || candidate.version > ARTEX_PROJECT_PACKAGE_VERSION
  ) {
    return null;
  }

  if (
    !candidate.shader
    || !candidate.shaderChannels
    || !Array.isArray(candidate.shaderChannels.paths)
  ) {
    return null;
  }

  const normalizedChannelSources = normalizeProjectShaderChannelSources(candidate.shaderChannels.sources);
  const normalizedAi = candidate.ai && typeof candidate.ai === "object"
    ? {
      ...(candidate.ai.policy ? { policy: normalizeProjectAIPolicy(candidate.ai.policy) } : {}),
      ...(candidate.ai.suggestionState
        ? { suggestionState: normalizeArtworkSuggestionState(candidate.ai.suggestionState) }
        : {}),
      ...(candidate.ai.acceptedSuggestion !== undefined
        ? { acceptedSuggestion: normalizeArtexSuggestion(candidate.ai.acceptedSuggestion) }
        : {}),
      ...(Array.isArray(candidate.ai.savedSnapshots)
        ? {
          savedSnapshots: candidate.ai.savedSnapshots
            .map((snapshot) => normalizeArtexSuggestionSnapshot(snapshot))
            .filter((snapshot): snapshot is NonNullable<typeof snapshot> => snapshot !== null),
        }
        : {}),
    }
    : undefined;
  const normalizedExperimental = candidate.experimental && typeof candidate.experimental === "object"
    ? {
      ...(candidate.experimental.referenceVideoExperience !== undefined
        ? {
          referenceVideoExperience: normalizeReferenceVideoExperienceData(
            candidate.experimental.referenceVideoExperience,
          ),
        }
        : {}),
      ...(candidate.experimental.referenceEffectRecipe !== undefined
        ? {
          referenceEffectRecipe: normalizeReferenceEffectRecipeData(
            candidate.experimental.referenceEffectRecipe,
          ),
        }
        : {}),
    }
    : undefined;

  return {
    ...candidate,
    shaderChannels: {
      paths: candidate.shaderChannels.paths.slice(0, 4).map((path) => (
        typeof path === "string" && path.length > 0 ? path : null
      )),
      ...(normalizedChannelSources ? { sources: normalizedChannelSources } : {}),
    },
    ...(normalizedAi ? { ai: normalizedAi } : {}),
    ...(normalizedExperimental ? { experimental: normalizedExperimental } : {}),
  } as ProjectPackageData;
};

const assertSupportedConfigVersion = (config: ConfigJson): void => {
  if (!Number.isFinite(config.version)) {
    throw new PackageContractError("invalid_config_version", "config.json is missing a valid version.");
  }
  if (config.version > ARTEX_CONFIG_VERSION) {
    throw new PackageContractError(
      "unsupported_config_version",
      `config.json version ${String(config.version)} is newer than this ARTEX creator supports (${String(ARTEX_CONFIG_VERSION)}).`,
    );
  }
  if (config.version < 1) {
    throw new PackageContractError(
      "unsupported_config_version",
      `config.json version ${String(config.version)} is not supported.`,
    );
  }
};

export const validateConfigJson = (config: ConfigJson): void => {
  assertSupportedConfigVersion(config);
  const candidate = config as Partial<ConfigJson>;
  const baseLayer = candidate.layers?.base;
  const animation = candidate.animation;
  const evolution = candidate.evolution;

  if (typeof config.title !== "string") {
    throw new PackageContractError("invalid_config", "config.json must include a valid title.");
  }

  if (
    !baseLayer
    || !Number.isFinite(baseLayer.parallaxDepth)
    || !Number.isFinite(baseLayer.breathingIntensity)
    || !Number.isFinite(baseLayer.textureDrift)
  ) {
    throw new PackageContractError("invalid_config", "config.json is missing valid base layer settings.");
  }

  if (
    !animation
    || !Number.isFinite(animation.baseSpeed)
    || typeof animation.breathingEnabled !== "boolean"
    || typeof animation.parallaxEnabled !== "boolean"
    || typeof animation.colorShiftEnabled !== "boolean"
  ) {
    throw new PackageContractError("invalid_config", "config.json is missing valid animation settings.");
  }

  if (
    !evolution
    || !Array.isArray(evolution.phases)
    || evolution.phases.length === 0
  ) {
    throw new PackageContractError("invalid_config", "config.json must include at least one evolution phase.");
  }
};

export const createStateFromConfig = (config: ConfigJson): StateJson => {
  const firstPhase = config.evolution.phases[0] ?? {
    label: "calm",
    colorTemperatureShift: 0,
    noiseIntensity: 0,
  };

  return {
    artworkId: config.artworkId,
    installTimestamp: new Date().toISOString(),
    randomSeed: Math.floor(Math.random() * 1_000_000_000),
    timeOffsetSeconds: 0,
    currentPhaseLabel: firstPhase.label,
    parameters: {
      breathingIntensity: config.layers.base.breathingIntensity,
      colorTemperature: firstPhase.colorTemperatureShift,
      parallaxShift: config.layers.base.parallaxDepth,
      noiseIntensity: firstPhase.noiseIntensity,
    },
    eventsLog: [],
  };
};

const findFallbackBaseImagePath = (zipEntryPaths: string[]): string | null => {
  const artEntry = zipEntryPaths.find((path) => /^art\/[^/]+$/.test(path));
  return artEntry ?? null;
};

export async function readCodamePackageArchive(zipFile: Blob | ArrayBuffer | Uint8Array): Promise<LoadedCodamePackage> {
  const JSZip = (await import("jszip")).default;
  const normalizedInput = zipFile instanceof Blob ? await zipFile.arrayBuffer() : zipFile;
  const zip = await JSZip.loadAsync(normalizedInput);
  const zipEntryPaths = Object.keys(zip.files).filter((path) => !zip.files[path].dir);

  const configFile = zip.file("config.json");
  if (!configFile) {
    throw new PackageContractError("missing_config", "config.json not found in package.");
  }

  const configJson = await configFile.async("string");
  const config = JSON.parse(configJson) as ConfigJson;
  validateConfigJson(config);

  const stateFile = zip.file("state.json");
  const state = stateFile
    ? JSON.parse(await stateFile.async("string")) as StateJson
    : createStateFromConfig(config);

  let projectData: ProjectPackageData | null = null;
  const projectDataFile = zip.file("project.json");
  if (projectDataFile) {
    try {
      projectData = normalizeProjectPackageData(JSON.parse(await projectDataFile.async("string")));
    } catch {
      projectData = null;
    }
  }

  const baseImagePath = config.assets?.baseImage
    ?? findFallbackBaseImagePath(zipEntryPaths)
    ?? "art/base.png";
  const assets: PackageAssetManifest = {
    baseImagePath,
    statePaths: config.assets?.states?.slice(0, 4) ?? [],
    maskPaths: config.assets?.masks ? { ...config.assets.masks } : {},
    depthPath: config.assets?.depth ?? null,
    shaderChannelPaths: projectData?.shaderChannels.paths.slice(0, 4) ?? [null, null, null, null],
  };

  const referencedPaths = new Set<string>();
  referencedPaths.add(assets.baseImagePath);
  assets.statePaths.forEach((path) => referencedPaths.add(path));
  Object.values(assets.maskPaths).forEach((path) => referencedPaths.add(path));
  if (assets.depthPath) referencedPaths.add(assets.depthPath);
  assets.shaderChannelPaths.forEach((path) => {
    if (path) referencedPaths.add(path);
  });

  const files = new Map<string, Blob>();
  const warnings: string[] = [];

  for (const assetPath of referencedPaths) {
    const entry = zip.file(assetPath);
    if (!entry) {
      if (assetPath === assets.baseImagePath) {
        throw new PackageContractError(
          "missing_base_asset",
          `Base artwork asset not found in package: ${assetPath}`,
        );
      }
      warnings.push(`Referenced asset is missing from package: ${assetPath}`);
      continue;
    }
    files.set(assetPath, await entry.async("blob"));
  }

  return {
    config,
    state,
    projectData,
    assets,
    files,
    warnings,
  };
}
