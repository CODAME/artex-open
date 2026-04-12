import { describe, expect, it } from "vitest";
import { BUILTIN_SHADER_LIBRARY_ITEMS } from "./builtinShaderLibrary.ts";

describe("builtin shader library — integrity", () => {
  it("loads at least one shader", () => {
    expect(BUILTIN_SHADER_LIBRARY_ITEMS.length).toBeGreaterThan(0);
  });

  it("every shader has a non-empty id", () => {
    for (const shader of BUILTIN_SHADER_LIBRARY_ITEMS) {
      expect(shader.id, `shader "${shader.label}" has empty id`).toBeTruthy();
    }
  });

  it("every shader has a non-empty label", () => {
    for (const shader of BUILTIN_SHADER_LIBRARY_ITEMS) {
      expect(shader.label, `shader "${shader.id}" has empty label`).toBeTruthy();
    }
  });

  it("every shader has non-empty GLSL source", () => {
    for (const shader of BUILTIN_SHADER_LIBRARY_ITEMS) {
      expect(shader.source.length, `shader "${shader.id}" has empty source`).toBeGreaterThan(0);
    }
  });

  it("every shader has a description", () => {
    for (const shader of BUILTIN_SHADER_LIBRARY_ITEMS) {
      expect(shader.description, `shader "${shader.id}" missing description`).toBeTruthy();
    }
  });

  it("every shader has at least one tag", () => {
    for (const shader of BUILTIN_SHADER_LIBRARY_ITEMS) {
      expect(shader.tags.length, `shader "${shader.id}" has no tags`).toBeGreaterThan(0);
    }
  });
});

describe("builtin shader library — uniqueness", () => {
  it("has no duplicate shader ids", () => {
    const ids = BUILTIN_SHADER_LIBRARY_ITEMS.map((s) => s.id);
    const unique = new Set(ids);
    const dupes = ids.filter((id) => {
      if (unique.has(id)) { unique.delete(id); return false; }
      return true;
    });
    expect(dupes, `Duplicate shader ids: ${dupes.join(", ")}`).toHaveLength(0);
  });

  it("has no duplicate filenames", () => {
    const filenames = BUILTIN_SHADER_LIBRARY_ITEMS.map((s) => s.filename);
    expect(new Set(filenames).size).toBe(filenames.length);
  });
});

describe("builtin shader library — GLSL structural checks", () => {
  it("every shader source contains void main()", () => {
    for (const shader of BUILTIN_SHADER_LIBRARY_ITEMS) {
      expect(
        /void\s+main\s*\(/.test(shader.source),
        `shader "${shader.id}" is missing void main()`,
      ).toBe(true);
    }
  });

  it("every shader source writes to gl_FragColor", () => {
    for (const shader of BUILTIN_SHADER_LIBRARY_ITEMS) {
      expect(
        /gl_FragColor\s*=/.test(shader.source),
        `shader "${shader.id}" never assigns gl_FragColor`,
      ).toBe(true);
    }
  });
});

describe("builtin shader library — capability detection", () => {
  it("shaders declaring uAudioLevel are tagged Audio", () => {
    for (const shader of BUILTIN_SHADER_LIBRARY_ITEMS) {
      if (/\buAudioLevel\b/i.test(shader.source) || /\buBassLevel\b/i.test(shader.source)) {
        expect(
          shader.capabilities.usesAudio,
          `shader "${shader.id}" uses audio uniforms but usesAudio is false`,
        ).toBe(true);
      }
    }
  });

  it("shaders declaring uFlowEnabled are tagged Flow", () => {
    for (const shader of BUILTIN_SHADER_LIBRARY_ITEMS) {
      if (/\buFlowEnabled\b/i.test(shader.source)) {
        expect(
          shader.capabilities.usesFlow,
          `shader "${shader.id}" uses flow uniforms but usesFlow is false`,
        ).toBe(true);
      }
    }
  });

  it("shaders declaring uUseStateBlending are tagged States", () => {
    for (const shader of BUILTIN_SHADER_LIBRARY_ITEMS) {
      if (/\buUseStateBlending\b/i.test(shader.source)) {
        expect(
          shader.capabilities.usesStates,
          `shader "${shader.id}" uses state uniforms but usesStates is false`,
        ).toBe(true);
      }
    }
  });

  it("shaders with no live-input or feature uniforms are tagged Simple", () => {
    for (const shader of BUILTIN_SHADER_LIBRARY_ITEMS) {
      const caps = shader.capabilities;
      const hasAny = caps.usesAudio || caps.usesCamera || caps.usesProximity
        || caps.usesChannels || caps.usesFlow || caps.usesStates;
      if (!hasAny) {
        expect(shader.tags).toContain("Simple");
      }
    }
  });
});
