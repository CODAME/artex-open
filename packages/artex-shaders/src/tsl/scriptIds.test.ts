import { describe, expect, it } from "vitest";
import { BUILTIN_SHADER_REGISTRY } from "../builtinShaderLibrary";
import { BUILTIN_TSL_GRAPHS_BY_ID } from "./index";
import { GLSL_TO_TSL_SCRIPT_ID, tslScriptIdForGlslShader } from "./scriptIds";

describe("GLSL_TO_TSL_SCRIPT_ID", () => {
  it("maps registered GLSL builtins to registered graphs, one graph each", () => {
    const glslIds = new Set(BUILTIN_SHADER_REGISTRY.map((shader) => shader.id));
    for (const [glslId, scriptId] of Object.entries(GLSL_TO_TSL_SCRIPT_ID)) {
      expect(glslIds.has(glslId), glslId).toBe(true);
      expect(BUILTIN_TSL_GRAPHS_BY_ID[scriptId], scriptId).toBeTypeOf("function");
    }
    const scriptIds = Object.values(GLSL_TO_TSL_SCRIPT_ID);
    expect(new Set(scriptIds).size).toBe(scriptIds.length);
  });

  it("lists the five measured ports", () => {
    expect(GLSL_TO_TSL_SCRIPT_ID).toEqual({
      "flower-sdf-artex": "flower-sdf-tsl",
      "reeded-glass-portrait-artex": "reeded-glass-tsl",
      "phone-chromatic-warp-artex": "phone-chromatic-warp-tsl",
      "phone-glitch-split-artex": "phone-glitch-split-tsl",
      "artex-living-field": "artex-living-field-tsl",
    });
  });
});

describe("tslScriptIdForGlslShader", () => {
  it("answers a ported id and nothing else", () => {
    expect(tslScriptIdForGlslShader("reeded-glass-portrait-artex")).toBe("reeded-glass-tsl");
    expect(tslScriptIdForGlslShader("kesson-voyage")).toBeNull();
    expect(tslScriptIdForGlslShader("toString")).toBeNull();
    expect(tslScriptIdForGlslShader(null)).toBeNull();
    expect(tslScriptIdForGlslShader("")).toBeNull();
  });
});
