import { describe, expect, it } from "vitest";
import {
  synthesizeFromPlugin,
  synthesizeFromV2Html,
  synthesizeFromV2P5,
  synthesizeFromV2Three,
} from "./synthesizeFromV2NonShader";
import { validatePieceConfig } from "../v3/validation";

// ---------------------------------------------------------------------------
// P5
// ---------------------------------------------------------------------------

describe("synthesizeFromV2P5", () => {
  it("wraps the sketch source in an inline sketch block", () => {
    const result = synthesizeFromV2P5({
      title: "Drift",
      artworkId: "drift-1",
      p5js: { sketchSource: "function setup(){ createCanvas(400,400); }" },
    });

    expect(result.config.composition).toHaveLength(1);
    const block = result.config.composition?.[0];
    expect(block?.kind).toBe("sketch");
    if (block?.kind === "sketch") {
      expect(block.config.source.kind).toBe("inline");
      if (block.config.source.kind === "inline") {
        expect(block.config.source.code).toContain("createCanvas");
      }
    }
    expect(result.warnings).toEqual([]);
  });

  it("warns + emits a placeholder when sketch source is missing", () => {
    const result = synthesizeFromV2P5({ title: "Empty P5" });
    expect(result.warnings.find((w) => w.code === "missing_p5_source")).toBeDefined();
    expect(result.config.composition).toHaveLength(1);
    expect(result.config.composition?.[0]?.kind).toBe("sketch");
  });

  it("warns when sketchSource is empty string", () => {
    const result = synthesizeFromV2P5({ p5js: { sketchSource: "" } });
    expect(result.warnings.find((w) => w.code === "missing_p5_source")).toBeDefined();
  });

  it("warns on createCapture(VIDEO)", () => {
    const result = synthesizeFromV2P5({
      p5js: { sketchSource: "function setup(){ createCapture(VIDEO); }" },
    });
    const w = result.warnings.find((w) => w.code === "restricted_p5_api");
    expect(w?.message).toContain("createCapture(VIDEO)");
  });

  it("warns on createCapture(AUDIO)", () => {
    const result = synthesizeFromV2P5({
      p5js: { sketchSource: "function setup(){ createCapture(AUDIO); }" },
    });
    expect(result.warnings.find((w) => w.message.includes("createCapture(AUDIO)"))).toBeDefined();
  });

  it("warns on ml5.js usage", () => {
    const result = synthesizeFromV2P5({
      p5js: { sketchSource: "let net = ml5.imageClassifier('MobileNet');" },
    });
    expect(result.warnings.find((w) => w.message.includes("ml5.js"))).toBeDefined();
  });

  it("warns on fetch / XMLHttpRequest", () => {
    const result = synthesizeFromV2P5({
      p5js: { sketchSource: "fetch('/api/data'); new XMLHttpRequest();" },
    });
    const messages = result.warnings.map((w) => w.message).join(" ");
    expect(messages).toContain("fetch()");
    expect(messages).toContain("XMLHttpRequest");
  });

  it("emits a config that validates cleanly", () => {
    const result = synthesizeFromV2P5({
      title: "Valid P5",
      artworkId: "p5-valid",
      p5js: { sketchSource: "function setup(){}" },
    });
    expect(() => { validatePieceConfig(result.config); }).not.toThrow();
  });

  it("uses Untitled when title is missing", () => {
    const result = synthesizeFromV2P5({ p5js: { sketchSource: "x" } });
    expect(result.config.title).toBe("Untitled");
  });
});

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

describe("synthesizeFromV2Html", () => {
  it("wraps the html source in an inline html block", () => {
    const result = synthesizeFromV2Html({
      title: "Caption",
      artworkId: "html-1",
      html: { htmlSource: "<p>Hello</p>" },
    });
    expect(result.config.composition).toHaveLength(1);
    const block = result.config.composition?.[0];
    expect(block?.kind).toBe("html");
    if (block?.kind === "html" && block.config.source.kind === "inline") {
      expect(block.config.source.html).toBe("<p>Hello</p>");
    }
    expect(result.warnings).toEqual([]);
  });

  it("warns + emits a placeholder when html source is missing", () => {
    const result = synthesizeFromV2Html({ title: "Empty HTML" });
    expect(result.warnings.find((w) => w.code === "missing_html_source")).toBeDefined();
    expect(result.config.composition?.[0]?.kind).toBe("html");
  });

  it("warns when htmlSource is empty string", () => {
    const result = synthesizeFromV2Html({ html: { htmlSource: "" } });
    expect(result.warnings.find((w) => w.code === "missing_html_source")).toBeDefined();
  });

  it("emits a config that validates cleanly", () => {
    const result = synthesizeFromV2Html({
      title: "Valid HTML",
      artworkId: "html-valid",
      html: { htmlSource: "<div>ok</div>" },
    });
    expect(() => { validatePieceConfig(result.config); }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// three-experimental
// ---------------------------------------------------------------------------

describe("synthesizeFromV2Three", () => {
  it("emits a scene placeholder + a Phase D banner", () => {
    const result = synthesizeFromV2Three({
      title: "Form/Release",
      artworkId: "three-1",
      runtime: { renderer: "three-experimental" },
    });
    expect(result.config.composition?.[0]?.kind).toBe("scene");
    expect(result.warnings.find((w) => w.code === "scene_renderer_pending")).toBeDefined();
  });

  it("uses three-scene as the renderer.primary", () => {
    const result = synthesizeFromV2Three({ title: "x" });
    expect(result.config.renderer.primary).toBe("three-scene");
  });

  it("emits a config that validates cleanly", () => {
    const result = synthesizeFromV2Three({ title: "Valid Three", artworkId: "three-valid" });
    expect(() => { validatePieceConfig(result.config); }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Plugin (TouchDesigner)
// ---------------------------------------------------------------------------

describe("synthesizeFromPlugin", () => {
  it("passes the touchDesigner envelope through as pluginConfig", () => {
    const td = {
      manifestVersion: "td_artex_manifest_v0.1",
      importedAt: "2026-04-01T00:00:00Z",
      outputTop: "/project/out",
      summary: { topPassesCompiled: 1, signalNodesCompiled: 0, bindingsCompiled: 0, unsupportedOps: 0 },
      warnings: [],
      effectStack: [],
      signalGraph: { nodes: [] },
      bindings: [],
    };
    const result = synthesizeFromPlugin({
      title: "TD Bridge",
      artworkId: "td-1",
      touchDesigner: td,
    });
    expect(result.config.composition?.[0]?.kind).toBe("plugin");
    const block = result.config.composition?.[0];
    if (block?.kind === "plugin") {
      expect(block.config.pluginId).toBe("touch-designer");
      expect(block.config.pluginConfig).toEqual(td);
    }
    expect(result.warnings).toEqual([]);
  });

  it("warns when manifest is missing", () => {
    const result = synthesizeFromPlugin({ title: "x" });
    expect(result.warnings.find((w) => w.code === "missing_plugin_manifest")).toBeDefined();
    expect(result.config.composition?.[0]?.kind).toBe("plugin");
  });

  it("emits a config that validates cleanly", () => {
    const result = synthesizeFromPlugin({
      title: "Valid Plugin",
      artworkId: "plugin-valid",
      touchDesigner: { manifestVersion: "td_artex_manifest_v0.1" },
    });
    expect(() => { validatePieceConfig(result.config); }).not.toThrow();
  });

  it("treats array touchDesigner as missing manifest (not an object)", () => {
    const result = synthesizeFromPlugin({ touchDesigner: [] });
    expect(result.warnings.find((w) => w.code === "missing_plugin_manifest")).toBeDefined();
  });
});
