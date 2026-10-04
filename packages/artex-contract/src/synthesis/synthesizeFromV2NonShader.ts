/**
 * V2 non-shader synthesizers — P5 / HTML / three-experimental / plugin.
 *
 * The production corpus has zero pieces in any of these classes (corpus
 * audit 2026-05-02), so the practical use case for C.2.b is **new
 * authoring**: someone forks `p5jsStarter.ts`, edits a sketch, hits
 * save. Studio's load-time synthesis (C.1) and the C.2.d batch
 * migration both call into these branches via `synthesizeFromLegacy`.
 *
 * All four branches emit V3 configs with an explicit `composition[]`
 * array (rather than legacy top-level fields) because there's no
 * top-level `sketch` / `html` / `plugin` fallback in the schema —
 * `composition` is the only way to express these block kinds.
 *
 * Pure functions. No I/O, no DOM. Tests run in node.
 */
import type { PieceConfig, Block } from "../v3/types";
import type { SynthesisWarning } from "./synthesizeFromLegacy";

interface NonShaderSynthesisOutput {
  config: PieceConfig;
  warnings: SynthesisWarning[];
}

const PRIMARY_BLOCK_ID = "primary";

// ---------------------------------------------------------------------------
// P5 (sketch block)
// ---------------------------------------------------------------------------

/**
 * Restricted P5 APIs that the V3 sandbox iframe doesn't permit by
 * default. Detection is a forgiving substring scan — it errs toward
 * surfacing more banners (artists can confirm the warning was a false
 * positive) rather than silently allowing risky calls through.
 */
const RESTRICTED_P5_API_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /createCapture\s*\(\s*VIDEO/i, label: "createCapture(VIDEO)" },
  { pattern: /createCapture\s*\(\s*AUDIO/i, label: "createCapture(AUDIO)" },
  { pattern: /\bml5\b/, label: "ml5.js" },
  { pattern: /\bgetAudioContext\s*\(/, label: "getAudioContext()" },
  { pattern: /\bloadSound\s*\(/, label: "loadSound()" },
  { pattern: /\bfetch\s*\(/, label: "fetch()" },
  { pattern: /\bXMLHttpRequest\b/, label: "XMLHttpRequest" },
];

export function synthesizeFromV2P5(projectData: unknown): NonShaderSynthesisOutput {
  const warnings: SynthesisWarning[] = [];
  const data = (projectData && typeof projectData === "object" ? projectData : {}) as Record<string, unknown>;
  const { id, title } = readIdentity(data, "v2-p5");

  const p5Config = data.p5js;
  if (!p5Config || typeof p5Config !== "object") {
    warnings.push({
      code: "missing_p5_source",
      message: "This piece was tagged as a P5 sketch but has no sketch source on disk. The synthesized config has an empty sketch placeholder — paste the source back in to keep playing.",
      blockId: PRIMARY_BLOCK_ID,
    });
    return {
      config: shellConfig(id, title, [emptySketchBlock()]),
      warnings,
    };
  }

  const sketchSource = (p5Config as Record<string, unknown>).sketchSource;
  const code = typeof sketchSource === "string" ? sketchSource : "";

  if (code.length === 0) {
    warnings.push({
      code: "missing_p5_source",
      message: "Sketch source is empty on disk. The synthesized config has an empty sketch placeholder — paste the source back in to keep playing.",
      blockId: PRIMARY_BLOCK_ID,
    });
  }

  for (const { pattern, label } of RESTRICTED_P5_API_PATTERNS) {
    if (pattern.test(code)) {
      warnings.push({
        code: "restricted_p5_api",
        message:
          `This sketch uses ${label}, which the V3 sandbox doesn't allow. The piece will keep playing on its current archive, ` +
          "but re-saving may break those features. Use ARTEX signal sources for camera/audio input instead.",
        blockId: PRIMARY_BLOCK_ID,
      });
    }
  }

  const block: Block = {
    kind: "sketch",
    id: PRIMARY_BLOCK_ID,
    config: {
      source: { kind: "inline", code: code.length > 0 ? code : "// (sketch source missing)" },
    },
  };

  return { config: shellConfig(id, title, [block]), warnings };
}

function emptySketchBlock(): Block {
  return {
    kind: "sketch",
    id: PRIMARY_BLOCK_ID,
    config: { source: { kind: "inline", code: "// (sketch source missing)" } },
  };
}

// ---------------------------------------------------------------------------
// HTML (html block)
// ---------------------------------------------------------------------------

export function synthesizeFromV2Html(projectData: unknown): NonShaderSynthesisOutput {
  const warnings: SynthesisWarning[] = [];
  const data = (projectData && typeof projectData === "object" ? projectData : {}) as Record<string, unknown>;
  const { id, title } = readIdentity(data, "v2-html");

  const htmlConfig = data.html;
  const htmlSource = htmlConfig && typeof htmlConfig === "object"
    ? (htmlConfig as Record<string, unknown>).htmlSource
    : null;
  const inlineHtml = typeof htmlSource === "string" ? htmlSource : "";

  if (inlineHtml.length === 0) {
    warnings.push({
      code: "missing_html_source",
      message: "This piece was tagged as an HTML experience but has no HTML source on disk. The synthesized config has an empty placeholder — paste the source back in to keep playing.",
      blockId: PRIMARY_BLOCK_ID,
    });
  }

  const block: Block = {
    kind: "html",
    id: PRIMARY_BLOCK_ID,
    config: {
      source: {
        kind: "inline",
        html: inlineHtml.length > 0 ? inlineHtml : "<!-- (HTML source missing) -->",
      },
    },
  };

  return { config: shellConfig(id, title, [block]), warnings };
}

// ---------------------------------------------------------------------------
// three-experimental (scene placeholder)
// ---------------------------------------------------------------------------

/**
 * `runtime.renderer === "three-experimental"` is the legacy
 * Three.js-backed renderer mode. V3's `scene` block is the engine-
 * agnostic equivalent, but its renderer ships in Phase D — so for
 * C.2.b the synthesizer emits an empty SceneRecipeConfig + a banner.
 *
 * The composition still validates and the piece loads; it just won't
 * render until Phase D's scene player ships.
 */
export function synthesizeFromV2Three(projectData: unknown): NonShaderSynthesisOutput {
  const data = (projectData && typeof projectData === "object" ? projectData : {}) as Record<string, unknown>;
  const { id, title } = readIdentity(data, "v2-three");

  const block: Block = {
    kind: "scene",
    id: PRIMARY_BLOCK_ID,
    config: { lights: [], meshes: [] },
  };

  return {
    config: shellConfig(id, title, [block], { primary: "three-scene" }),
    warnings: [
      {
        code: "scene_renderer_pending",
        message:
          "This piece used the experimental Three.js renderer. Scene rendering ships in Phase D — until then the piece keeps playing on its existing archive but Studio shows a placeholder.",
        blockId: PRIMARY_BLOCK_ID,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Plugin (TouchDesigner / future plugin envelopes)
// ---------------------------------------------------------------------------

/**
 * Plugin pieces in v2 store their authored manifest under
 * `data.touchDesigner` (the only plugin shipped today). The synthesizer
 * passes the entire envelope through as the V3 plugin block's
 * `pluginConfig` — the runtime/Studio plugin loader is expected to
 * read what it needs.
 *
 * The plugin contract survey (open item before C.4 plugin routing
 * matures) will revisit this; for C.2.b a passthrough is the safest
 * shape.
 */
export function synthesizeFromPlugin(projectData: unknown): NonShaderSynthesisOutput {
  const warnings: SynthesisWarning[] = [];
  const data = (projectData && typeof projectData === "object" ? projectData : {}) as Record<string, unknown>;
  const { id, title } = readIdentity(data, "plugin");

  const td = data.touchDesigner;
  const isUsableManifest = !!td && typeof td === "object" && !Array.isArray(td);
  if (!isUsableManifest) {
    warnings.push({
      code: "missing_plugin_manifest",
      message: "This piece was detected as plugin-rendered but has no plugin manifest on disk. The synthesized config carries an empty plugin block — re-import to restore.",
      blockId: PRIMARY_BLOCK_ID,
    });
  }

  const block: Block = {
    kind: "plugin",
    id: PRIMARY_BLOCK_ID,
    config: {
      pluginId: "touch-designer",
      pluginConfig: isUsableManifest ? (td as Record<string, unknown>) : {},
    },
  };

  return { config: shellConfig(id, title, [block]), warnings };
}

// ---------------------------------------------------------------------------
// Shared helpers

function readIdentity(data: Record<string, unknown>, kindLabel: string): { id: string; title: string } {
  const id = typeof data.artworkId === "string" && data.artworkId.length > 0
    ? data.artworkId
    : `synthesized-${kindLabel}-${Date.now()}`;
  const title = typeof data.title === "string" && data.title.length > 0 ? data.title : "Untitled";
  return { id, title };
}

function shellConfig(
  id: string,
  title: string,
  composition: Block[],
  rendererOverride?: PieceConfig["renderer"],
): PieceConfig {
  return {
    version: 3,
    id,
    title,
    renderer: rendererOverride ?? { primary: "shader" },
    composition,
  };
}
