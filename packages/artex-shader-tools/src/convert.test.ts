import { describe, expect, it } from "vitest";
import { convertShader } from "./convert.ts";

const SHADERTOY_SHADER = `
void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
  vec2 uv = fragCoord / iResolution.xy;
  float t = sin(iTime * 2.0) * 0.5 + 0.5;
  fragColor = vec4(uv, t, 1.0);
}
`.trim();

const GLSL_SANDBOX_SHADER = `
uniform float time;
uniform vec2 resolution;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  gl_FragColor = vec4(uv, sin(time), 1.0);
}
`.trim();

const RAW_ARTEX_SHADER = `
precision highp float;
uniform float uTime;
uniform vec2  uResolution;
uniform sampler2D iChannel0;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  gl_FragColor = texture2D(iChannel0, uv);
}
`.trim();

describe("convertShader — format detection", () => {
  it("detects Shadertoy format from mainImage signature", () => {
    const result = convertShader(SHADERTOY_SHADER);
    expect(result.detectedFormat).toBe("shadertoy");
  });

  it("detects GLSL Sandbox format from time/resolution uniforms", () => {
    const result = convertShader(GLSL_SANDBOX_SHADER);
    expect(result.detectedFormat).toBe("glsl-sandbox");
  });

  it("detects raw format when no foreign patterns found", () => {
    const result = convertShader(RAW_ARTEX_SHADER);
    expect(result.detectedFormat).toBe("raw");
  });
});

describe("convertShader — Shadertoy conversion", () => {
  it("rewrites mainImage to void main", () => {
    const { glsl } = convertShader(SHADERTOY_SHADER);
    expect(glsl).toContain("void main()");
    expect(glsl).not.toContain("mainImage");
  });

  it("replaces fragColor with gl_FragColor", () => {
    const { glsl } = convertShader(SHADERTOY_SHADER);
    expect(glsl).toContain("gl_FragColor");
    expect(glsl).not.toMatch(/\bfragColor\b/);
  });

  it("replaces fragCoord with gl_FragCoord.xy", () => {
    const { glsl } = convertShader(SHADERTOY_SHADER);
    expect(glsl).toContain("gl_FragCoord.xy");
  });

  it("maps iTime to uTime", () => {
    const { glsl } = convertShader(SHADERTOY_SHADER);
    expect(glsl).toContain("uTime");
    expect(glsl).not.toMatch(/\biTime\b/);
  });

  it("maps iResolution.xy to uResolution", () => {
    const { glsl } = convertShader(SHADERTOY_SHADER);
    expect(glsl).toContain("uResolution");
    expect(glsl).not.toMatch(/\biResolution\b/);
  });

  it("adds precision header when missing", () => {
    const { glsl } = convertShader(SHADERTOY_SHADER);
    expect(glsl).toMatch(/^precision highp float;/);
  });

  it("auto-declares referenced ARTEX uniforms", () => {
    const { glsl, addedUniforms } = convertShader(SHADERTOY_SHADER);
    expect(glsl).toContain("uniform float uTime;");
    expect(glsl).toContain("uniform vec2 uResolution;");
    expect(addedUniforms.length).toBeGreaterThan(0);
  });
});

describe("convertShader — GLSL Sandbox conversion", () => {
  it("maps time to uTime and resolution to uResolution", () => {
    const { glsl } = convertShader(GLSL_SANDBOX_SHADER);
    expect(glsl).toContain("uTime");
    expect(glsl).toContain("uResolution");
    expect(glsl).not.toMatch(/\btime\b(?!\s*;)/); // allow in uniform declaration replacement
  });
});

describe("convertShader — texture fixup", () => {
  it("replaces texture() with texture2D()", () => {
    const source = `
void main() {
  gl_FragColor = texture(iChannel0, gl_FragCoord.xy / uResolution);
}`.trim();
    const { glsl } = convertShader(source, { format: "raw" });
    expect(glsl).toContain("texture2D(");
    expect(glsl).not.toMatch(/\btexture\s*\(/);
  });
});

describe("convertShader — options", () => {
  it("skips precision when addPrecision is false", () => {
    const { glsl } = convertShader(SHADERTOY_SHADER, { addPrecision: false });
    expect(glsl).not.toMatch(/^precision/);
  });

  it("skips uniform declaration when declareUniforms is false", () => {
    const { addedUniforms } = convertShader(SHADERTOY_SHADER, { declareUniforms: false });
    expect(addedUniforms).toHaveLength(0);
  });

  it("respects explicit format override", () => {
    const { detectedFormat } = convertShader(SHADERTOY_SHADER, { format: "raw" });
    expect(detectedFormat).toBe("raw");
  });
});

describe("convertShader — WebGL2 target", () => {
  it("defaults to webgl1 when no targetVersion is provided", () => {
    const { targetVersion } = convertShader(RAW_ARTEX_SHADER);
    expect(targetVersion).toBe("webgl1");
  });

  it("returns webgl2 targetVersion when requested", () => {
    const { targetVersion } = convertShader(RAW_ARTEX_SHADER, { targetVersion: "webgl2" });
    expect(targetVersion).toBe("webgl2");
  });

  it("prepends #version 300 es for webgl2", () => {
    const { glsl } = convertShader(RAW_ARTEX_SHADER, { targetVersion: "webgl2" });
    expect(glsl).toMatch(/^#version 300 es/);
  });

  it("declares an `out vec4 artexFragColor` in webgl2 output", () => {
    const { glsl } = convertShader(RAW_ARTEX_SHADER, { targetVersion: "webgl2" });
    expect(glsl).toContain("out vec4 artexFragColor;");
  });

  it("rewrites texture2D to texture in webgl2", () => {
    const { glsl } = convertShader(RAW_ARTEX_SHADER, { targetVersion: "webgl2" });
    expect(glsl).not.toMatch(/\btexture2D\s*\(/);
    expect(glsl).toMatch(/\btexture\s*\(/);
  });

  it("rewrites gl_FragColor to artexFragColor in webgl2", () => {
    const { glsl } = convertShader(RAW_ARTEX_SHADER, { targetVersion: "webgl2" });
    expect(glsl).not.toMatch(/\bgl_FragColor\b/);
    expect(glsl).toContain("artexFragColor");
  });

  it("rewrites `varying` to `in` in webgl2", () => {
    const source = `
precision highp float;
varying vec2 vUv;
uniform sampler2D iChannel0;
void main() { gl_FragColor = texture2D(iChannel0, vUv); }
`.trim();
    const { glsl } = convertShader(source, { targetVersion: "webgl2" });
    expect(glsl).toMatch(/\bin\s+vec2\s+vUv\b/);
    expect(glsl).not.toMatch(/\bvarying\b/);
  });

  it("drops an existing #version line before re-prepending for webgl2", () => {
    const source = `#version 100\nprecision highp float;\nvoid main() { gl_FragColor = vec4(1.0); }`;
    const { glsl } = convertShader(source, { targetVersion: "webgl2", declareUniforms: false });
    // Only one #version line, and it is the ES 3.0 one.
    const versionMatches = glsl.match(/#version/g) ?? [];
    expect(versionMatches).toHaveLength(1);
    expect(glsl).toMatch(/^#version 300 es/);
  });
});
