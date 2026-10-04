/**
 * Stable `scriptId` strings for the builtin TSL graphs, and nothing else.
 *
 * WHY THIS FILE EXISTS (#2765)
 * A `scriptId` is a piece of catalog data: it identifies which graph a
 * `ShaderPassConfig.tslGraph` refers to, and light surfaces need it to describe
 * an experience without ever rendering one. The id used to live beside its
 * factory in `graphs/flowField.ts`, which imports `three/tsl` at module scope —
 * so `apps/creator/src/content/flowFieldTsl.ts` reached the whole WebGPU TSL
 * stack to name a string, and `content/builtinLibraryItems` (which imports it)
 * became the only edge from the `studio-shared` chunk to the 2.8MB `studio` one.
 * AdminLibraryPage and AdminFeaturedExperiencesPage each paid ~1030KB brotli
 * above the entry floor for it.
 *
 * Same shape and same fix as `@artex/render-core/create-program` and
 * `@artex/runtime-web/shader-patcher`: a dependency-free module behind its own
 * export subpath, so a consumer that needs only the constant pulls only the
 * constant. **Keep this file dependency-free** — not even a type import that
 * resolves to a module with runtime code. `scripts/check_entry_chunk_weight.test.mjs`
 * asserts that, because one import here silently re-welds both admin routes.
 *
 * The graph modules re-export from here rather than declaring their own copy, so
 * the id has exactly one definition and `@artex/shaders/tsl` keeps exporting it.
 */

/** The Flow Field graph's `scriptId`. Referenced by stored piece configs — never change it. */
export const FLOW_FIELD_TSL_SCRIPT_ID = "flow-field-tsl";

/** The Motion Grid graph's `scriptId`. Referenced by stored piece configs — never change it. */
export const MOTION_GRID_TSL_SCRIPT_ID = "motion-grid-tsl";
