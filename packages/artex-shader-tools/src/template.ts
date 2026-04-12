/**
 * Generate ARTEX-compatible GLSL starter templates.
 *
 * Produces ready-to-edit shader code with the correct uniforms, helpers,
 * and entry point for the requested capabilities.
 */

import {
  ARTEX_HASH_FN,
  ARTEX_NOISE_FN,
  ARTEX_APPLY_FLOW_FN,
  ARTEX_BLEND_STATES_FN,
  ARTEX_SAMPLE_MAIN_FN,
} from "./helpers.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GenerateTemplateOptions {
  /** Shader name for the header comment. */
  name?: string;
  /** Author for the license line. */
  author?: string;
  /** Include audio-reactive uniforms and sample code. */
  audio?: boolean;
  /** Include camera/proximity uniforms and sample code. */
  proximity?: boolean;
  /** Include flow distortion uniforms and artex_applyFlow helper. */
  flow?: boolean;
  /** Include state blending uniforms and artex_blendStates helper. */
  states?: boolean;
}

// ---------------------------------------------------------------------------
// Template assembly
// ---------------------------------------------------------------------------

const header = (name: string, author: string) =>
  `// ${name}
// Apache-2.0 — ${author}`;

const coreUniforms = () =>
  `uniform float     uTime;
uniform vec2      uResolution;
uniform float     uMood;
uniform float     uMix;
uniform float     uParam1;
uniform float     uParam2;
uniform float     uParam3;
uniform sampler2D iChannel0;`;

const audioUniforms = () =>
  `// Live audio inputs (0 when inactive)
uniform float uAudioLevel;
uniform float uBassLevel;
uniform float uTransientLevel;`;

const proximityUniforms = () =>
  `// Presence inputs (0 when inactive)
uniform float uCameraLevel;
uniform float uProximity;`;

const flowUniforms = () =>
  `// Flow field
uniform int   uFlowEnabled;
uniform float uFlowIntensity;
uniform float uFlowSpeed;
uniform float uFlowScale;`;

const stateUniforms = () =>
  `// State blending
uniform int       uUseStateBlending;
uniform sampler2D uStateA;
uniform sampler2D uStateB;
uniform sampler2D uStateC;
uniform sampler2D uStateD;
uniform float     uBlendFactor;
uniform int       uStateCount;`;

const mainBody = (opts: GenerateTemplateOptions) => {
  const usesFlow = opts.flow;
  const usesStates = opts.states;
  const usesAudio = opts.audio;
  const usesProximity = opts.proximity;

  // Determine how to sample the base texture
  let sampleLine: string;
  if (usesFlow && usesStates) {
    sampleLine = "  vec4 base = artex_sampleMain(uv);";
  } else if (usesFlow) {
    sampleLine = "  vec2 flowUv = artex_applyFlow(uv);\n  vec4 base = texture2D(iChannel0, flowUv);";
  } else if (usesStates) {
    sampleLine = "  vec4 base = artex_blendStates(uv);";
  } else {
    sampleLine = "  vec4 base = texture2D(iChannel0, uv);";
  }

  const effectLines: string[] = ["  vec3 color = base.rgb;", ""];

  if (usesAudio) {
    effectLines.push(
      "  // Audio-reactive: modulate brightness with bass",
      "  color += uBassLevel * 0.2 * uParam1;",
      "  // Flash on transients",
      "  color = mix(color, vec3(1.0), uTransientLevel * 0.15 * uParam2);",
      "",
    );
  }

  if (usesProximity) {
    effectLines.push(
      "  // Proximity glow",
      "  float dist = length(uv - 0.5);",
      "  float glow = smoothstep(0.5, 0.1, dist) * uProximity * uParam3;",
      "  color += glow * vec3(uMood, 0.4, 1.0 - uMood);",
      "",
    );
  }

  if (!usesAudio && !usesProximity) {
    effectLines.push(
      "  // Simple time-based hue shift",
      "  float shift = sin(uTime * 0.5 + uv.x * 3.14) * 0.1 * uParam1;",
      "  color.r += shift;",
      "  color.b -= shift;",
      "",
    );
  }

  return `void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

${sampleLine}
${effectLines.join("\n")}
  gl_FragColor = vec4(mix(base.rgb, color, uMix), base.a);
}`;
};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export const generateTemplate = (options: GenerateTemplateOptions = {}): string => {
  const {
    name = "My Shader ARTEX",
    author = "Your Name <you@example.com>",
    audio = false,
    proximity = false,
    flow = false,
    states = false,
  } = options;

  const sections: string[] = [
    header(name, author),
    "",
    "precision highp float;",
    "",
    coreUniforms(),
  ];

  if (audio)     sections.push("", audioUniforms());
  if (proximity)  sections.push("", proximityUniforms());
  if (flow)      sections.push("", flowUniforms());
  if (states)    sections.push("", stateUniforms());

  // Helper functions (only when needed)
  const helpers: string[] = [];
  if (flow || states) {
    helpers.push(ARTEX_HASH_FN, "", ARTEX_NOISE_FN);
  }
  if (flow)   helpers.push("", ARTEX_APPLY_FLOW_FN);
  if (states) helpers.push("", ARTEX_BLEND_STATES_FN);
  if (flow && states) helpers.push("", ARTEX_SAMPLE_MAIN_FN);

  if (helpers.length > 0) {
    sections.push("", "// --- ARTEX helpers ---", "", ...helpers);
  }

  sections.push("", mainBody({ name, author, audio, proximity, flow, states }));

  return sections.join("\n") + "\n";
};
