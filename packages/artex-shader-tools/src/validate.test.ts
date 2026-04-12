import { describe, expect, it } from "vitest";
import { validateShader } from "./validate.ts";

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
});
