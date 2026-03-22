import type {
  ProjectReferenceEffectClass,
  ProjectReferenceEffectRecipeData,
  ProjectReferencePreviewFidelity,
  ProjectReferenceRendererMode,
  ProjectReferenceStyleFamily,
  ProjectReferenceVideoSourceMode,
} from "./projectPackage";
import { normalizeReferenceVideoSourceMode } from "./referenceVideoContract";

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const clamp01 = (value: number): number => clamp(value, 0, 1);

const normalizeReferenceEffectClassValue = (value: unknown): ProjectReferenceEffectClass => (
  value === "slice-distortion"
  || value === "puzzle-seam"
  || value === "ribbed-warp"
  || value === "stipple-dither"
  || value === "masked-radiance"
  || value === "particle-trails"
  || value === "scene-driven-3d"
  || value === "unknown"
    ? value
    : "unknown"
);

const normalizeReferenceRendererModeValue = (value: unknown): ProjectReferenceRendererMode => (
  value === "shader-2d" || value === "compositor-2d" || value === "particles-2d" || value === "scene-3d"
    ? value
    : "shader-2d"
);

const normalizeReferencePreviewFidelityValue = (value: unknown): ProjectReferencePreviewFidelity | undefined => (
  value === "native" || value === "fallback" ? value : undefined
);

const normalizeStyleFamilyValue = (value: unknown): ProjectReferenceStyleFamily | undefined => (
  value === "slice-distortion" || value === "puzzle-grid" ? value : undefined
);

const normalizeSourceCompatibility = (value: unknown): ProjectReferenceVideoSourceMode[] => {
  if (!Array.isArray(value)) return ["media", "webcam"];
  const normalized = value
    .map((entry) => normalizeReferenceVideoSourceMode(entry))
    .filter((entry, index, array) => array.indexOf(entry) === index);
  return normalized.length > 0 ? normalized : ["media", "webcam"];
};

const normalizeTextList = (value: unknown, maxItems: number): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, maxItems);
  return normalized.length > 0 ? normalized : undefined;
};

export const normalizeReferenceEffectRecipeData = (value: unknown): ProjectReferenceEffectRecipeData | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ProjectReferenceEffectRecipeData>;
  return {
    effectClass: normalizeReferenceEffectClassValue(candidate.effectClass),
    rendererMode: normalizeReferenceRendererModeValue(candidate.rendererMode),
    confidence: typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence)
      ? clamp01(candidate.confidence)
      : 0,
    sourceCompatibility: normalizeSourceCompatibility(candidate.sourceCompatibility),
    previewShaderFamily: normalizeStyleFamilyValue(candidate.previewShaderFamily),
    previewFidelity: normalizeReferencePreviewFidelityValue(candidate.previewFidelity),
    usesReferenceGeometry: typeof candidate.usesReferenceGeometry === "boolean"
      ? candidate.usesReferenceGeometry
      : undefined,
    requiresSegmentation: typeof candidate.requiresSegmentation === "boolean"
      ? candidate.requiresSegmentation
      : undefined,
    sceneDriven: typeof candidate.sceneDriven === "boolean" ? candidate.sceneDriven : undefined,
    capturedFeatures: normalizeTextList(candidate.capturedFeatures, 8),
    recipePlan: normalizeTextList(candidate.recipePlan, 6),
  };
};
