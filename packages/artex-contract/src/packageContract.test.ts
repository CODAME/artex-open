import { describe, expect, it } from "vitest";
import {
  validateConfigJson,
  createStateFromConfig,
  normalizeProjectPackageData,
  PackageContractError,
  ARTEX_CONFIG_VERSION,
} from "./packageContract.ts";
import type { ConfigJson } from "./types.ts";

// --- Minimal valid ConfigJson fixture ---
const validConfig: ConfigJson = {
  version: 1,
  artworkId: "test-artwork",
  title: "Test Artwork",
  layers: {
    base: { parallaxDepth: 0.5, breathingIntensity: 0.3, textureDrift: 0.1 },
  },
  animation: {
    baseSpeed: 1,
    breathingEnabled: true,
    parallaxEnabled: true,
    colorShiftEnabled: false,
  },
  evolution: {
    phases: [
      { label: "calm", colorTemperatureShift: 0, noiseIntensity: 0 },
    ],
  },
} as ConfigJson;

describe("validateConfigJson", () => {
  it("accepts a valid config", () => {
    expect(() => validateConfigJson(validConfig)).not.toThrow();
  });

  it("rejects a config with no version", () => {
    expect(() => validateConfigJson({ ...validConfig, version: undefined } as never))
      .toThrow(PackageContractError);
  });

  it("rejects a config with a version newer than supported", () => {
    expect(() => validateConfigJson({ ...validConfig, version: ARTEX_CONFIG_VERSION + 1 }))
      .toThrow("newer than");
  });

  it("rejects version below 1", () => {
    expect(() => validateConfigJson({ ...validConfig, version: 0 }))
      .toThrow("not supported");
  });

  it("rejects missing title", () => {
    expect(() => validateConfigJson({ ...validConfig, title: 42 } as never))
      .toThrow("title");
  });

  it("rejects missing base layer settings", () => {
    expect(() => validateConfigJson({ ...validConfig, layers: {} } as never))
      .toThrow("base layer");
  });

  it("rejects missing animation settings", () => {
    expect(() => validateConfigJson({ ...validConfig, animation: {} } as never))
      .toThrow("animation");
  });

  it("rejects empty evolution phases", () => {
    expect(() => validateConfigJson({
      ...validConfig,
      evolution: { phases: [] },
    } as never)).toThrow("evolution phase");
  });
});

describe("createStateFromConfig", () => {
  it("creates state with correct artworkId", () => {
    const state = createStateFromConfig(validConfig);
    expect(state.artworkId).toBe("test-artwork");
  });

  it("uses the first evolution phase label", () => {
    const state = createStateFromConfig(validConfig);
    expect(state.currentPhaseLabel).toBe("calm");
  });

  it("uses config breathing intensity", () => {
    const state = createStateFromConfig(validConfig);
    expect(state.parameters.breathingIntensity).toBe(0.3);
  });

  it("initialises an empty events log", () => {
    const state = createStateFromConfig(validConfig);
    expect(state.eventsLog).toEqual([]);
  });
});

describe("normalizeProjectPackageData", () => {
  it("returns null for non-object input", () => {
    expect(normalizeProjectPackageData(null)).toBeNull();
    expect(normalizeProjectPackageData("string")).toBeNull();
    expect(normalizeProjectPackageData(42)).toBeNull();
  });

  it("returns null for unsupported version", () => {
    expect(normalizeProjectPackageData({ version: 999 })).toBeNull();
  });

  it("returns null for missing shader/channel data", () => {
    expect(normalizeProjectPackageData({ version: 1 })).toBeNull();
    expect(normalizeProjectPackageData({ version: 1, shader: {} })).toBeNull();
  });

  it("normalises a valid project package", () => {
    const result = normalizeProjectPackageData({
      version: 1,
      shader: { id: "test", source: "" },
      shaderChannels: { paths: ["a.png", null, null, null] },
    });
    expect(result).not.toBeNull();
    expect(result?.shaderChannels.paths).toHaveLength(4);
  });

  it("clamps shader channel paths to 4 entries", () => {
    const result = normalizeProjectPackageData({
      version: 1,
      shader: { id: "test", source: "" },
      shaderChannels: { paths: ["a", "b", "c", "d", "e"] },
    });
    expect(result?.shaderChannels.paths).toHaveLength(4);
  });
});
