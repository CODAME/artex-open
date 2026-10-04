/**
 * V1 → V3 mapping tables for the synthesizer.
 *
 * Inputs to these tables come from the corpus audit (2026-05-03):
 * 87 pieces total, 100% V1 ZIP layout. The audit captured every
 * distinct value of `shader_modules[].id`, `interactions.actionMappings[].id`,
 * and `artistTemplate` — see `docs/phase-c-implementation-plan.md`
 * "Reference: corpus audit" section.
 *
 * The mappings are intentionally hand-curated. The synthesizer is a
 * best-effort import path (used by C.2.f's opt-in conversion flow);
 * the artist visually accepts/rejects the result. We don't aim for
 * pixel-perfect, just "good enough that the artist can clean up the
 * diff in the panel."
 */

import type { EvolutionRuleConfig, ShaderPassConfig } from "../v3/types";
import type { ArtworkStateConfig, TriggerRule } from "../v2/types";

// ---------------------------------------------------------------------------
// shader_modules[].id → V3 (4 module ids in the corpus)
// ---------------------------------------------------------------------------

/**
 * One V1 shader module maps to either a V3 shader pass or to an
 * evolution rule (when the V1 module is parameter-modulating, not
 * pixel-rendering).
 *
 * `paramMap` translates V1 module param names to V3 pass uniform
 * names. V1 module params are loosely-typed so we copy through any
 * keys not in the map verbatim.
 *
 * `needsBanner` triggers a `synth_v1_module_inexact` warning when set
 * — for cases where the V3 mapping is a "close enough" fallback rather
 * than a 1:1 port.
 */
export interface V1ModuleMapping {
  /** Map to a V3 shader-stack pass. */
  pass?: {
    shaderId: string;
    paramMap?: Record<string, string>;
    blendMode?: ShaderPassConfig["blendMode"];
  };
  /** Map to a V3 evolution rule (param drift over time). */
  evolutionRule?: {
    param: string;
    cycleDurationHours: number;
    keyframes: { at: number; value: number }[];
  };
  /** Optional banner explaining a lossy mapping. */
  needsBanner?: string;
}

/**
 * V1 module-id → mapping. Audit found these 4 distinct ids across
 * 21 pieces in the corpus:
 *   flow-distortion   19 pieces
 *   depth-parallax    19 pieces
 *   color-evolution   18 pieces
 *   feedback           4 pieces
 */
export const V1_MODULE_TO_V3: Record<string, V1ModuleMapping | undefined> = {
  "flow-distortion": {
    pass: {
      shaderId: "bumped-sinusoidal-warp-artex",
      paramMap: { intensity: "amplitude", speed: "speed", scale: "frequency" },
      blendMode: "normal",
    },
  },
  "depth-parallax": {
    pass: {
      // V3 has no exact parallax-equivalent shader yet. Use the warp
      // shader as a fallback and surface a banner so the artist knows
      // the visual won't match V1 perfectly.
      shaderId: "bumped-sinusoidal-warp-artex",
      paramMap: { depth: "amplitude", speed: "speed" },
      blendMode: "screen",
    },
    needsBanner:
      "depth-parallax has no exact V3 equivalent yet — using bumped-sinusoidal-warp as a visual fallback. Adjust uniforms in the Composition section if the result drifts.",
  },
  "color-evolution": {
    // Not a shader; V1 color-evolution drives a slow palette drift.
    // V3 expresses this as an evolution rule on a global param the
    // shader-stack reads.
    evolutionRule: {
      param: "paletteWarmth",
      cycleDurationHours: 168, // weekly
      keyframes: [
        { at: 0, value: 0.4 },
        { at: 0.5, value: 0.7 },
        { at: 1, value: 0.4 },
      ],
    },
  },
  feedback: {
    pass: {
      shaderId: "pastel-wave-trails-artex",
      paramMap: { decay: "decay", intensity: "intensity" },
      blendMode: "screen",
    },
  },
};

// ---------------------------------------------------------------------------
// interactions.actionMappings[].id → V3 behaviour (5 action ids in the corpus)
// ---------------------------------------------------------------------------

/**
 * V1 action mappings are gesture/sound/proximity → discrete behaviour
 * (e.g. "stop on open palm"). V3 expresses these as `TriggerRule`s in
 * the behaviour model.
 *
 * `targetState` referenced from the trigger is created by the
 * synthesizer if it isn't already declared. The synthesizer also
 * adds a fallback `idle` state if the piece has triggers but no
 * existing state machine.
 */
export interface V1ActionMapping {
  /** Stable id for the V3 trigger we emit. */
  triggerId: string;
  /** What state the trigger transitions into. */
  targetState: string;
  /** Description for the C.2.f import preview. */
  label: string;
  /** Builds the V3 `when:` clause from the V1 action's enabled flag,
   *  sensitivity, and cooldown. */
  buildWhen: (action: V1ActionMappingInput) => TriggerRule["when"];
}

export interface V1ActionMappingInput {
  enabled?: boolean;
  sensitivity?: "low" | "medium" | "high";
  cooldownMs?: number;
}

const sensitivityToThreshold = (s?: string): number => {
  if (s === "low") return 0.7;
  if (s === "high") return 0.4;
  return 0.55; // medium / default
};

/**
 * V1 action-id → mapping. The audit found these 5 ids; every piece
 * with interactions has the same 5 entries (default ARTEX action set).
 */
export const V1_ACTION_TO_V3: Record<string, V1ActionMapping | undefined> = {
  stop_open_palm: {
    triggerId: "v1-stop-open-palm",
    targetState: "paused",
    label: "Open palm pauses the piece",
    buildWhen: (action) => [
      {
        signal: "gesture",
        operator: "equals",
        value: "open_palm",
        confidenceGte: sensitivityToThreshold(action.sensitivity),
      },
    ],
  },
  exit_wave: {
    triggerId: "v1-exit-wave",
    targetState: "idle",
    label: "Wave gesture returns to idle",
    buildWhen: (action) => [
      {
        signal: "gesture",
        operator: "equals",
        value: "wave",
        confidenceGte: sensitivityToThreshold(action.sensitivity),
      },
    ],
  },
  explosion_mouth_open: {
    triggerId: "v1-explosion-mouth-open",
    targetState: "aroused",
    label: "Mouth-open burst triggers high-arousal state",
    buildWhen: (action) => [
      { signal: "face_present", operator: "gte", value: sensitivityToThreshold(action.sensitivity) },
    ],
  },
  celebration_clap_sound: {
    triggerId: "v1-celebration-clap-sound",
    targetState: "expressive",
    label: "Sudden sound peak triggers expressive state",
    buildWhen: (action) => [
      { signal: "sound_peak", operator: "gte", value: sensitivityToThreshold(action.sensitivity) },
    ],
  },
  zoom_proximity: {
    triggerId: "v1-zoom-proximity",
    targetState: "aroused",
    label: "Proximity zoom-in triggers high-arousal state",
    buildWhen: (action) => [
      { signal: "proximity", operator: "gte", value: sensitivityToThreshold(action.sensitivity) },
    ],
  },
};

/**
 * Default V3 state set the synthesizer emits when a V1 piece has at
 * least one enabled action mapping. States referenced by triggers
 * (`paused`, `idle`, `aroused`, `expressive`) are pre-declared.
 */
export const V1_DEFAULT_BEHAVIOUR_STATES: ArtworkStateConfig[] = [
  { id: "idle", label: "Idle", initial: true },
  { id: "paused", label: "Paused" },
  { id: "aroused", label: "Aroused" },
  { id: "expressive", label: "Expressive" },
];

export const V1_DEFAULT_BEHAVIOUR_FALLBACK_STATE = "idle";

// ---------------------------------------------------------------------------
// artistTemplate → V3 evolution preset (6 template values in the corpus)
// ---------------------------------------------------------------------------

const breathingCycle = (): EvolutionRuleConfig[] => [
  {
    param: "amplitude",
    anchor: "install",
    cycleDurationHours: 0.05, // ~3 minutes
    repeat: true,
    keyframes: [
      { at: 0, value: 0.4 },
      { at: 0.5, value: 0.7 },
      { at: 1, value: 0.4 },
    ],
  },
];

const seasonalCycle = (): EvolutionRuleConfig[] => [
  {
    param: "paletteWarmth",
    anchor: "calendar",
    cycleDurationHours: 24 * 90, // quarterly cycle
    repeat: true,
    keyframes: [
      { at: 0, value: 0.7 }, // winter cool
      { at: 0.25, value: 0.5 },
      { at: 0.5, value: 0.3 }, // summer warm
      { at: 0.75, value: 0.5 },
      { at: 1, value: 0.7 },
    ],
  },
];

const dreamDrift = (): EvolutionRuleConfig[] => [
  {
    param: "amplitude",
    anchor: "install",
    cycleDurationHours: 6,
    repeat: true,
    keyframes: [
      { at: 0, value: 0.3 },
      { at: 0.5, value: 0.6 },
      { at: 1, value: 0.3 },
    ],
  },
  {
    param: "frequency",
    anchor: "install",
    cycleDurationHours: 8,
    repeat: true,
    keyframes: [
      { at: 0, value: 1.5 },
      { at: 0.5, value: 3.0 },
      { at: 1, value: 1.5 },
    ],
  },
];

const flowingCycle = (): EvolutionRuleConfig[] => [
  {
    param: "speed",
    anchor: "install",
    cycleDurationHours: 24,
    repeat: true,
    keyframes: [
      { at: 0, value: 0.2 },
      { at: 0.5, value: 0.6 },
      { at: 1, value: 0.2 },
    ],
  },
];

/**
 * V1 artistTemplate → V3 evolution rules. The audit found these 6
 * values across 87 pieces; `static` (61 pieces) is a no-op default.
 */
export const V1_TEMPLATE_TO_V3_EVOLUTION: Record<string, (() => EvolutionRuleConfig[]) | undefined> = {
  static: () => [],
  breathing: breathingCycle,
  seasonal: seasonalCycle,
  presence: () => [],
  dream: dreamDrift,
  flowing: flowingCycle,
};

/**
 * V1 artistTemplate → V3 default base shader. For pieces that have
 * no `builtinShaderId` and no `shader_modules[]` (the 70% default-
 * flow majority), the synthesizer needs *some* shader to produce a
 * valid V3 stack. The choice is per-template so the result at least
 * roughly matches the artist's intent.
 *
 * These are best-effort — the C.2.f opt-in flow lets the artist
 * accept or reject the result.
 */
export const V1_TEMPLATE_TO_DEFAULT_SHADER: Record<string, string> = {
  static: "bumped-sinusoidal-warp-artex",
  breathing: "bumped-sinusoidal-warp-artex",
  seasonal: "pastel-wave-trails-artex",
  presence: "bumped-sinusoidal-warp-artex",
  dream: "pastel-wave-trails-artex",
  flowing: "bumped-sinusoidal-warp-artex",
};

export const V1_DEFAULT_SHADER_FALLBACK = "bumped-sinusoidal-warp-artex";

// ---------------------------------------------------------------------------
// Blend mode normalization
// ---------------------------------------------------------------------------

/**
 * V3 supports `normal | multiply | screen | overlay | add`. V1 also
 * supports `softlight` (2 pieces in the corpus). Map `softlight` to
 * `multiply` and emit a banner — the visual is close-but-not-exact.
 */
export const V1_BLEND_MODE_FALLBACKS: Record<string, ShaderPassConfig["blendMode"]> = {
  softlight: "multiply",
};
