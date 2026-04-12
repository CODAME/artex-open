/**
 * Suggest shaders from the ARTEX builtin library based on requirements.
 *
 * Scores each builtin shader against the caller's criteria (capabilities,
 * mood, template) and returns a ranked list.
 */

import {
  BUILTIN_SHADER_LIBRARY_ITEMS,
  type BuiltinShaderLibraryItem,
} from "@artex/shaders";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ArtistTemplate =
  | "static"
  | "breathing"
  | "flowing"
  | "seasonal"
  | "presence"
  | "dream";

export interface SuggestShadersOptions {
  /** Required capabilities the shader must support. */
  requiredCapabilities?: ("audio" | "camera" | "proximity" | "flow" | "states" | "channels")[];
  /** Preferred capabilities (boost score but don't filter). */
  preferredCapabilities?: ("audio" | "camera" | "proximity" | "flow" | "states" | "channels")[];
  /** Artist mood value (0–1). High mood favours energetic shaders. */
  mood?: number;
  /** Artist template for the experience. */
  template?: ArtistTemplate;
  /** Maximum number of suggestions to return. Default 5. */
  limit?: number;
}

export interface ShaderSuggestion {
  shader: BuiltinShaderLibraryItem;
  score: number;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Template → keyword affinity tables
// ---------------------------------------------------------------------------

const TEMPLATE_POSITIVE_KEYWORDS: Record<ArtistTemplate, string[]> = {
  static:    ["simple", "surface", "field", "column"],
  breathing: ["wave", "breath", "pulse", "bloom", "trail"],
  flowing:   ["flow", "wave", "drift", "trail", "motion", "warp"],
  seasonal:  ["flora", "petal", "bloom", "botanical", "poppy", "dust"],
  presence:  ["proximity", "reactive", "glow", "aura", "intelligence"],
  dream:     ["fractal", "spiral", "tunnel", "voyage", "apparition", "ghost"],
};

const TEMPLATE_CAPABILITY_AFFINITY: Partial<Record<ArtistTemplate, string[]>> = {
  breathing: ["audio"],
  flowing:   ["flow"],
  presence:  ["proximity", "camera"],
  dream:     ["states"],
};

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

type CapKey = "audio" | "camera" | "proximity" | "flow" | "states" | "channels";

const capabilityField = (cap: CapKey): keyof BuiltinShaderLibraryItem["capabilities"] => {
  const map: Record<CapKey, keyof BuiltinShaderLibraryItem["capabilities"]> = {
    audio: "usesAudio",
    camera: "usesCamera",
    proximity: "usesProximity",
    flow: "usesFlow",
    states: "usesStates",
    channels: "usesChannels",
  };
  return map[cap];
};

const scoreShader = (
  shader: BuiltinShaderLibraryItem,
  options: SuggestShadersOptions,
): { score: number; reasons: string[] } => {
  let score = 0;
  const reasons: string[] = [];
  const caps = shader.capabilities;
  const desc = `${shader.label} ${shader.description}`.toLowerCase();

  // Required capabilities: must-have (heavy penalty if missing)
  for (const req of options.requiredCapabilities ?? []) {
    if (caps[capabilityField(req)]) {
      score += 10;
      reasons.push(`has required capability: ${req}`);
    } else {
      score -= 50;
      reasons.push(`missing required capability: ${req}`);
    }
  }

  // Preferred capabilities: bonus
  for (const pref of options.preferredCapabilities ?? []) {
    if (caps[capabilityField(pref)]) {
      score += 5;
      reasons.push(`has preferred capability: ${pref}`);
    }
  }

  // Template keyword matching
  if (options.template) {
    const keywords = TEMPLATE_POSITIVE_KEYWORDS[options.template] ?? [];
    for (const kw of keywords) {
      if (desc.includes(kw)) {
        score += 3;
        reasons.push(`matches template keyword: "${kw}"`);
      }
    }

    // Template capability affinity
    const affinities = TEMPLATE_CAPABILITY_AFFINITY[options.template] ?? [];
    for (const cap of affinities) {
      if (caps[capabilityField(cap as CapKey)]) {
        score += 4;
        reasons.push(`matches template capability affinity: ${cap}`);
      }
    }
  }

  // Mood scoring: high mood → energetic shaders (audio, flow, motion keywords)
  if (options.mood !== undefined) {
    if (options.mood > 0.6) {
      const energeticKeywords = ["electric", "neon", "motion", "spiral", "reactive", "splat"];
      for (const kw of energeticKeywords) {
        if (desc.includes(kw)) {
          score += 2;
          reasons.push(`high-mood match: "${kw}"`);
        }
      }
      if (caps.usesAudio) {
        score += 2;
        reasons.push("high-mood: audio-reactive");
      }
    } else if (options.mood < 0.3) {
      const calmKeywords = ["soft", "pastel", "gentle", "drift", "veil", "flora", "dust"];
      for (const kw of calmKeywords) {
        if (desc.includes(kw)) {
          score += 2;
          reasons.push(`low-mood match: "${kw}"`);
        }
      }
    }
  }

  return { score, reasons };
};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export const suggestShaders = (options: SuggestShadersOptions = {}): ShaderSuggestion[] => {
  const { limit = 5 } = options;

  const scored = BUILTIN_SHADER_LIBRARY_ITEMS.map((shader) => {
    const { score, reasons } = scoreShader(shader, options);
    return { shader, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
};
