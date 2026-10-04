import { describe, expect, it } from "vitest";
import { detectLegacyKind, synthesizeFromLegacy } from "./synthesizeFromLegacy";
import { validatePieceConfig } from "../v3/validation";

// ---------------------------------------------------------------------------
// detectLegacyKind
// ---------------------------------------------------------------------------

describe("detectLegacyKind", () => {
  it("returns v2-shader for null/undefined input", () => {
    expect(detectLegacyKind(null)).toBe("v2-shader");
    expect(detectLegacyKind(undefined)).toBe("v2-shader");
    expect(detectLegacyKind("not an object")).toBe("v2-shader");
    expect(detectLegacyKind(42)).toBe("v2-shader");
  });

  it("returns v3 when pieceConfigV3 is present", () => {
    expect(detectLegacyKind({ pieceConfigV3: { version: 3 } })).toBe("v3");
  });

  it("v3 wins when both V3 and v2 fields are populated", () => {
    expect(detectLegacyKind({ pieceConfigV3: { version: 3 }, rendererMode: "p5js" })).toBe("v3");
  });

  it("returns v2-p5 for rendererMode=p5js", () => {
    expect(detectLegacyKind({ rendererMode: "p5js" })).toBe("v2-p5");
  });

  it("returns v2-html for rendererMode=html", () => {
    expect(detectLegacyKind({ rendererMode: "html" })).toBe("v2-html");
  });

  it("returns v2-three for runtime.renderer=three-experimental", () => {
    expect(detectLegacyKind({ runtime: { renderer: "three-experimental" } })).toBe("v2-three");
  });

  it("returns plugin when touchDesigner import summary is present", () => {
    expect(detectLegacyKind({ touchDesigner: { manifestVersion: "td_artex_manifest_v0.1" } })).toBe("plugin");
  });

  it("returns v2-shader as the default branch", () => {
    expect(detectLegacyKind({ rendererMode: "webgl" })).toBe("v2-shader");
    expect(detectLegacyKind({ title: "no renderer mode", artworkId: "x" })).toBe("v2-shader");
  });

  it("ignores empty pieceConfigV3 (must be an object)", () => {
    expect(detectLegacyKind({ pieceConfigV3: "not an object" })).toBe("v2-shader");
    expect(detectLegacyKind({ pieceConfigV3: null })).toBe("v2-shader");
  });
});

// ---------------------------------------------------------------------------
// synthesizeFromLegacy — top-level dispatch
// ---------------------------------------------------------------------------

describe("synthesizeFromLegacy — top-level dispatch", () => {
  it("returns existing V3 config unchanged when input is already V3", () => {
    const v3Config = { version: 3, id: "x", title: "Existing V3", renderer: { primary: "shader" } };
    const result = synthesizeFromLegacy({ pieceConfigV3: v3Config });
    expect(result.kind).toBe("v3");
    expect(result.config).toBe(v3Config);
    expect(result.warnings).toEqual([]);
  });

  it("dispatches v2-p5 to the P5 synthesizer", () => {
    const result = synthesizeFromLegacy({
      rendererMode: "p5js",
      title: "P5 piece",
      artworkId: "p5-1",
      p5js: { sketchSource: "function setup(){}" },
    });
    expect(result.kind).toBe("v2-p5");
    expect(result.config.title).toBe("P5 piece");
    expect(result.config.composition?.[0]?.kind).toBe("sketch");
  });

  it("dispatches v2-html to the HTML synthesizer", () => {
    const result = synthesizeFromLegacy({
      rendererMode: "html",
      title: "HTML piece",
      html: { htmlSource: "<p>hi</p>" },
    });
    expect(result.kind).toBe("v2-html");
    expect(result.config.composition?.[0]?.kind).toBe("html");
  });

  it("dispatches v2-three to the scene placeholder synthesizer", () => {
    const result = synthesizeFromLegacy({
      runtime: { renderer: "three-experimental" },
      title: "3D piece",
    });
    expect(result.kind).toBe("v2-three");
    expect(result.config.composition?.[0]?.kind).toBe("scene");
    expect(result.warnings[0]?.code).toBe("scene_renderer_pending");
  });

  it("dispatches plugin to the plugin envelope synthesizer", () => {
    const result = synthesizeFromLegacy({
      touchDesigner: { manifestVersion: "td_artex_manifest_v0.1" },
    });
    expect(result.kind).toBe("plugin");
    expect(result.config.composition?.[0]?.kind).toBe("plugin");
  });
});

// ---------------------------------------------------------------------------
// synthesizeFromLegacy — v2-shader branch
// ---------------------------------------------------------------------------

describe("V1 synthesis — shader pass (envelope shape)", () => {
  // Helper: build a realistic V1 envelope. `artwork` is the parsed
  // config.json (ConfigJson); `projectData` is the parsed project.json
  // (ProjectPackageData). Either may be omitted.
  const v1Envelope = (overrides: { artwork?: Record<string, unknown>; projectData?: Record<string, unknown> } = {}) => ({
    artwork: {
      title: "Test Piece",
      artworkId: "test-1",
      rendererMode: "webgl",
      template: "none",
      artistTemplate: "static",
      shader_modules: [],
      interactions: { actionMappings: [] },
      ...overrides.artwork,
    },
    projectData: {
      version: 1,
      shader: { builtinShaderId: null, shaderParams: {}, shaderBlendMode: "normal" },
      ...overrides.projectData,
    },
  });

  it("maps projectData.shader.builtinShaderId 1:1 with params and blend mode", () => {
    const result = synthesizeFromLegacy(v1Envelope({
      projectData: {
        shader: {
          builtinShaderId: "pastel-wave-trails-artex",
          shaderParams: { intensity: 0.35, decay: 0.92, spread: 1.8 },
          shaderBlendMode: "screen",
        },
      },
    }));

    expect(result.kind).toBe("v2-shader");
    const passes = result.config.shaderStack?.passes ?? [];
    expect(passes).toHaveLength(1);
    expect(passes[0].id).toBe("primary");
    expect(passes[0].shaderId).toBe("pastel-wave-trails-artex");
    expect(passes[0].params).toEqual({ intensity: 0.35, decay: 0.92, spread: 1.8 });
    expect(passes[0].blendMode).toBe("screen");
  });

  it("preserves the artworkId from artwork.json", () => {
    const result = synthesizeFromLegacy(v1Envelope({ artwork: { artworkId: "my-id" } }));
    expect(result.config.id).toBe("my-id");
  });

  it("emits default_flow_synthesis warning when no shader id and no modules", () => {
    const result = synthesizeFromLegacy(v1Envelope());
    expect(result.warnings.find((w) => w.code === "default_flow_synthesis")).toBeDefined();
    // Falls back to a known V3 shader (per V1_TEMPLATE_TO_DEFAULT_SHADER)
    expect(result.config.shaderStack?.passes[0]?.shaderId).toBe("bumped-sinusoidal-warp-artex");
  });

  it("emits custom_shader_not_yet_converted (not default_flow_synthesis) when artwork carries a userShaderSource hint", () => {
    // The artist's piece had a custom GLSL shader the converter can't yet
    // translate. Don't claim "no shader on disk" — that's misleading and
    // erodes trust. Use the more accurate warning instead.
    const result = synthesizeFromLegacy(
      v1Envelope({ artwork: { userShaderSource: "// some GLSL" } }),
    );
    expect(result.warnings.find((w) => w.code === "default_flow_synthesis")).toBeUndefined();
    expect(result.warnings.find((w) => w.code === "custom_shader_not_yet_converted")).toBeDefined();
  });

  it("normalizes unknown blend modes to normal with a warning", () => {
    const result = synthesizeFromLegacy(v1Envelope({
      projectData: { shader: { builtinShaderId: "x", shaderBlendMode: "rumour-mill" } },
    }));
    expect(result.config.shaderStack?.passes[0]?.blendMode).toBe("normal");
    expect(result.warnings.find((w) => w.code === "unknown_blend_mode")).toBeDefined();
  });

  it("maps softlight blend mode to multiply with a fallback warning", () => {
    const result = synthesizeFromLegacy(v1Envelope({
      projectData: { shader: { builtinShaderId: "x", shaderBlendMode: "softlight" } },
    }));
    expect(result.config.shaderStack?.passes[0]?.blendMode).toBe("multiply");
    expect(result.warnings.find((w) => w.code === "blend_mode_fallback")).toBeDefined();
  });

  it("drops non-finite shader params and warns per param", () => {
    const result = synthesizeFromLegacy(v1Envelope({
      projectData: {
        shader: {
          builtinShaderId: "x",
          shaderParams: { good: 0.5, bad: Number.NaN, ugly: "string" as unknown as number },
        },
      },
    }));
    expect(result.config.shaderStack?.passes[0]?.params).toEqual({ good: 0.5 });
    expect(result.warnings.filter((w) => w.code === "non_numeric_shader_param")).toHaveLength(2);
  });

  it("maps shader.shaderMix into globalParams.effectStrength", () => {
    const result = synthesizeFromLegacy(v1Envelope({
      projectData: { shader: { builtinShaderId: "x", shaderMix: 0.65 } },
    }));
    expect(result.config.shaderStack?.globalParams?.effectStrength).toBe(0.65);
  });

  it("omits globalParams when shaderMix is absent", () => {
    const result = synthesizeFromLegacy(v1Envelope({
      projectData: { shader: { builtinShaderId: "x" } },
    }));
    expect(result.config.shaderStack?.globalParams).toBeUndefined();
  });

  it("synthesizes a config that validates cleanly", () => {
    const result = synthesizeFromLegacy(v1Envelope({
      projectData: { shader: { builtinShaderId: "x", shaderParams: { a: 1 } } },
    }));
    expect(() => { validatePieceConfig(result.config); }).not.toThrow();
  });

  it("uses a synthesized id when artworkId is missing", () => {
    const result = synthesizeFromLegacy(v1Envelope({ artwork: { artworkId: undefined } }));
    expect(result.config.id).toMatch(/^synthesized-v1-shader-/);
  });

  it("uses Untitled when title is missing or empty", () => {
    expect(synthesizeFromLegacy(v1Envelope({ artwork: { title: undefined } })).config.title).toBe("Untitled");
    expect(synthesizeFromLegacy(v1Envelope({ artwork: { title: "" } })).config.title).toBe("Untitled");
  });
});

describe("V1 synthesis — shader_modules → multi-pass shader-stack", () => {
  const withModules = (modules: { id: string; params?: Record<string, number> }[]) => ({
    artwork: {
      title: "Test",
      artworkId: "test",
      rendererMode: "webgl",
      shader_modules: modules,
      artistTemplate: "static",
      interactions: { actionMappings: [] },
    },
    projectData: { version: 1, shader: { builtinShaderId: null, shaderParams: {}, shaderBlendMode: "normal" } },
  });

  it("translates flow-distortion to bumped-sinusoidal-warp pass with remapped params", () => {
    const result = synthesizeFromLegacy(withModules([
      { id: "flow-distortion", params: { intensity: 0.4, speed: 0.1, scale: 5 } },
    ]));
    const passes = result.config.shaderStack?.passes ?? [];
    expect(passes).toHaveLength(1);
    expect(passes[0].id).toBe("v1-flow-distortion");
    expect(passes[0].shaderId).toBe("bumped-sinusoidal-warp-artex");
    // intensity → amplitude, speed → speed, scale → frequency
    expect(passes[0].params).toEqual({ amplitude: 0.4, speed: 0.1, frequency: 5 });
  });

  it("emits a banner for depth-parallax (no exact V3 equivalent)", () => {
    const result = synthesizeFromLegacy(withModules([
      { id: "depth-parallax", params: { depth: 0.2, speed: 0.05 } },
    ]));
    expect(result.warnings.find((w) => w.code === "synth_v1_module_inexact")).toBeDefined();
  });

  it("translates color-evolution to an evolution rule, not a shader pass", () => {
    const result = synthesizeFromLegacy(withModules([
      { id: "color-evolution", params: { speed: 0.02 } },
    ]));
    // No shader pass from color-evolution → default-flow fallback fires
    const passes = result.config.shaderStack?.passes ?? [];
    expect(passes[0]?.id).toBe("primary"); // default-flow fallback
    // Evolution rule emitted
    const rules = result.config.evolutionRules ?? [];
    expect(rules.find((r) => r.param === "paletteWarmth")).toBeDefined();
  });

  it("composes shader passes + evolution rules from a mixed module list", () => {
    const result = synthesizeFromLegacy(withModules([
      { id: "flow-distortion", params: { intensity: 0.3 } },
      { id: "color-evolution", params: {} },
      { id: "feedback", params: { decay: 0.85, intensity: 0.4 } },
    ]));
    const passes = result.config.shaderStack?.passes ?? [];
    // 2 passes (flow-distortion + feedback); color-evolution doesn't add a pass
    expect(passes.map((p) => p.id)).toEqual(["v1-flow-distortion", "v1-feedback"]);
    // 1 evolution rule (from color-evolution)
    const rules = result.config.evolutionRules ?? [];
    expect(rules).toHaveLength(1);
    expect(rules[0].param).toBe("paletteWarmth");
  });

  it("skips unknown module ids with a warning", () => {
    const result = synthesizeFromLegacy(withModules([
      { id: "rumour-mill", params: { x: 1 } },
    ]));
    expect(result.warnings.find((w) => w.code === "unknown_v1_module")).toBeDefined();
  });
});

describe("V1 synthesis — artistTemplate → evolution preset", () => {
  const withArtistTemplate = (artistTemplate: string) => ({
    artwork: {
      title: "Test",
      artworkId: "test",
      rendererMode: "webgl",
      shader_modules: [],
      artistTemplate,
      interactions: { actionMappings: [] },
    },
    projectData: { version: 1, shader: { builtinShaderId: "x", shaderParams: {}, shaderBlendMode: "normal" } },
  });

  it("static produces no evolution rules", () => {
    const result = synthesizeFromLegacy(withArtistTemplate("static"));
    expect(result.config.evolutionRules).toBeUndefined();
  });

  it("breathing produces a breathing-cycle evolution rule", () => {
    const result = synthesizeFromLegacy(withArtistTemplate("breathing"));
    const rules = result.config.evolutionRules ?? [];
    expect(rules).toHaveLength(1);
    expect(rules[0].param).toBe("amplitude");
  });

  it("seasonal produces a quarterly cycle on paletteWarmth", () => {
    const result = synthesizeFromLegacy(withArtistTemplate("seasonal"));
    const rules = result.config.evolutionRules ?? [];
    expect(rules[0].param).toBe("paletteWarmth");
    expect(rules[0].cycleDurationHours).toBeGreaterThan(24);
  });

  it("warns on unknown artistTemplate values", () => {
    const result = synthesizeFromLegacy(withArtistTemplate("imaginary-template"));
    expect(result.warnings.find((w) => w.code === "unknown_artist_template")).toBeDefined();
  });
});

describe("V1 synthesis — actionMappings → behaviour triggers", () => {
  const withActions = (actionMappings: { id: string; enabled?: boolean; sensitivity?: string }[]) => ({
    artwork: {
      title: "Test",
      artworkId: "test",
      rendererMode: "webgl",
      shader_modules: [],
      artistTemplate: "static",
      interactions: { actionMappings },
    },
    projectData: { version: 1, shader: { builtinShaderId: "x", shaderParams: {}, shaderBlendMode: "normal" } },
  });

  it("maps the 5 default V1 actions to V3 trigger rules", () => {
    const result = synthesizeFromLegacy(withActions([
      { id: "stop_open_palm", enabled: true, sensitivity: "medium" },
      { id: "exit_wave", enabled: true, sensitivity: "medium" },
      { id: "explosion_mouth_open", enabled: true, sensitivity: "low" },
      { id: "celebration_clap_sound", enabled: true, sensitivity: "high" },
      { id: "zoom_proximity", enabled: true, sensitivity: "medium" },
    ]));
    const triggers = result.config.behaviour?.triggers ?? [];
    expect(triggers.map((t) => t.id)).toEqual([
      "v1-stop-open-palm",
      "v1-exit-wave",
      "v1-explosion-mouth-open",
      "v1-celebration-clap-sound",
      "v1-zoom-proximity",
    ]);
  });

  it("skips disabled mappings", () => {
    const result = synthesizeFromLegacy(withActions([
      { id: "stop_open_palm", enabled: false },
      { id: "exit_wave", enabled: true },
    ]));
    const triggers = result.config.behaviour?.triggers ?? [];
    expect(triggers.map((t) => t.id)).toEqual(["v1-exit-wave"]);
  });

  it("warns on unknown action ids", () => {
    const result = synthesizeFromLegacy(withActions([
      { id: "unknown-action", enabled: true },
    ]));
    expect(result.warnings.find((w) => w.code === "unknown_v1_action")).toBeDefined();
  });

  it("emits no behaviour when no enabled actions", () => {
    const result = synthesizeFromLegacy(withActions([]));
    expect(result.config.behaviour).toBeUndefined();
  });

  it("emits the default 4-state machine when triggers are present", () => {
    const result = synthesizeFromLegacy(withActions([
      { id: "stop_open_palm", enabled: true, sensitivity: "medium" },
    ]));
    const states = result.config.behaviour?.states ?? [];
    expect(states.map((s) => s.id).sort()).toEqual(["aroused", "expressive", "idle", "paused"]);
    expect(result.config.behaviour?.fallbackStateId).toBe("idle");
  });
});

// ---------------------------------------------------------------------------
// synthesizeFromLegacy — gesture bindings (continuous → V3)
// ---------------------------------------------------------------------------

describe("v2-shader synthesis — continuous bindings", () => {
  function withBindings(bindings: unknown[]): unknown {
    return {
      title: "x",
      artworkId: "y",
      builtinShaderId: "shader",
      interactions: { continuousBindings: bindings },
    };
  }

  it("maps a camera/proximity binding to a V3 gestureBinding on the proximity signal", () => {
    const result = synthesizeFromLegacy(
      withBindings([
        {
          id: "prox-bloom",
          sourceId: "camera",
          signal: "proximity",
          parameter: "bloomAmount",
          range: [0.2, 1.4],
          smoothing: 0.4,
          enabled: true,
        },
      ]),
    );

    const bindings = result.config.gestureBindings ?? [];
    expect(bindings).toHaveLength(1);
    const binding = bindings[0];
    expect(binding.id).toBe("prox-bloom");
    expect(binding.signal).toBe("proximity");
    expect(binding.targetParam).toBe("bloomAmount");
    expect(binding.mapping.outputRange).toEqual([0.2, 1.4]);
    expect(binding.smoothing).toBe(0.4);
  });

  it("maps mic/level to sound_level and mic/peak to sound_peak", () => {
    const result = synthesizeFromLegacy(
      withBindings([
        { id: "lvl", sourceId: "mic", signal: "level", parameter: "u_x", enabled: true },
        { id: "pk", sourceId: "mic", signal: "peak", parameter: "u_y", enabled: true },
      ]),
    );
    const bindings = result.config.gestureBindings ?? [];
    const sigs = bindings.map((b) => b.signal);
    expect(sigs).toEqual(["sound_level", "sound_peak"]);
  });

  it("skips disabled bindings without warning", () => {
    const result = synthesizeFromLegacy(
      withBindings([
        {
          id: "off",
          sourceId: "camera",
          signal: "proximity",
          parameter: "x",
          enabled: false,
        },
      ]),
    );
    expect(result.config.gestureBindings).toBeUndefined();
    expect(result.warnings.filter((w) => w.code === "unmapped_binding_signal")).toEqual([]);
  });

  it("warns and skips bindings whose signal pair has no V3 mapping", () => {
    const result = synthesizeFromLegacy(
      withBindings([
        {
          id: "weird",
          sourceId: "weather",
          signal: "humidity",
          parameter: "x",
          enabled: true,
        },
      ]),
    );
    expect(result.config.gestureBindings).toBeUndefined();
    expect(result.warnings.find((w) => w.code === "unmapped_binding_signal")).toBeDefined();
  });

  it("expands gain into a stretched inputRange", () => {
    const result = synthesizeFromLegacy(
      withBindings([
        { id: "g", sourceId: "camera", signal: "proximity", parameter: "x", gain: 2, enabled: true },
      ]),
    );
    expect(result.config.gestureBindings?.[0]?.mapping.inputRange).toEqual([0, 0.5]);
  });

  it("defaults outputRange to [0,1] when v2 range is absent", () => {
    const result = synthesizeFromLegacy(
      withBindings([
        { id: "noRange", sourceId: "camera", signal: "proximity", parameter: "x", enabled: true },
      ]),
    );
    expect(result.config.gestureBindings?.[0]?.mapping.outputRange).toEqual([0, 1]);
  });

  it("ignores out-of-range smoothing values (defaults to 0)", () => {
    const result = synthesizeFromLegacy(
      withBindings([
        { id: "s", sourceId: "camera", signal: "proximity", parameter: "x", smoothing: 5, enabled: true },
      ]),
    );
    expect(result.config.gestureBindings?.[0]?.smoothing).toBe(0);
  });

  it("deduplicates colliding ids", () => {
    const result = synthesizeFromLegacy(
      withBindings([
        { id: "dupe", sourceId: "camera", signal: "proximity", parameter: "a", enabled: true },
        { id: "dupe", sourceId: "mic", signal: "level", parameter: "b", enabled: true },
      ]),
    );
    expect((result.config.gestureBindings ?? []).map((b) => b.id)).toEqual(["dupe", "dupe-2"]);
  });

  it("emits a config with bindings that validate cleanly", () => {
    const result = synthesizeFromLegacy(
      withBindings([
        { id: "ok", sourceId: "camera", signal: "proximity", parameter: "u_intensity", enabled: true },
      ]),
    );
    expect(() => { validatePieceConfig(result.config); }).not.toThrow();
  });

  it("ignores non-array continuousBindings", () => {
    const result = synthesizeFromLegacy({
      title: "x",
      builtinShaderId: "shader",
      interactions: { continuousBindings: "not an array" },
    });
    expect(result.config.gestureBindings).toBeUndefined();
  });

  it("ignores items with missing fields", () => {
    const result = synthesizeFromLegacy(
      withBindings([
        { id: "ok", sourceId: "camera", signal: "proximity", parameter: "x", enabled: true },
        { sourceId: "camera", signal: "proximity" }, // missing id + parameter
        { id: "no-source", parameter: "x" }, // missing sourceId + signal
      ]),
    );
    expect(result.config.gestureBindings).toHaveLength(1);
    expect(result.config.gestureBindings?.[0]?.id).toBe("ok");
  });
});
