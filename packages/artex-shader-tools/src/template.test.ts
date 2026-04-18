import { describe, expect, it } from "vitest";
import { generateTemplate } from "./template.ts";

describe("generateTemplate", () => {
  it("generates a valid minimal shader", () => {
    const glsl = generateTemplate();
    expect(glsl).toContain("precision highp float;");
    expect(glsl).toContain("void main()");
    expect(glsl).toContain("gl_FragColor");
    expect(glsl).toMatch(/uniform\s+float\s+uTime;/);
    expect(glsl).toMatch(/uniform\s+sampler2D\s+iChannel0;/);
  });

  it("includes name and author in header", () => {
    const glsl = generateTemplate({ name: "Test Shader", author: "Tester" });
    expect(glsl).toContain("// Test Shader");
    expect(glsl).toContain("Tester");
  });

  it("adds audio uniforms when audio is enabled", () => {
    const glsl = generateTemplate({ audio: true });
    expect(glsl).toContain("uniform float uAudioLevel;");
    expect(glsl).toContain("uniform float uBassLevel;");
    expect(glsl).toContain("uniform float uTransientLevel;");
    expect(glsl).toContain("uBassLevel");
  });

  it("adds proximity uniforms when proximity is enabled", () => {
    const glsl = generateTemplate({ proximity: true });
    expect(glsl).toContain("uniform float uProximity;");
    expect(glsl).toContain("uniform float uCameraLevel;");
  });

  it("adds flow uniforms and helper when flow is enabled", () => {
    const glsl = generateTemplate({ flow: true });
    expect(glsl).toContain("uniform int   uFlowEnabled;");
    expect(glsl).toContain("artex_applyFlow");
    expect(glsl).toContain("artex_hash");
    expect(glsl).toContain("artex_noise");
  });

  it("adds state blending uniforms and helper when states is enabled", () => {
    const glsl = generateTemplate({ states: true });
    expect(glsl).toContain("uniform int       uUseStateBlending;");
    expect(glsl).toContain("artex_blendStates");
  });

  it("uses artex_sampleMain when both flow and states are enabled", () => {
    const glsl = generateTemplate({ flow: true, states: true });
    expect(glsl).toContain("artex_sampleMain");
  });

  it("does not include flow helpers when flow is not requested", () => {
    const glsl = generateTemplate();
    expect(glsl).not.toContain("artex_applyFlow");
    expect(glsl).not.toContain("artex_hash");
  });

  it("emits a resolution zero-guard in main() so UVs never divide by zero", () => {
    const glsl = generateTemplate();
    expect(glsl).toMatch(/max\s*\(\s*uResolution\s*,\s*vec2\s*\(\s*1\.0\s*\)\s*\)/);
    expect(glsl).toMatch(/gl_FragCoord\.xy\s*\/\s*res/);
  });

  it("guarded template never directly divides by uResolution", () => {
    const glsl = generateTemplate({ audio: true, flow: true, states: true });
    expect(glsl).not.toMatch(/gl_FragCoord\.xy\s*\/\s*uResolution/);
  });
});
