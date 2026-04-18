import { describe, expect, it } from "vitest";
import { validateShader, stripComments } from "./validate.ts";

const VALID_SHADER = `
precision highp float;
uniform float uTime;
uniform vec2  uResolution;
uniform sampler2D iChannel0;
uniform float uAudioLevel;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec4 base = texture2D(iChannel0, uv);
  gl_FragColor = base + uAudioLevel * 0.1;
}
`.trim();

describe("validateShader — valid shaders", () => {
  it("passes a correct ARTEX shader with no errors", () => {
    const result = validateShader(VALID_SHADER);
    expect(result.valid).toBe(true);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  it("detects audio capability from uAudioLevel", () => {
    const { capabilities } = validateShader(VALID_SHADER);
    expect(capabilities.usesAudio).toBe(true);
    expect(capabilities.usesCamera).toBe(false);
  });

  it("detects channel usage from iChannel0", () => {
    const { capabilities } = validateShader(VALID_SHADER);
    expect(capabilities.usesChannels).toBe(true);
  });
});

describe("validateShader — error detection", () => {
  it("flags missing void main()", () => {
    const result = validateShader("precision highp float;\ngl_FragColor = vec4(1.0);");
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: "error", message: expect.stringContaining("void main()") }),
    );
  });

  it("flags missing gl_FragColor assignment", () => {
    const result = validateShader("precision highp float;\nvoid main() { vec4 c = vec4(1.0); }");
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: "error", message: expect.stringContaining("gl_FragColor") }),
    );
  });

  it("flags wrong uniform type", () => {
    const source = `
precision highp float;
uniform int uTime;
void main() { gl_FragColor = vec4(float(uTime)); }
`.trim();
    const result = validateShader(source);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        message: expect.stringContaining("uTime"),
      }),
    );
  });
});

describe("validateShader — warnings", () => {
  it("warns about missing precision", () => {
    const source = "uniform float uTime;\nvoid main() { gl_FragColor = vec4(uTime); }";
    const result = validateShader(source);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: "warning", message: expect.stringContaining("precision") }),
    );
  });

  it("warns about Shadertoy remnants", () => {
    const source = `
precision highp float;
void main() { gl_FragColor = vec4(sin(iTime)); }
`.trim();
    const result = validateShader(source);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: "warning", message: expect.stringContaining("iTime") }),
    );
  });

  it("warns about used but undeclared ARTEX uniforms", () => {
    const source = `
precision highp float;
void main() { gl_FragColor = vec4(uProximity); }
`.trim();
    const result = validateShader(source);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: "warning", message: expect.stringContaining("uProximity") }),
    );
  });
});

describe("validateShader — capability detection", () => {
  it("detects flow capability", () => {
    const source = `
precision highp float;
uniform int uFlowEnabled;
uniform float uFlowIntensity;
void main() { gl_FragColor = vec4(float(uFlowEnabled), uFlowIntensity, 0.0, 1.0); }
`.trim();
    const { capabilities } = validateShader(source);
    expect(capabilities.usesFlow).toBe(true);
  });

  it("detects state blending capability", () => {
    const source = `
precision highp float;
uniform int uUseStateBlending;
uniform sampler2D uStateA;
void main() { gl_FragColor = texture2D(uStateA, vec2(0.0)); }
`.trim();
    const { capabilities } = validateShader(source);
    expect(capabilities.usesStates).toBe(true);
  });

  it("ignores uniform mentions inside line comments", () => {
    const source = `
precision highp float;
// This shader mentions uAudioLevel in a comment but never uses it
uniform sampler2D iChannel0;
void main() { gl_FragColor = texture2D(iChannel0, vec2(0.0)); }
`.trim();
    const { capabilities } = validateShader(source);
    expect(capabilities.usesAudio).toBe(false);
  });

  it("ignores uniform mentions inside block comments", () => {
    const source = `
precision highp float;
/* Docs: see also uProximity and uCameraLevel for live-input patterns */
uniform sampler2D iChannel0;
void main() { gl_FragColor = texture2D(iChannel0, vec2(0.0)); }
`.trim();
    const { capabilities } = validateShader(source);
    expect(capabilities.usesProximity).toBe(false);
    expect(capabilities.usesCamera).toBe(false);
  });
});

describe("validateShader — resolution guard", () => {
  it("warns when dividing by uResolution without a guard", () => {
    const source = `
precision highp float;
uniform vec2 uResolution;
uniform sampler2D iChannel0;
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  gl_FragColor = texture2D(iChannel0, uv);
}
`.trim();
    const result = validateShader(source);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        message: expect.stringContaining("uResolution"),
      }),
    );
  });

  it("accepts max(uResolution, vec2(1.0)) as a zero-guard", () => {
    const source = `
precision highp float;
uniform vec2 uResolution;
uniform sampler2D iChannel0;
void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 uv = gl_FragCoord.xy / res;
  gl_FragColor = texture2D(iChannel0, uv);
}
`.trim();
    const result = validateShader(source);
    const hasGuardWarning = result.diagnostics.some((d) =>
      d.severity === "warning" && d.message.includes("zero-guard"),
    );
    expect(hasGuardWarning).toBe(false);
  });

  it("accepts artex_safeResolution() as a zero-guard", () => {
    const source = `
precision highp float;
uniform vec2 uResolution;
uniform sampler2D iChannel0;
vec2 artex_safeResolution() { return max(uResolution, vec2(1.0)); }
void main() {
  vec2 uv = gl_FragCoord.xy / artex_safeResolution();
  gl_FragColor = texture2D(iChannel0, uv);
}
`.trim();
    const result = validateShader(source);
    const hasGuardWarning = result.diagnostics.some((d) =>
      d.severity === "warning" && d.message.includes("zero-guard"),
    );
    expect(hasGuardWarning).toBe(false);
  });

  it("does not fire when shader never divides by uResolution", () => {
    const source = `
precision highp float;
uniform sampler2D iChannel0;
void main() { gl_FragColor = texture2D(iChannel0, vec2(0.5)); }
`.trim();
    const result = validateShader(source);
    const hasGuardWarning = result.diagnostics.some((d) =>
      d.severity === "warning" && d.message.includes("zero-guard"),
    );
    expect(hasGuardWarning).toBe(false);
  });
});

describe("validateShader — deep uniform branching", () => {
  it("flags functions with >3 uniform-conditioned if branches", () => {
    const source = `
precision highp float;
uniform int uMode;
uniform sampler2D iChannel0;

vec4 branchy(vec2 uv) {
  if (uMode == 0) return vec4(1.0, 0.0, 0.0, 1.0);
  if (uMode == 1) return vec4(0.0, 1.0, 0.0, 1.0);
  if (uMode == 2) return vec4(0.0, 0.0, 1.0, 1.0);
  if (uMode == 3) return vec4(1.0, 1.0, 0.0, 1.0);
  return texture2D(iChannel0, uv);
}

void main() { gl_FragColor = branchy(vec2(0.5)); }
`.trim();
    const result = validateShader(source);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "info",
        message: expect.stringContaining("branchy"),
      }),
    );
  });

  it("does not flag functions with 3 or fewer uniform branches", () => {
    const source = `
precision highp float;
uniform int uMode;
vec4 modest(vec2 uv) {
  if (uMode == 0) return vec4(1.0);
  if (uMode == 1) return vec4(0.5);
  return vec4(0.0);
}
void main() { gl_FragColor = modest(vec2(0.5)); }
`.trim();
    const result = validateShader(source);
    const hasBranchInfo = result.diagnostics.some((d) =>
      d.severity === "info" && d.message.includes("modest"),
    );
    expect(hasBranchInfo).toBe(false);
  });
});

describe("stripComments helper", () => {
  it("removes line comments", () => {
    const input = "uniform float uTime; // seconds since start\n";
    const out = stripComments(input);
    expect(out).not.toContain("seconds since start");
    expect(out).toContain("uniform float uTime;");
  });

  it("removes block comments", () => {
    const input = "/* block comment */\nuniform float uTime;\n";
    const out = stripComments(input);
    expect(out).not.toContain("block comment");
    expect(out).toContain("uniform float uTime;");
  });

  it("preserves line count when removing block comments", () => {
    const input = "line1\n/* multi\nline\ncomment */\nline5\n";
    const out = stripComments(input);
    expect(out.split("\n").length).toBe(input.split("\n").length);
  });

  it("does not remove content inside strings (no GLSL strings anyway)", () => {
    const input = "uniform float uTime; uniform vec2 uResolution;";
    const out = stripComments(input);
    expect(out).toBe(input);
  });
});
