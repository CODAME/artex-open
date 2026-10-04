/**
 * V1 → V3 synthesizer (the "v2-shader" branch in `detectLegacyKind`).
 *
 * Despite the legacy name, this is the **V1 format** synthesizer per
 * the corpus audit (2026-05-03): every piece in production uses the
 * V1 ZIP layout (`config.json` / `state.json` / `project.json` at
 * root), with shader info nested under `projectData.shader.*` and
 * artwork-level config (template / artistTemplate / shader_modules /
 * actionMappings) in the `artwork` blob.
 *
 * Mappings are hand-curated in `v1Tables.ts` based on the 4 distinct
 * shader_modules ids, 5 action ids, and 6 artistTemplate values
 * observed across 87 pieces. ~70% of the corpus is "default flow"
 * (no shader, `artistTemplate: "static"`); the synthesizer emits a
 * minimal V3 piece for those.
 *
 * Best-effort import. The C.2.f opt-in flow lets the artist visually
 * accept or reject the result.
 *
 * Pure function. No I/O, no DOM. Tests run in node.
 */
import type { ArtexSignalType, ArtworkStateConfig, TriggerRule } from "../v2/types";
import type {
  BehaviourModelConfig,
  EvolutionRuleConfig,
  GestureBindingConfig,
  PieceConfig,
  ShaderPassConfig,
} from "../v3/types";
import type { LegacyPackageEnvelope, SynthesisWarning } from "./synthesizeFromLegacy";
import {
  V1_ACTION_TO_V3,
  V1_BLEND_MODE_FALLBACKS,
  V1_DEFAULT_BEHAVIOUR_FALLBACK_STATE,
  V1_DEFAULT_BEHAVIOUR_STATES,
  V1_DEFAULT_SHADER_FALLBACK,
  V1_MODULE_TO_V3,
  V1_TEMPLATE_TO_DEFAULT_SHADER,
  V1_TEMPLATE_TO_V3_EVOLUTION,
} from "./v1Tables";

interface V1ShaderSynthesisOutput {
  config: PieceConfig;
  warnings: SynthesisWarning[];
}

const PRIMARY_PASS_ID = "primary";

/**
 * Map of (v2 sourceId, v2 signal) → V3 ArtexSignalType for the legacy
 * `interactions.continuousBindings` shape. The corpus has zero of
 * these today (V1 uses discrete `actionMappings` instead), but the
 * code path is preserved for forward compatibility — pieces created
 * via future V2 starters could carry continuousBindings.
 */
const SIGNAL_PAIR_MAP: Record<string, ArtexSignalType | undefined> = {
  "camera:proximity": "proximity",
  "camera:presence": "presence",
  "camera:movement": "movement_energy",
  "camera:movementEnergy": "movement_energy",
  "camera:stillness": "stillness_duration",
  "camera:idle": "idle_time",
  "camera:gesture": "gesture",
  "camera:pose": "pose",
  "camera:facePresent": "face_present",
  "camera:faceX": "face_x",
  "camera:faceY": "face_y",
  "camera:faceSize": "face_size",
  "camera:faceProximity": "face_size",
  "mic:level": "sound_level",
  "mic:peak": "sound_peak",
  "mic:loudness": "sound_level",
  "time:elapsed": "time",
  "time:now": "time",
  "time:idle": "idle_time",
};

export function synthesizeFromV2Shader(input: LegacyPackageEnvelope): V1ShaderSynthesisOutput {
  const warnings: SynthesisWarning[] = [];
  const projectData = (input.projectData && typeof input.projectData === "object" ? input.projectData : {}) as Record<string, unknown>;
  const artwork = (input.artwork && typeof input.artwork === "object" ? input.artwork : {}) as Record<string, unknown>;

  // Identity. Prefer the artwork's title/artworkId (set by ConfigJson)
  // and fall back to project.json if needed.
  const artworkId = readString(artwork, "artworkId") ?? readString(projectData, "artworkId");
  const id = artworkId && artworkId.length > 0 ? artworkId : `synthesized-v1-shader-${Date.now()}`;
  const titleArt = readString(artwork, "title");
  const titleProj = readString(projectData, "title");
  const title = titleArt && titleArt.length > 0
    ? titleArt
    : (titleProj && titleProj.length > 0 ? titleProj : "Untitled");

  const passes = synthesizeShaderPasses(projectData, artwork, warnings);
  const globalParams = synthesizeGlobalParams(projectData);
  const evolutionRules = synthesizeEvolutionRules(artwork, warnings);
  const behaviour = synthesizeBehaviour(artwork, warnings);
  const gestureBindings = synthesizeGestureBindings(artwork, warnings);

  const config: PieceConfig = {
    version: 3,
    id,
    title,
    renderer: { primary: "shader" },
    shaderStack: {
      passes,
      ...(Object.keys(globalParams).length > 0 ? { globalParams } : {}),
      resolutionScale: 1.0,
    },
    ...(evolutionRules.length > 0 ? { evolutionRules } : {}),
    ...(behaviour ? { behaviour } : {}),
    ...(gestureBindings.length > 0 ? { gestureBindings } : {}),
  };

  return { config, warnings };
}

// ---------------------------------------------------------------------------
// Shader passes
// ---------------------------------------------------------------------------

function synthesizeShaderPasses(
  projectData: Record<string, unknown>,
  artwork: Record<string, unknown>,
  warnings: SynthesisWarning[],
): ShaderPassConfig[] {
  const passes: ShaderPassConfig[] = [];

  // 1. Primary shader from project.json `shader.builtinShaderId`.
  const shaderState = readObject(projectData, "shader");
  if (shaderState) {
    const builtinShaderId = readString(shaderState, "builtinShaderId");
    if (builtinShaderId && builtinShaderId.length > 0) {
      passes.push(buildPrimaryPass(shaderState, builtinShaderId, warnings));
    }
  }

  // 2. shader_modules[] from artwork (ConfigJson). Each module either
  //    becomes another pass or contributes an evolution rule (handled
  //    in synthesizeEvolutionRules; this block only emits passes).
  const modules = readArray(artwork, "shader_modules");
  for (const mod of modules) {
    if (!mod || typeof mod !== "object") continue;
    const moduleObj = mod as Record<string, unknown>;
    const moduleId = readString(moduleObj, "id");
    if (!moduleId) continue;

    const mapping = V1_MODULE_TO_V3[moduleId];
    if (!mapping) {
      warnings.push({
        code: "unknown_v1_module",
        message: `V1 module "${moduleId}" has no V3 mapping. Skipped — review the Composition section after import.`,
        field: `artwork.shader_modules[].id=${moduleId}`,
      });
      continue;
    }
    if (!mapping.pass) continue; // evolution-rule mapping handled elsewhere
    if (mapping.needsBanner) {
      warnings.push({
        code: "synth_v1_module_inexact",
        message: mapping.needsBanner,
        field: `artwork.shader_modules[].id=${moduleId}`,
      });
    }

    const moduleParams = readObject(moduleObj, "params") ?? {};
    passes.push({
      id: `v1-${moduleId}`,
      shaderId: mapping.pass.shaderId,
      params: remapParams(moduleParams, mapping.pass.paramMap, warnings, `v1-${moduleId}`),
      blendMode: mapping.pass.blendMode ?? "normal",
    });
  }

  // 3. Default-flow case — no primary shader and no module passes.
  //    Pick a default V3 shader based on artistTemplate so the artist
  //    sees *something* in the V3 preview rather than an empty stack.
  //    The warning copy distinguishes between "the piece really had
  //    nothing" and "the piece had a shader the converter doesn't
  //    understand" (custom GLSL, shared library shader, etc.) so the
  //    artist isn't told something untrue when their piece DOES have
  //    a working shader in the legacy panel.
  if (passes.length === 0) {
    const artistTemplate = readString(artwork, "artistTemplate") ?? "static";
    const fallbackShaderId =
      V1_TEMPLATE_TO_DEFAULT_SHADER[artistTemplate] ?? V1_DEFAULT_SHADER_FALLBACK;
    const hasCustomShaderHint =
      readString(artwork, "userShaderSource") !== null
      || readString(artwork, "userShaderName") !== null
      || readString(artwork, "sharedShaderId") !== null;
    if (hasCustomShaderHint) {
      warnings.push({
        code: "custom_shader_not_yet_converted",
        message:
          `This piece uses a custom or shared shader the converter doesn't yet translate. ` +
          `It chose "${fallbackShaderId}" as a placeholder so the new panel has something to render. ` +
          `Your shader is preserved in the previous-panel format — switch back any time to keep editing it as before.`,
        blockId: PRIMARY_PASS_ID,
      });
    } else {
      warnings.push({
        code: "default_flow_synthesis",
        message:
          `The converter couldn't identify a shader on this piece, so it chose "${fallbackShaderId}" as a starting point ` +
          `based on artistTemplate "${artistTemplate}". Replace it from the Composition section after the update.`,
        blockId: PRIMARY_PASS_ID,
      });
    }
    passes.push({
      id: PRIMARY_PASS_ID,
      shaderId: fallbackShaderId,
      params: {},
      blendMode: "normal",
    });
  }

  return passes;
}

function buildPrimaryPass(
  shaderState: Record<string, unknown>,
  shaderId: string,
  warnings: SynthesisWarning[],
): ShaderPassConfig {
  const params: Record<string, number> = {};
  const rawParams = readObject(shaderState, "shaderParams");
  if (rawParams) {
    for (const [key, value] of Object.entries(rawParams)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        params[key] = value;
      } else {
        warnings.push({
          code: "non_numeric_shader_param",
          message: `Shader param "${key}" was not a finite number on disk and is dropped.`,
          field: `projectData.shader.shaderParams.${key}`,
          blockId: PRIMARY_PASS_ID,
        });
      }
    }
  }

  return {
    id: PRIMARY_PASS_ID,
    shaderId,
    params,
    blendMode: normalizeBlendMode(readString(shaderState, "shaderBlendMode"), warnings, PRIMARY_PASS_ID),
  };
}

function normalizeBlendMode(
  raw: string | null,
  warnings: SynthesisWarning[],
  blockId: string,
): ShaderPassConfig["blendMode"] {
  if (!raw) return "normal";
  switch (raw) {
    case "normal":
    case "multiply":
    case "screen":
    case "overlay":
    case "add":
      return raw;
    default: {
      const fallback = V1_BLEND_MODE_FALLBACKS[raw];
      if (fallback) {
        warnings.push({
          code: "blend_mode_fallback",
          message: `Blend mode "${raw}" isn't in V3's set; mapped to "${fallback}" — visual may drift.`,
          blockId,
        });
        return fallback;
      }
      warnings.push({
        code: "unknown_blend_mode",
        message: `Blend mode "${raw}" isn't recognised; defaulting to "normal".`,
        blockId,
      });
      return "normal";
    }
  }
}

function remapParams(
  rawParams: Record<string, unknown>,
  paramMap: Record<string, string> | undefined,
  warnings: SynthesisWarning[],
  blockId: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [v1Key, value] of Object.entries(rawParams)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      warnings.push({
        code: "non_numeric_module_param",
        message: `Module param "${v1Key}" wasn't a finite number; dropped.`,
        field: `params.${v1Key}`,
        blockId,
      });
      continue;
    }
    const v3Key = paramMap?.[v1Key] ?? v1Key;
    out[v3Key] = value;
  }
  return out;
}

function synthesizeGlobalParams(projectData: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  const shaderState = readObject(projectData, "shader");
  if (shaderState) {
    const shaderMix = shaderState.shaderMix;
    if (typeof shaderMix === "number" && Number.isFinite(shaderMix)) {
      out.effectStrength = shaderMix;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Evolution rules
// ---------------------------------------------------------------------------

function synthesizeEvolutionRules(
  artwork: Record<string, unknown>,
  warnings: SynthesisWarning[],
): EvolutionRuleConfig[] {
  const rules: EvolutionRuleConfig[] = [];

  // 1. From artistTemplate (a hand-curated default rule set).
  const artistTemplate = readString(artwork, "artistTemplate") ?? "static";
  const templateRulesFn = V1_TEMPLATE_TO_V3_EVOLUTION[artistTemplate];
  if (templateRulesFn) {
    rules.push(...templateRulesFn());
  } else if (artistTemplate !== "static") {
    warnings.push({
      code: "unknown_artist_template",
      message: `artistTemplate "${artistTemplate}" has no V3 evolution preset; skipped.`,
      field: "artwork.artistTemplate",
    });
  }

  // 2. From shader_modules[] — those modules whose mapping yields
  //    an evolution rule rather than a pass (e.g. color-evolution).
  const modules = readArray(artwork, "shader_modules");
  for (const mod of modules) {
    if (!mod || typeof mod !== "object") continue;
    const moduleObj = mod as Record<string, unknown>;
    const moduleId = readString(moduleObj, "id");
    if (!moduleId) continue;
    const mapping = V1_MODULE_TO_V3[moduleId];
    if (!mapping?.evolutionRule) continue;
    rules.push({
      param: mapping.evolutionRule.param,
      anchor: "install",
      cycleDurationHours: mapping.evolutionRule.cycleDurationHours,
      repeat: true,
      keyframes: [...mapping.evolutionRule.keyframes],
    });
  }

  return rules;
}

// ---------------------------------------------------------------------------
// Behaviour (action mappings → state-machine triggers)
// ---------------------------------------------------------------------------

interface V1ActionMappingDoc {
  id: string;
  enabled?: boolean;
  sensitivity?: "low" | "medium" | "high";
  cooldownMs?: number;
}

function synthesizeBehaviour(
  artwork: Record<string, unknown>,
  warnings: SynthesisWarning[],
): BehaviourModelConfig | undefined {
  const interactions = readObject(artwork, "interactions");
  if (!interactions) return undefined;
  const rawMappings = readArray(interactions, "actionMappings");
  if (rawMappings.length === 0) return undefined;

  const triggers: TriggerRule[] = [];
  const seenTriggerIds = new Set<string>();

  for (const raw of rawMappings) {
    if (!raw || typeof raw !== "object") continue;
    const obj = raw as Record<string, unknown>;
    const actionId = readString(obj, "id");
    if (!actionId) continue;
    if (obj.enabled === false) continue; // skip disabled mappings
    const mapping = V1_ACTION_TO_V3[actionId];
    if (!mapping) {
      warnings.push({
        code: "unknown_v1_action",
        message: `V1 action "${actionId}" has no V3 mapping; skipped.`,
        field: `artwork.interactions.actionMappings[].id=${actionId}`,
      });
      continue;
    }

    const action: V1ActionMappingDoc = {
      id: actionId,
      enabled: typeof obj.enabled === "boolean" ? obj.enabled : true,
      sensitivity: (obj.sensitivity === "low" || obj.sensitivity === "medium" || obj.sensitivity === "high")
        ? obj.sensitivity
        : undefined,
      cooldownMs: typeof obj.cooldownMs === "number" && Number.isFinite(obj.cooldownMs)
        ? obj.cooldownMs
        : undefined,
    };

    const triggerId = uniqueTriggerId(mapping.triggerId, seenTriggerIds);
    seenTriggerIds.add(triggerId);

    triggers.push({
      id: triggerId,
      when: mapping.buildWhen(action),
      then: [{ type: "enter_state", stateId: mapping.targetState }],
      ...(action.cooldownMs && action.cooldownMs > 0 ? { cooldownMs: action.cooldownMs } : {}),
    });
  }

  if (triggers.length === 0) return undefined;

  return {
    triggers,
    states: V1_DEFAULT_BEHAVIOUR_STATES.map((s): ArtworkStateConfig => ({ ...s })),
    fallbackStateId: V1_DEFAULT_BEHAVIOUR_FALLBACK_STATE,
  };
}

function uniqueTriggerId(preferred: string, seen: Set<string>): string {
  if (!seen.has(preferred)) return preferred;
  let i = 2;
  while (seen.has(`${preferred}-${i}`)) i++;
  return `${preferred}-${i}`;
}

// ---------------------------------------------------------------------------
// Continuous bindings (forward-compat — no production data has these yet)
// ---------------------------------------------------------------------------

interface V2ContinuousBinding {
  id: string;
  sourceId: string;
  signal: string;
  parameter: string;
  gain?: number;
  range?: [number, number];
  smoothing?: number;
  enabled?: boolean;
}

function synthesizeGestureBindings(
  artwork: Record<string, unknown>,
  warnings: SynthesisWarning[],
): GestureBindingConfig[] {
  const interactions = readObject(artwork, "interactions");
  if (!interactions) return [];
  const rawList = readArray(interactions, "continuousBindings");
  if (rawList.length === 0) return [];

  const out: GestureBindingConfig[] = [];
  const seenIds = new Set<string>();

  for (const raw of rawList) {
    if (!isContinuousBinding(raw)) continue;
    if (raw.enabled === false) continue;

    const v3Signal = SIGNAL_PAIR_MAP[`${raw.sourceId}:${raw.signal}`];
    if (!v3Signal) {
      warnings.push({
        code: "unmapped_binding_signal",
        message:
          `Binding "${raw.id}" uses signal source ${raw.sourceId}.${raw.signal} which has no V3 equivalent — skipped.`,
        field: `artwork.interactions.continuousBindings[${raw.id}]`,
      });
      continue;
    }

    const id = uniqueTriggerId(raw.id, seenIds);
    seenIds.add(id);

    const gain = typeof raw.gain === "number" && raw.gain > 0 ? raw.gain : 1;
    const inputRange: [number, number] = [0, 1 / gain];
    const outputRange: [number, number] = Array.isArray(raw.range)
      ? [raw.range[0], raw.range[1]]
      : [0, 1];

    out.push({
      id,
      signal: v3Signal,
      targetParam: raw.parameter,
      mapping: { inputRange, outputRange, curve: "linear" },
      smoothing: typeof raw.smoothing === "number" && raw.smoothing >= 0 && raw.smoothing <= 1
        ? raw.smoothing
        : 0,
    });
  }

  return out;
}

function isContinuousBinding(value: unknown): value is V2ContinuousBinding {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.sourceId === "string" &&
    typeof v.signal === "string" &&
    typeof v.parameter === "string"
  );
}

// ---------------------------------------------------------------------------
// Tiny readers — narrow unknown to typed access
// ---------------------------------------------------------------------------

function readString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

function readObject(obj: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const v = obj[key];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function readArray(obj: Record<string, unknown>, key: string): unknown[] {
  const v = obj[key];
  return Array.isArray(v) ? v : [];
}
