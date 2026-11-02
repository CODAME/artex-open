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

/** The Touch Grid graph's `scriptId`. Referenced by stored piece configs — never change it. */
export const TOUCH_GRID_TSL_SCRIPT_ID = "touch-grid-tsl";

/** The Procedural Flower graph's `scriptId` (TSL port of `flower-sdf-artex`). Never change it. */
export const FLOWER_SDF_TSL_SCRIPT_ID = "flower-sdf-tsl";

/** The Reeded Glass Portrait graph's `scriptId` (TSL port of `reeded-glass-portrait-artex`). Never change it. */
export const REEDED_GLASS_TSL_SCRIPT_ID = "reeded-glass-tsl";

/**
 * The exact-name live uniforms the flower graph declares with `liveUniform`.
 * Data, here rather than in the graph, so light code can read it without
 * importing `three/tsl`. The graph's test pins that it reads exactly these
 * names; voice detection's own `TSL_GRAPH_IDS_USING_VOICE` is tested against
 * this list.
 */
export const FLOWER_SDF_TSL_LIVE_UNIFORMS = [
  "uProximity",
  "uAudioLevel",
  "uVoiceJump",
  "uVoiceDance",
  "uVoiceSpin",
  "uVoiceStop",
  "uVoiceExplode",
  "uVoiceGrow",
  "uVoiceShrink",
  "uVoiceGlow",
  "uVoiceColor",
  "uVoiceCalm",
] as const;

/** The exact-name live uniforms the Reeded Glass graph declares with `liveUniform`. */
export const REEDED_GLASS_TSL_LIVE_UNIFORMS = [
  "uEffectStrength",
  "uEffectParam1",
  "uEffectParam2",
  "uEffectParam3",
  "uAudioLevel",
  "uBassLevel",
  "uTransientLevel",
  "uProximity",
  "uCameraLevel",
  "uFlowEnabled",
  "uFlowIntensity",
  "uFlowSpeed",
  "uFlowScale",
] as const;

/** The Phone Chromatic Warp graph's `scriptId` (TSL port of `phone-chromatic-warp-artex`). Never change it. */
export const PHONE_CHROMATIC_WARP_TSL_SCRIPT_ID = "phone-chromatic-warp-tsl";

/** The Phone Glitch Split graph's `scriptId` (TSL port of `phone-glitch-split-artex`). Never change it. */
export const PHONE_GLITCH_SPLIT_TSL_SCRIPT_ID = "phone-glitch-split-tsl";

/** The exact-name live uniforms both phone trigger graphs declare. */
const PHONE_TSL_LIVE_UNIFORMS = [
  "uEffectStrength",
  "uEffectParam1",
  "uEffectParam2",
  "uEffectParam3",
  "uAudioLevel",
  "uFlowEnabled",
  "uFlowIntensity",
  "uFlowSpeed",
  "uFlowScale",
] as const;
export const PHONE_CHROMATIC_WARP_TSL_LIVE_UNIFORMS = PHONE_TSL_LIVE_UNIFORMS;
export const PHONE_GLITCH_SPLIT_TSL_LIVE_UNIFORMS = PHONE_TSL_LIVE_UNIFORMS;

/** The ARTEX Living Field graph's `scriptId` (TSL port of `artex-living-field`). Never change it. */
export const LIVING_FIELD_TSL_SCRIPT_ID = "artex-living-field-tsl";

/** The exact-name scalar live uniforms the Living Field graph declares. */
export const LIVING_FIELD_TSL_LIVE_UNIFORMS = [
  "uDensity",
  "uSoftness",
  "uPorosity",
  "uViscosity",
  "uGranularity",
  "uLayerSeparation",
  "uFlowSpeedField",
  "uFlowDirection",
  "uBreathingRate",
  "uBreathingDepth",
  "uDrift",
  "uDisplacementAmount",
  "uPullStrength",
  "uStretchStrength",
  "uFractureAmount",
  "uWarpScale",
  "uFocusFalloff",
  "uTrailDecay",
  "uAfterglow",
  "uImprintStrength",
  "uMemoryBlur",
  "uEmissiveField",
  "uBloomField",
  "uContrastField",
  "uBlackLevelField",
  "uVignetteField",
  "uSaturationField",
  "uMemoryResidueField",
  "uAudioPulse",
  "uMotionAmount",
  "uArousal",
  "uIntimacy",
  "uTension",
  "uNovelty",
  "uAttention",
  "uBassLevel",
  "uCameraLevel",
  "uProximity",
  "uEffectStrength",
  "uEffectParam1",
  "uEffectParam2",
  "uEffectParam3",
  "uFlowEnabled",
  "uFlowIntensity",
  "uFlowSpeed",
  "uFlowScale",
] as const;

/** The vec2 / vec3 live uniforms the Living Field graph declares (`liveVec2` / `liveVec3`). */
export const LIVING_FIELD_TSL_LIVE_VECTORS = {
  presenceCentroid: "uPresenceCentroid",
  colorBase: "uColorBase",
  colorMid: "uColorMid",
  colorAccent: "uColorAccent",
} as const;

/** Live uniforms each builtin TSL graph declares, by `scriptId`. Graphs that declare none are absent. */
export const TSL_GRAPH_LIVE_UNIFORMS: Readonly<Record<string, readonly string[]>> = {
  [FLOWER_SDF_TSL_SCRIPT_ID]: FLOWER_SDF_TSL_LIVE_UNIFORMS,
  [REEDED_GLASS_TSL_SCRIPT_ID]: REEDED_GLASS_TSL_LIVE_UNIFORMS,
  [PHONE_CHROMATIC_WARP_TSL_SCRIPT_ID]: PHONE_CHROMATIC_WARP_TSL_LIVE_UNIFORMS,
  [PHONE_GLITCH_SPLIT_TSL_SCRIPT_ID]: PHONE_GLITCH_SPLIT_TSL_LIVE_UNIFORMS,
  [LIVING_FIELD_TSL_SCRIPT_ID]: LIVING_FIELD_TSL_LIVE_UNIFORMS,
};

/**
 * The builtin GLSL shaders ported to TSL: GLSL library id → graph `scriptId`.
 * Each port was measured against its patched GLSL on WebGL before it was
 * listed (docs/shaders.md §"Porting a GLSL builtin to TSL"). A host that holds
 * a GLSL id (the Studio's single-shader picker, a published v1 piece) reads
 * this to play the graph instead. The GLSL files stay in the library: saved
 * pieces reference their ids. Add a pair only with its parity measured.
 */
export const GLSL_TO_TSL_SCRIPT_ID: Readonly<Record<string, string>> = {
  "flower-sdf-artex": FLOWER_SDF_TSL_SCRIPT_ID,
  "reeded-glass-portrait-artex": REEDED_GLASS_TSL_SCRIPT_ID,
  "phone-chromatic-warp-artex": PHONE_CHROMATIC_WARP_TSL_SCRIPT_ID,
  "phone-glitch-split-artex": PHONE_GLITCH_SPLIT_TSL_SCRIPT_ID,
  "artex-living-field": LIVING_FIELD_TSL_SCRIPT_ID,
};

/** The graph a builtin GLSL shader was ported to, or null when it has not been. */
export function tslScriptIdForGlslShader(shaderId: string | null | undefined): string | null {
  if (!shaderId) return null;
  return Object.prototype.hasOwnProperty.call(GLSL_TO_TSL_SCRIPT_ID, shaderId) ? GLSL_TO_TSL_SCRIPT_ID[shaderId] : null;
}
