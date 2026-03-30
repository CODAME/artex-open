/**
 * artex-experiments — sandbox entry-points for R&D tracks.
 *
 * Each sandbox is a self-contained module with its own README.
 * Sandboxes are intentionally lower-stability than the main artex-* packages.
 * They may be promoted to `artex-extensions` or removed at any time.
 */

export const ARTexExperimentTrack = {
  touchDesigner: "touchdesigner",
  localAI: "local-ai",
  rendererRAndD: "renderer-r-and-d",
  threeRenderer: "three-renderer",
  touchDesignerBridge: "touchdesigner-bridge",
  mediaInputResearch: "media-input-research",
  sampleExtensions: "sample-extensions",
} as const;

export type ArtexExperimentTrack =
  typeof ARTexExperimentTrack[keyof typeof ARTexExperimentTrack];

/**
 * Minimal contract for a sandbox module experiment.
 * See EXPERIMENTS_GUIDE.md for the full contributor specification.
 */
export interface ExperimentModule {
  /** Stable track identifier from ARTexExperimentTrack. */
  track: ArtexExperimentTrack;
  /** Human-readable label for the experiment. */
  label: string;
  /** One-paragraph description of the experiment goal. */
  description: string;
  /** Whether the experiment is ready for others to run. */
  stable: boolean;
}

export * from "./sandboxes/three-renderer/index.js";
export * from "./sandboxes/touchdesigner-bridge/index.js";
export * from "./sandboxes/example-media-input/index.js";
export * from "./sandboxes/sample-webcam-input/index.js";
export * from "./sandboxes/sample-web-audio/index.js";
