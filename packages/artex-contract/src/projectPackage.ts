import type {
  ArtexSuggestion,
  ArtexSuggestionSnapshot,
  ArtworkSuggestionState,
  ProjectAIPolicy,
} from "./types";

export type ProjectShaderInteractionMode = "manual" | "equations" | "presets";
export type ProjectShaderInteractionPreset = "subtle" | "balanced" | "dramatic";
export type ProjectShaderBlendMode = "normal" | "multiply" | "screen" | "overlay" | "softlight" | "add";
export type ProjectShaderMaskSource = "none" | "channel1" | "stateA" | "stateB";
export type ProjectShaderMaskChannel = "alpha" | "luma" | "r" | "g" | "b";
export type ProjectShaderChannelSource = "none" | "file" | "camera";
export type ProjectShaderDialect = "artex" | "shaderbooth";
export type ProjectReferenceVideoSourceMode = "media" | "webcam";
export type ProjectReferenceVideoExpectationMode = "match-motion" | "motion-grammar";
export type ProjectReferenceVideoIntensity = "subtle" | "balanced" | "dramatic";
export type ProjectReferenceMediaKind = "image" | "video";
export type ProjectReferenceStyleFamily = "slice-distortion" | "puzzle-grid";
export type ProjectReferenceStyleOverride = "auto" | ProjectReferenceStyleFamily;
export type ProjectReferenceEffectClass =
  | "unknown"
  | "slice-distortion"
  | "puzzle-seam"
  | "ribbed-warp"
  | "stipple-dither"
  | "masked-radiance"
  | "particle-trails"
  | "scene-driven-3d";
export type ProjectReferenceRendererMode = "shader-2d" | "compositor-2d" | "particles-2d" | "scene-3d";
export type ProjectReferencePreviewFidelity = "native" | "fallback";

export interface ProjectShaderState {
  builtinShaderId: string | null;
  activeShaderKey?: string | null;
  userShaderPatched: string | null;
  userShaderChanges: string[];
  userShaderEnabled: boolean;
  userShaderName: string | null;
  shaderMix: number;
  shaderBlendMode: ProjectShaderBlendMode;
  shaderMaskSource: ProjectShaderMaskSource;
  shaderMaskChannel: ProjectShaderMaskChannel;
  shaderMaskThreshold: number;
  shaderMaskSoftness: number;
  shaderMaskInvert: boolean;
  shaderLinearColor: boolean;
  shaderPremultipliedAlpha: boolean;
  shaderTemporalSmoothing: number;
  shaderEffectStrength: number;
  shaderParams: {
    param1: number;
    param2: number;
    param3: number;
  };
  shaderInteractionMode: ProjectShaderInteractionMode;
  shaderInteractionPreset: ProjectShaderInteractionPreset;
  shaderDialect?: ProjectShaderDialect;
}

export interface ProjectRuntimeState {
  useCameraAsArtwork?: boolean;
  artworkImageEnabled?: boolean;
  cameraPreviewVisible?: boolean;
  cameraPreviewMirrored?: boolean;
  timeScale?: number;
}

export interface ProjectPackageAIData {
  policy?: ProjectAIPolicy;
  suggestionState?: ArtworkSuggestionState;
  acceptedSuggestion?: ArtexSuggestion | null;
  savedSnapshots?: ArtexSuggestionSnapshot[];
}

export interface ProjectReferenceVideoAnalysisData {
  durationSeconds: number;
  width: number;
  height: number;
  sampleCount: number;
  averageMotion: number;
  peakMotion: number;
  motionVariation: number;
  brightnessMean: number;
  brightnessContrast: number;
  horizontalBias: number;
  referenceKind?: ProjectReferenceMediaKind;
  styleFamily?: ProjectReferenceStyleFamily;
  styleConfidence?: number;
  gridLineStrength?: number;
  gridRegularity?: number;
  estimatedCellsX?: number;
  estimatedCellsY?: number;
  verticalStripeStrength?: number;
  verticalStripeRegularity?: number;
  horizontalStripeStrength?: number;
  horizontalStripeRegularity?: number;
  speckleDensity?: number;
  capturedFeatures?: string[];
}

export interface ProjectReferenceVideoExperienceData {
  referenceName: string | null;
  sourceMode: ProjectReferenceVideoSourceMode;
  styleOverride?: ProjectReferenceStyleOverride;
  expectationMode: ProjectReferenceVideoExpectationMode;
  intensity: ProjectReferenceVideoIntensity;
  analysis?: ProjectReferenceVideoAnalysisData | null;
  generatedShaderName?: string | null;
  appliedAt?: string | null;
}

export interface ProjectReferenceEffectRecipeData {
  effectClass: ProjectReferenceEffectClass;
  rendererMode: ProjectReferenceRendererMode;
  confidence: number;
  sourceCompatibility: ProjectReferenceVideoSourceMode[];
  previewShaderFamily?: ProjectReferenceStyleFamily;
  previewFidelity?: ProjectReferencePreviewFidelity;
  usesReferenceGeometry?: boolean;
  requiresSegmentation?: boolean;
  sceneDriven?: boolean;
  capturedFeatures?: string[];
  recipePlan?: string[];
}

export interface ProjectPackageExperimentalData {
  referenceVideoExperience?: ProjectReferenceVideoExperienceData | null;
  referenceEffectRecipe?: ProjectReferenceEffectRecipeData | null;
}

export interface ProjectPackageData {
  version: number;
  shader: ProjectShaderState;
  shaderChannels: {
    paths: (string | null)[];
    sources?: ProjectShaderChannelSource[];
  };
  runtime?: ProjectRuntimeState;
  ai?: ProjectPackageAIData;
  experimental?: ProjectPackageExperimentalData;
}
