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

/** All builtin TSL graphs, in registration order. */
export const BUILTIN_TSL_GRAPH_LIBRARY: readonly TslGraphEntry[] = [
  FLOW_FIELD_TSL_GRAPH,
  MOTION_GRID_TSL_GRAPH,
];

/** `scriptId` → factory lookup built from the library. */
export const BUILTIN_TSL_GRAPHS_BY_ID: Readonly<Record<string, TslGraphFactory>> =
  Object.fromEntries(BUILTIN_TSL_GRAPH_LIBRARY.map((entry) => [entry.id, entry.factory]));

export * from "./graphs/flowField";
export * from "./graphs/motionGrid";
export { hash21, hash22, valueNoise2D, fbm } from "./helpers/noise";
export { cosinePalette, auroraPalette } from "./helpers/color";
export type { TslGraphEntry, TslGraphFactory } from "@artex/contract/tsl";
