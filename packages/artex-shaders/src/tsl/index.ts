/**
 * Builtin TSL graph registry.
 *
 * The TSL analogue of `builtinShaderLibrary.ts` (GLSL). Each entry maps a stable
 * `scriptId` — referenced by `ShaderPassConfig.tslGraph.scriptId` — to a pure
 * `TslGraphFactory`. The runtime/Studio resolve `scriptId` → factory via
 * `createBuiltinTslGraphResolver()` (in @artex/runtime-web).
 *
 * Graphs are imported TS modules, never evaluated from `inlineScript` at runtime
 * (a CSP/supply-chain hazard). See docs/plans/gpu-rendering-platform-plan.md.
 */
import type { TslGraphEntry, TslGraphFactory } from "@artex/contract/tsl";
import { FLOW_FIELD_TSL_GRAPH } from "./graphs/flowField";
import { MOTION_GRID_TSL_GRAPH } from "./graphs/motionGrid";
import { TOUCH_GRID_TSL_GRAPH } from "./graphs/touchGrid";
import { FLOWER_SDF_TSL_GRAPH } from "./graphs/flowerSdf";
import { REEDED_GLASS_TSL_GRAPH } from "./graphs/reededGlass";
import { PHONE_CHROMATIC_WARP_TSL_GRAPH } from "./graphs/phoneChromaticWarp";
import { PHONE_GLITCH_SPLIT_TSL_GRAPH } from "./graphs/phoneGlitchSplit";
import { LIVING_FIELD_TSL_GRAPH } from "./graphs/livingField";
import { ARTEX_BASE_TSL_GRAPH } from "./graphs/artexBase";

/** All builtin TSL graphs, in registration order. */
export const BUILTIN_TSL_GRAPH_LIBRARY: readonly TslGraphEntry[] = [
  FLOW_FIELD_TSL_GRAPH,
  MOTION_GRID_TSL_GRAPH,
  TOUCH_GRID_TSL_GRAPH,
  FLOWER_SDF_TSL_GRAPH,
  REEDED_GLASS_TSL_GRAPH,
  PHONE_CHROMATIC_WARP_TSL_GRAPH,
  PHONE_GLITCH_SPLIT_TSL_GRAPH,
  LIVING_FIELD_TSL_GRAPH,
  ARTEX_BASE_TSL_GRAPH,
];

/** `scriptId` → factory lookup built from the library. */
export const BUILTIN_TSL_GRAPHS_BY_ID: Readonly<Record<string, TslGraphFactory>> =
  Object.fromEntries(BUILTIN_TSL_GRAPH_LIBRARY.map((entry) => [entry.id, entry.factory]));

export * from "./graphs/flowField";
export * from "./graphs/motionGrid";
export * from "./graphs/touchGrid";
export * from "./graphs/flowerSdf";
export * from "./graphs/reededGlass";
export * from "./graphs/phoneChromaticWarp";
export * from "./graphs/phoneGlitchSplit";
export * from "./graphs/livingField";
export * from "./graphs/artexBase";
export { hash21, hash22, valueNoise2D, fbm } from "./helpers/noise";
export { fromDisplay, toDisplay, toDisplay4 } from "./helpers/displaySpace";
export {
  artexHash,
  artexNoise,
  mapContainedUv,
  sampleContained,
  sampleMainTexture,
  applyFlow,
  blendStates,
  sampleMain,
  blendStatesStretched,
  sampleMainStretched,
} from "./helpers/artexImage";
export { cosinePalette, auroraPalette } from "./helpers/color";
export {
  applyColorEvolution,
  applyDepthParallax,
  applyFeedback,
  applyInsideColor,
  applyInsideUv,
  applyPaintLocal,
  applySliceDisplace,
} from "./helpers/evolutionEffects";
export type { TslGraphEntry, TslGraphFactory } from "@artex/contract/tsl";
