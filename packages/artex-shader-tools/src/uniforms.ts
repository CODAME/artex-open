/**
 * Canonical ARTEX uniform declarations and Shadertoy mapping tables.
 *
 * These are the single source of truth for what the ARTEX runtime injects
 * and how foreign shader formats map onto it.
 */

// ---------------------------------------------------------------------------
// ARTEX uniform catalogue
// ---------------------------------------------------------------------------

export interface ArtexUniform {
  name: string;
  type: string;
  category: "core" | "parameter" | "live-input" | "flow" | "state" | "mask";
  description: string;
}

export const ARTEX_UNIFORMS: readonly ArtexUniform[] = [
  // Core
  { name: "uTime",       type: "float",     category: "core",       description: "Seconds since playback start" },
  { name: "uResolution", type: "vec2",      category: "core",       description: "Canvas width × height in pixels" },
  { name: "uMood",       type: "float",     category: "core",       description: "Artist mood slider (0–1)" },
  { name: "iChannel0",   type: "sampler2D", category: "core",       description: "Primary artwork / video frame" },
  { name: "iChannel1",   type: "sampler2D", category: "core",       description: "State image 1 (optional)" },
  { name: "iChannel2",   type: "sampler2D", category: "core",       description: "State image 2 (optional)" },
  { name: "iChannel3",   type: "sampler2D", category: "core",       description: "State image 3 (optional)" },

  // Parameters
  { name: "uParam1", type: "float", category: "parameter", description: "User-adjustable knob 1 (0–2)" },
  { name: "uParam2", type: "float", category: "parameter", description: "User-adjustable knob 2 (0–2)" },
  { name: "uParam3", type: "float", category: "parameter", description: "User-adjustable knob 3 (0–2)" },
  { name: "uMix",    type: "float", category: "parameter", description: "Effect blend (0 = base, 1 = full effect)" },

  // Live inputs
  { name: "uAudioLevel",    type: "float", category: "live-input", description: "Overall audio amplitude (0–1)" },
  { name: "uBassLevel",     type: "float", category: "live-input", description: "Bass frequency amplitude (0–1)" },
  { name: "uTransientLevel",type: "float", category: "live-input", description: "Transient energy (0–1)" },
  { name: "uCameraLevel",   type: "float", category: "live-input", description: "Scene brightness from camera (0–1)" },
  { name: "uProximity",     type: "float", category: "live-input", description: "Viewer distance (0 = far, 1 = close)" },

  // Flow
  { name: "uFlowEnabled",   type: "int",   category: "flow", description: "Whether optical flow is active" },
  { name: "uFlowIntensity", type: "float", category: "flow", description: "Strength of flow displacement (0–1)" },
  { name: "uFlowSpeed",     type: "float", category: "flow", description: "Speed of flow field evolution (0–1)" },
  { name: "uFlowScale",     type: "float", category: "flow", description: "Spatial frequency of noise field (0–1)" },

  // State blending
  { name: "uUseStateBlending", type: "int",       category: "state", description: "Whether state images are loaded" },
  { name: "uStateA",           type: "sampler2D", category: "state", description: "State A image" },
  { name: "uStateB",           type: "sampler2D", category: "state", description: "State B image" },
  { name: "uStateC",           type: "sampler2D", category: "state", description: "State C image" },
  { name: "uStateD",           type: "sampler2D", category: "state", description: "State D image" },
  { name: "uBlendFactor",      type: "float",     category: "state", description: "Position across state sequence (0–1)" },
  { name: "uStateCount",       type: "int",       category: "state", description: "Number of loaded states (1–4)" },

  // Mask
  { name: "uMask",       type: "sampler2D", category: "mask", description: "Optional mask channel" },
  { name: "uMaskSource", type: "int",       category: "mask", description: "Source selector for the mask" },
] as const;

const ARTEX_UNIFORM_NAMES = new Set(ARTEX_UNIFORMS.map((u) => u.name));

export const isArtexUniform = (name: string): boolean => ARTEX_UNIFORM_NAMES.has(name);

// ---------------------------------------------------------------------------
// Shadertoy → ARTEX uniform mapping
// ---------------------------------------------------------------------------

export const SHADERTOY_UNIFORM_MAP: Record<string, string> = {
  iTime:           "uTime",
  iGlobalTime:     "uTime",
  iResolution:     "uResolution",
  iTimeDelta:      "uTime",      // no direct equivalent; map to uTime
  iMouse:          "uProximity",  // coarse approximation
  iFrame:          "uTime",      // no frame counter; approximate with time
};

/**
 * Shadertoy entry-point pattern.
 * `void mainImage( out vec4 fragColor, in vec2 fragCoord )`
 */
export const SHADERTOY_MAIN_RE =
  /void\s+mainImage\s*\(\s*out\s+vec4\s+(\w+)\s*,\s*in\s+vec2\s+(\w+)\s*\)/;

/**
 * Standard GLSL Sandbox entry-point pattern.
 * Uses `gl_FragColor` and `gl_FragCoord` directly but may use `uniform float time`.
 */
export const GLSL_SANDBOX_UNIFORM_MAP: Record<string, string> = {
  time:       "uTime",
  resolution: "uResolution",
  mouse:      "uProximity",
};
