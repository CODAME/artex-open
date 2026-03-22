/**
 * Three.js renderer sandbox — experimental entry-point.
 *
 * This sandbox explores a Three.js-based renderer backend as a complement
 * to the existing WebGL2 compositor for 3D-scene-based artworks.
 *
 * Status: Early Research. API is unstable.
 * See README.md for goals and scope.
 */

import type { ExperimentModule } from "../../index";

export const threeRendererExperiment: ExperimentModule = {
  track: "three-renderer",
  label: "Three.js Renderer R&D",
  description: (
    "Prototype a Three.js-based renderer backend that can consume an ARTEX " +
    "ConfigJson package and render 3D-scene-based artworks and reference-effect recipes."
  ),
  stable: false,
};
