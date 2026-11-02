import { describe, expect, it } from "vitest";
import { inferBuiltinShaderCapabilities } from "./shaderCapabilities";
import { BUILTIN_SHADER_REGISTRY } from "./builtinShaderLibrary";

const DECLARES_EVERYTHING = `
uniform float uAudioLevel;
uniform float uBassLevel;
uniform float uCameraLevel;
uniform float uProximity;
uniform sampler2D iChannel0;
uniform sampler2D uMask;
uniform int uFlowEnabled;
uniform float uFlowIntensity;
uniform int uUseStateBlending;
uniform sampler2D uStateA;
`;

describe("inferBuiltinShaderCapabilities (#5415)", () => {
  it("does not count a uniform the shader only declares", () => {
    const caps = inferBuiltinShaderCapabilities(`${DECLARES_EVERYTHING}
void main() { gl_FragColor = vec4(1.0); }`);
    expect(Object.values(caps).some(Boolean)).toBe(false);
  });

  it("counts a uniform the shader reads", () => {
    const caps = inferBuiltinShaderCapabilities(`${DECLARES_EVERYTHING}
vec2 artex_applyFlow(vec2 uv) { if (uFlowEnabled != 1) return uv; return uv * uFlowIntensity; }
void main() {
  vec4 a = texture2D(iChannel0, vec2(0.0));
  vec4 s = texture2D(uStateA, artex_applyFlow(vec2(0.0)));
  gl_FragColor = a + s * uCameraLevel * uAudioLevel * uProximity;
}`);
    expect(caps).toEqual({
      usesAudio: true,
      usesCamera: true,
      usesProximity: true,
      usesChannels: true,
      usesFlow: true,
      usesStates: true,
    });
  });

  it("ignores a read inside a comment", () => {
    const caps = inferBuiltinShaderCapabilities(`uniform float uCameraLevel;
// float c = uCameraLevel;
/* gl_FragColor *= uCameraLevel; */
void main() { gl_FragColor = vec4(1.0); }`);
    expect(caps.usesCamera).toBe(false);
  });

  it("matches a whole word, so a longer name is not a read", () => {
    const caps = inferBuiltinShaderCapabilities(`uniform sampler2D uState10;
void main() { gl_FragColor = texture2D(uState10, vec2(0.0)) * uProximityBias; }`);
    expect(caps.usesChannels).toBe(false);
    expect(caps.usesProximity).toBe(false);
  });

  it("tags only the built-ins that read the camera", () => {
    // Measured 2026-10-18: 39 of 41 built-ins DECLARE uCameraLevel; these
    // seven read it. A shader that starts reading it belongs on this list.
    const camera = BUILTIN_SHADER_REGISTRY
      .filter((shader) => shader.capabilities.usesCamera)
      .map((shader) => shader.id)
      .sort();
    expect(camera).toEqual([
      "artex-living-field",
      "filament-column-artex",
      "masterpiece-mesh-artex",
      "particula-artex",
      "primitive-intelligence-study-artex",
      "reactive-compute-splat-bloom-artex",
      "reeded-glass-portrait-artex",
    ]);
  });
});
