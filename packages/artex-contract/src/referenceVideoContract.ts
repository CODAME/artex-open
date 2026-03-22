import type {
  ProjectReferenceMediaKind,
  ProjectReferenceStyleFamily,
  ProjectReferenceStyleOverride,
  ProjectReferenceVideoAnalysisData,
  ProjectReferenceVideoExpectationMode,
  ProjectReferenceVideoExperienceData,
  ProjectReferenceVideoIntensity,
  ProjectReferenceVideoSourceMode,
} from "./projectPackage";

const DEFAULT_REFERENCE_VIDEO_SOURCE_MODE: ProjectReferenceVideoSourceMode = "webcam";
const DEFAULT_REFERENCE_VIDEO_STYLE_OVERRIDE: ProjectReferenceStyleOverride = "auto";
const DEFAULT_REFERENCE_VIDEO_EXPECTATION_MODE: ProjectReferenceVideoExpectationMode = "motion-grammar";
const DEFAULT_REFERENCE_VIDEO_INTENSITY: ProjectReferenceVideoIntensity = "balanced";

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const clamp01 = (value: number): number => clamp(value, 0, 1);
const round = (value: number, digits = 4): number => Number.parseFloat(value.toFixed(digits));

const normalizeReferenceMediaKindValue = (value: unknown): ProjectReferenceMediaKind | undefined => (
  value === "image" || value === "video" ? value : undefined
);

const normalizeReferenceStyleFamilyValue = (value: unknown): ProjectReferenceStyleFamily | undefined => (
  value === "slice-distortion" || value === "puzzle-grid" ? value : undefined
);

const normalizeCapturedFeatures = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const features = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 8);
  return features.length > 0 ? features : undefined;
};

export const normalizeReferenceVideoSourceMode = (value: unknown): ProjectReferenceVideoSourceMode => (
  value === "media" || value === "webcam" ? value : DEFAULT_REFERENCE_VIDEO_SOURCE_MODE
);

export const normalizeReferenceVideoStyleOverride = (value: unknown): ProjectReferenceStyleOverride => (
  value === "slice-distortion" || value === "puzzle-grid" || value === "auto"
    ? value
    : DEFAULT_REFERENCE_VIDEO_STYLE_OVERRIDE
);

export const normalizeReferenceVideoExpectationMode = (
  value: unknown,
): ProjectReferenceVideoExpectationMode => (
  value === "match-motion" || value === "motion-grammar"
    ? value
    : DEFAULT_REFERENCE_VIDEO_EXPECTATION_MODE
);

export const normalizeReferenceVideoIntensity = (value: unknown): ProjectReferenceVideoIntensity => (
  value === "subtle" || value === "balanced" || value === "dramatic"
    ? value
    : DEFAULT_REFERENCE_VIDEO_INTENSITY
);

export const normalizeReferenceVideoAnalysis = (
  value: unknown,
): ProjectReferenceVideoAnalysisData | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ProjectReferenceVideoAnalysisData>;
  const readNumeric = (key: keyof ProjectReferenceVideoAnalysisData): number | null => {
    const candidateValue = candidate[key];
    return typeof candidateValue === "number" && Number.isFinite(candidateValue)
      ? candidateValue
      : null;
  };

  const durationSeconds = readNumeric("durationSeconds");
  const width = readNumeric("width");
  const height = readNumeric("height");
  const sampleCount = readNumeric("sampleCount");
  const averageMotion = readNumeric("averageMotion");
  const peakMotion = readNumeric("peakMotion");
  const motionVariation = readNumeric("motionVariation");
  const brightnessMean = readNumeric("brightnessMean");
  const brightnessContrast = readNumeric("brightnessContrast");
  const horizontalBias = readNumeric("horizontalBias");

  if (
    durationSeconds === null
    || width === null
    || height === null
    || sampleCount === null
    || averageMotion === null
    || peakMotion === null
    || motionVariation === null
    || brightnessMean === null
    || brightnessContrast === null
    || horizontalBias === null
  ) {
    return null;
  }

  return {
    durationSeconds: round(Math.max(0, durationSeconds)),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    sampleCount: Math.max(1, Math.round(sampleCount)),
    averageMotion: clamp01(averageMotion),
    peakMotion: clamp01(peakMotion),
    motionVariation: clamp01(motionVariation),
    brightnessMean: clamp01(brightnessMean),
    brightnessContrast: clamp01(brightnessContrast),
    horizontalBias: clamp(horizontalBias, -1, 1),
    referenceKind: normalizeReferenceMediaKindValue(candidate.referenceKind),
    styleFamily: normalizeReferenceStyleFamilyValue(candidate.styleFamily),
    styleConfidence: typeof candidate.styleConfidence === "number" && Number.isFinite(candidate.styleConfidence)
      ? clamp01(candidate.styleConfidence)
      : undefined,
    gridLineStrength: typeof candidate.gridLineStrength === "number" && Number.isFinite(candidate.gridLineStrength)
      ? clamp01(candidate.gridLineStrength)
      : undefined,
    gridRegularity: typeof candidate.gridRegularity === "number" && Number.isFinite(candidate.gridRegularity)
      ? clamp01(candidate.gridRegularity)
      : undefined,
    estimatedCellsX: typeof candidate.estimatedCellsX === "number" && Number.isFinite(candidate.estimatedCellsX)
      ? clamp(Math.round(candidate.estimatedCellsX), 2, 40)
      : undefined,
    estimatedCellsY: typeof candidate.estimatedCellsY === "number" && Number.isFinite(candidate.estimatedCellsY)
      ? clamp(Math.round(candidate.estimatedCellsY), 2, 40)
      : undefined,
    verticalStripeStrength: typeof candidate.verticalStripeStrength === "number" && Number.isFinite(candidate.verticalStripeStrength)
      ? clamp01(candidate.verticalStripeStrength)
      : undefined,
    verticalStripeRegularity: typeof candidate.verticalStripeRegularity === "number" && Number.isFinite(candidate.verticalStripeRegularity)
      ? clamp01(candidate.verticalStripeRegularity)
      : undefined,
    horizontalStripeStrength: typeof candidate.horizontalStripeStrength === "number" && Number.isFinite(candidate.horizontalStripeStrength)
      ? clamp01(candidate.horizontalStripeStrength)
      : undefined,
    horizontalStripeRegularity: typeof candidate.horizontalStripeRegularity === "number" && Number.isFinite(candidate.horizontalStripeRegularity)
      ? clamp01(candidate.horizontalStripeRegularity)
      : undefined,
    speckleDensity: typeof candidate.speckleDensity === "number" && Number.isFinite(candidate.speckleDensity)
      ? clamp01(candidate.speckleDensity)
      : undefined,
    capturedFeatures: normalizeCapturedFeatures(candidate.capturedFeatures),
  };
};

export const normalizeReferenceVideoExperienceData = (
  value: unknown,
): ProjectReferenceVideoExperienceData | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ProjectReferenceVideoExperienceData>;
  return {
    referenceName: typeof candidate.referenceName === "string" && candidate.referenceName.trim().length > 0
      ? candidate.referenceName
      : null,
    sourceMode: normalizeReferenceVideoSourceMode(candidate.sourceMode),
    styleOverride: normalizeReferenceVideoStyleOverride(candidate.styleOverride),
    expectationMode: normalizeReferenceVideoExpectationMode(candidate.expectationMode),
    intensity: normalizeReferenceVideoIntensity(candidate.intensity),
    analysis: normalizeReferenceVideoAnalysis(candidate.analysis),
    generatedShaderName: typeof candidate.generatedShaderName === "string" && candidate.generatedShaderName.trim().length > 0
      ? candidate.generatedShaderName
      : null,
    appliedAt: typeof candidate.appliedAt === "string" && candidate.appliedAt.trim().length > 0
      ? candidate.appliedAt
      : null,
  };
};
