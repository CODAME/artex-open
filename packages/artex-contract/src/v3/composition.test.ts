import { describe, expect, it } from "vitest";
import type {
  HtmlBlockConfig,
  ParticleRecipeConfig,
  PieceConfig,
  PluginBlockConfig,
  SceneRecipeConfig,
  ShaderStackConfig,
  SketchBlockConfig,
  Block,
} from "./types";
import {
  LEGACY_BLOCK_IDS,
  getComposition,
  getRenderableComposition,
  isBlockVisible,
  liftLegacyToComposition,
} from "./types";
import {
  PieceConfigError,
  validateComposition,
  validateHtmlBlock,
  validatePieceConfig,
  validatePluginBlock,
  validateSketchBlock,
} from "./validation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseConfig: PieceConfig = {
  version: 3,
  id: "compound-piece",
  title: "Compound Piece",
  renderer: { primary: "shader" },
};

const validShaderStack: ShaderStackConfig = {
  passes: [
    { id: "warp", shaderId: "warp", params: { speed: 0.5 } },
  ],
};

const validSceneRecipe: SceneRecipeConfig = {
  lights: [{ id: "ambient", kind: "ambient", color: 0xffffff, intensity: 1 }],
  meshes: [],
};

const validParticleRecipe: ParticleRecipeConfig = {
  emitters: [
    {
      id: "default-emitter",
      shape: "point",
      rate: 10,
      lifetime: { min: 1, max: 2 },
      velocity: { direction: [0, 1, 0], spread: 0.1, speed: { min: 1, max: 2 } },
      size: { start: 1, end: 0 },
      opacity: { start: 1, end: 0 },
    },
  ],
  maxParticles: 100,
};

// ---------------------------------------------------------------------------
// liftLegacyToComposition
// ---------------------------------------------------------------------------

describe("liftLegacyToComposition", () => {
  it("returns an empty array when no legacy fields are present", () => {
    expect(liftLegacyToComposition(baseConfig)).toEqual([]);
  });

  it("lifts shaderStack into a single shader-stack block", () => {
    const blocks = liftLegacyToComposition({ ...baseConfig, shaderStack: validShaderStack });
    expect(blocks).toEqual([
      { kind: "shader-stack", id: LEGACY_BLOCK_IDS.shaderStack, config: validShaderStack },
    ]);
  });

  it("lifts sceneRecipe into a scene block", () => {
    const blocks = liftLegacyToComposition({ ...baseConfig, sceneRecipe: validSceneRecipe });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "scene", id: LEGACY_BLOCK_IDS.scene });
  });

  it("lifts particleRecipe into a particle block", () => {
    const blocks = liftLegacyToComposition({ ...baseConfig, particleRecipe: validParticleRecipe });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "particle", id: LEGACY_BLOCK_IDS.particle });
  });

  it("preserves shader → scene → particle render order for compound legacy pieces", () => {
    const blocks = liftLegacyToComposition({
      ...baseConfig,
      shaderStack: validShaderStack,
      sceneRecipe: validSceneRecipe,
      particleRecipe: validParticleRecipe,
    });
    expect(blocks.map((b) => b.kind)).toEqual(["shader-stack", "scene", "particle"]);
  });

  it("does not mutate the input config", () => {
    const config = { ...baseConfig, shaderStack: validShaderStack };
    const snapshot = JSON.stringify(config);
    liftLegacyToComposition(config);
    expect(JSON.stringify(config)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// getComposition
// ---------------------------------------------------------------------------

describe("getComposition", () => {
  it("returns the explicit composition when present and non-empty", () => {
    const composition: Block[] = [
      { kind: "shader-stack", id: "primary", config: validShaderStack },
    ];
    expect(getComposition({ ...baseConfig, composition })).toBe(composition);
  });

  it("falls back to legacy lift when composition is absent", () => {
    const blocks = getComposition({ ...baseConfig, shaderStack: validShaderStack });
    expect(blocks).toEqual([
      { kind: "shader-stack", id: LEGACY_BLOCK_IDS.shaderStack, config: validShaderStack },
    ]);
  });

  it("falls back to legacy lift when composition is an empty array", () => {
    const blocks = getComposition({ ...baseConfig, composition: [], shaderStack: validShaderStack });
    expect(blocks).toEqual([
      { kind: "shader-stack", id: LEGACY_BLOCK_IDS.shaderStack, config: validShaderStack },
    ]);
  });

  it("explicit composition wins over legacy fields when both are populated", () => {
    const composition: Block[] = [
      { kind: "shader-stack", id: "modern", config: { passes: [{ id: "x", shaderId: "modern-x", params: {} }] } },
    ];
    const result = getComposition({ ...baseConfig, composition, shaderStack: validShaderStack });
    expect(result).toBe(composition);
    expect(result[0].id).toBe("modern");
  });

  it("returns an empty array when neither composition nor legacy fields are present", () => {
    expect(getComposition(baseConfig)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Layer visibility — getRenderableComposition / isBlockVisible
// ---------------------------------------------------------------------------

describe("layer visibility", () => {
  const visible: Block = { kind: "shader-stack", id: "visible", config: validShaderStack };
  const hidden: Block = { kind: "shader-stack", id: "hidden", config: validShaderStack, enabled: false };
  const explicitlyVisible: Block = {
    kind: "shader-stack",
    id: "explicit",
    config: validShaderStack,
    enabled: true,
  };

  it("treats an absent flag as visible, so pieces stored before the flag existed are unchanged", () => {
    // Arrange
    const composition: Block[] = [visible];

    // Act
    const renderable = getRenderableComposition({ ...baseConfig, composition });

    // Assert
    expect(isBlockVisible(visible)).toBe(true);
    expect(renderable).toEqual(composition);
  });

  it("treats enabled: true as visible", () => {
    expect(isBlockVisible(explicitlyVisible)).toBe(true);
  });

  it("drops a block with enabled: false", () => {
    // Arrange
    const composition: Block[] = [visible, hidden, explicitlyVisible];

    // Act
    const renderable = getRenderableComposition({ ...baseConfig, composition });

    // Assert
    expect(renderable.map((b) => b.id)).toEqual(["visible", "explicit"]);
  });

  it("keeps the array identity when nothing is hidden, matching getComposition", () => {
    // Arrange
    const composition: Block[] = [visible, explicitlyVisible];
    const config = { ...baseConfig, composition };

    // Act + Assert
    expect(getRenderableComposition(config)).toBe(composition);
  });

  it("returns empty when every block is hidden", () => {
    expect(getRenderableComposition({ ...baseConfig, composition: [hidden] })).toEqual([]);
  });

  it("leaves getComposition total, so the editor can still list a hidden layer to unhide it", () => {
    // Arrange
    const composition: Block[] = [hidden];

    // Act
    const all = getComposition({ ...baseConfig, composition });

    // Assert — the whole recovery path depends on this staying unfiltered.
    expect(all.map((b) => b.id)).toEqual(["hidden"]);
  });

  it("honours the flag on a legacy piece whose composition was lifted", () => {
    // A lifted block carries no flag, so a legacy piece always renders.
    const blocks = getRenderableComposition({ ...baseConfig, shaderStack: validShaderStack });
    expect(blocks).toHaveLength(1);
  });

  it("rejects a non-boolean enabled at the boundary", () => {
    // Arrange
    const composition = [
      { ...visible, enabled: "yes" as unknown as boolean },
    ] as Block[];

    // Act + Assert
    expect(() => { validateComposition(composition); }).toThrow(PieceConfigError);
  });

  it("accepts a boolean enabled", () => {
    expect(() => { validateComposition([hidden, explicitlyVisible]); }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateSketchBlock
// ---------------------------------------------------------------------------

describe("validateSketchBlock", () => {
  it("accepts an inline sketch with valid params", () => {
    const config: SketchBlockConfig = {
      source: { kind: "inline", code: "function setup(){}" },
      exposedParams: {
        speed: { type: "number", default: 1, range: [0, 2] },
      },
    };
    expect(() => { validateSketchBlock(config); }).not.toThrow();
  });

  it("accepts an asset-backed sketch", () => {
    const config: SketchBlockConfig = { source: { kind: "asset", assetId: "asset-123" } };
    expect(() => { validateSketchBlock(config); }).not.toThrow();
  });

  it("rejects empty inline code", () => {
    const config: SketchBlockConfig = { source: { kind: "inline", code: "   " } };
    expect(() => { validateSketchBlock(config); }).toThrow(PieceConfigError);
  });

  it("rejects empty assetId", () => {
    const config: SketchBlockConfig = { source: { kind: "asset", assetId: "" } };
    expect(() => { validateSketchBlock(config); }).toThrow(/non-empty assetId/);
  });

  it("rejects non-finite param defaults", () => {
    const config: SketchBlockConfig = {
      source: { kind: "inline", code: "//noop" },
      exposedParams: { broken: { type: "number", default: Number.NaN } },
    };
    expect(() => { validateSketchBlock(config); }).toThrow(/finite number/);
  });

  it("rejects inverted param ranges", () => {
    const config: SketchBlockConfig = {
      source: { kind: "inline", code: "//noop" },
      exposedParams: { speed: { type: "number", default: 1, range: [2, 0] } },
    };
    expect(() => { validateSketchBlock(config); }).toThrow(/range min must be less than max/);
  });
});

// ---------------------------------------------------------------------------
// validateHtmlBlock
// ---------------------------------------------------------------------------

describe("validateHtmlBlock", () => {
  it("accepts a URL-backed HTML block", () => {
    const config: HtmlBlockConfig = { source: { kind: "url", url: "https://example.com/embed" } };
    expect(() => { validateHtmlBlock(config); }).not.toThrow();
  });

  it("accepts an inline HTML block", () => {
    const config: HtmlBlockConfig = { source: { kind: "inline", html: "<p>hi</p>" } };
    expect(() => { validateHtmlBlock(config); }).not.toThrow();
  });

  it("rejects empty URL", () => {
    const config: HtmlBlockConfig = { source: { kind: "url", url: "" } };
    expect(() => { validateHtmlBlock(config); }).toThrow(/non-empty url/);
  });

  it("rejects a URL that is not a valid absolute URL", () => {
    const config: HtmlBlockConfig = { source: { kind: "url", url: "not a url" } };
    expect(() => { validateHtmlBlock(config); }).toThrow(/valid absolute URL/);
  });

  it("rejects plain http for non-loopback hosts", () => {
    const config: HtmlBlockConfig = { source: { kind: "url", url: "http://example.com/embed" } };
    expect(() => { validateHtmlBlock(config); }).toThrow(/must use https/);
  });

  it("accepts plain http for localhost during local development", () => {
    const config: HtmlBlockConfig = { source: { kind: "url", url: "http://localhost:5173/embed" } };
    expect(() => { validateHtmlBlock(config); }).not.toThrow();
  });

  it("rejects non-web schemes", () => {
    // eslint-disable-next-line no-script-url -- asserting the validator rejects it
    const config: HtmlBlockConfig = { source: { kind: "url", url: "javascript:alert(1)" } };
    expect(() => { validateHtmlBlock(config); }).toThrow(/must use https/);
  });

  it("rejects URLs with embedded credentials", () => {
    const config: HtmlBlockConfig = { source: { kind: "url", url: "https://user:pass@example.com/embed" } };
    expect(() => { validateHtmlBlock(config); }).toThrow(/must not embed credentials/);
  });

  it("rejects empty inline html", () => {
    const config: HtmlBlockConfig = { source: { kind: "inline", html: "  " } };
    expect(() => { validateHtmlBlock(config); }).toThrow(/non-empty html/);
  });

  it("accepts a postMessage contract with a concrete origin allowlist", () => {
    const config: HtmlBlockConfig = {
      source: { kind: "url", url: "https://example.com" },
      signalPostMessage: { eventName: "artex:signal", targetOrigin: ["https://example.com"] },
    };
    expect(() => { validateHtmlBlock(config); }).not.toThrow();
  });

  it("rejects wildcard origins in postMessage contract", () => {
    const config: HtmlBlockConfig = {
      source: { kind: "url", url: "https://example.com" },
      signalPostMessage: { eventName: "artex:signal", targetOrigin: ["*"] },
    };
    expect(() => { validateHtmlBlock(config); }).toThrow(/wildcards/);
  });

  it("rejects unparseable origins in postMessage contract", () => {
    const config: HtmlBlockConfig = {
      source: { kind: "url", url: "https://example.com" },
      signalPostMessage: { eventName: "artex:signal", targetOrigin: ["example.com"] },
    };
    expect(() => { validateHtmlBlock(config); }).toThrow(/valid origin URL/);
  });

  it("rejects empty postMessage event name", () => {
    const config: HtmlBlockConfig = {
      source: { kind: "inline", html: "<p>hi</p>" },
      signalPostMessage: { eventName: "  " },
    };
    expect(() => { validateHtmlBlock(config); }).toThrow(/eventName must be non-empty/);
  });
});

// ---------------------------------------------------------------------------
// validatePluginBlock
// ---------------------------------------------------------------------------

describe("validatePluginBlock", () => {
  it("accepts a plugin with a non-empty id and an object config", () => {
    const config: PluginBlockConfig = { pluginId: "td-bridge", pluginConfig: { mode: "ndi" } };
    expect(() => { validatePluginBlock(config); }).not.toThrow();
  });

  it("rejects empty pluginId", () => {
    const config: PluginBlockConfig = { pluginId: "", pluginConfig: {} };
    expect(() => { validatePluginBlock(config); }).toThrow(/non-empty pluginId/);
  });

  it("accepts an empty pluginConfig object", () => {
    const config: PluginBlockConfig = { pluginId: "x", pluginConfig: {} };
    expect(() => { validatePluginBlock(config); }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateComposition
// ---------------------------------------------------------------------------

describe("validateComposition", () => {
  it("accepts a single shader-stack block", () => {
    const blocks: Block[] = [{ kind: "shader-stack", id: "base", config: validShaderStack }];
    expect(() => { validateComposition(blocks); }).not.toThrow();
  });

  it("accepts a heterogeneous compound composition", () => {
    const blocks: Block[] = [
      { kind: "shader-stack", id: "field", config: validShaderStack },
      { kind: "sketch", id: "trace", config: { source: { kind: "inline", code: "function draw(){}" } } },
      { kind: "html", id: "caption", config: { source: { kind: "inline", html: "<p>title</p>" } } },
    ];
    expect(() => { validateComposition(blocks); }).not.toThrow();
  });

  it("rejects duplicate block ids", () => {
    const blocks: Block[] = [
      { kind: "shader-stack", id: "dupe", config: validShaderStack },
      { kind: "shader-stack", id: "dupe", config: validShaderStack },
    ];
    expect(() => { validateComposition(blocks); }).toThrow(/Duplicate composition block id/);
  });

  it("rejects empty block id", () => {
    const blocks: Block[] = [
      { kind: "shader-stack", id: "  ", config: validShaderStack },
    ];
    expect(() => { validateComposition(blocks); }).toThrow(/non-empty id/);
  });

  it("dispatches per-kind validators (broken inner config fails)", () => {
    const blocks: Block[] = [
      { kind: "sketch", id: "broken", config: { source: { kind: "inline", code: "" } } },
    ];
    expect(() => { validateComposition(blocks); }).toThrow(/Inline sketch source/);
  });

  it("rejects unknown block kind via exhaustive switch", () => {
    const bogus = { kind: "rumour-mill", id: "x", config: {} } as unknown as Block;
    expect(() => { validateComposition([bogus]); }).toThrow(/Unknown composition block kind/);
  });
});

// ---------------------------------------------------------------------------
// validatePieceConfig — composition integration
// ---------------------------------------------------------------------------

describe("validatePieceConfig with composition", () => {
  it("accepts a piece with an explicit composition stack", () => {
    const config: PieceConfig = {
      ...baseConfig,
      composition: [
        { kind: "shader-stack", id: "field", config: validShaderStack },
      ],
    };
    expect(() => { validatePieceConfig(config); }).not.toThrow();
  });

  it("accepts a piece with both explicit composition and legacy fields", () => {
    const config: PieceConfig = {
      ...baseConfig,
      shaderStack: validShaderStack,
      composition: [
        { kind: "shader-stack", id: "modern", config: validShaderStack },
      ],
    };
    expect(() => { validatePieceConfig(config); }).not.toThrow();
  });

  it("propagates per-block validation errors", () => {
    const config: PieceConfig = {
      ...baseConfig,
      composition: [
        { kind: "html", id: "caption", config: { source: { kind: "url", url: "" } } },
      ],
    };
    expect(() => { validatePieceConfig(config); }).toThrow(/non-empty url/);
  });
});
