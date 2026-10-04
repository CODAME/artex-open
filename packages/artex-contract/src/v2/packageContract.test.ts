import { describe, expect, it } from "vitest";
import {
  buildCapabilitiesManifestV2,
  createDefaultStateV2,
  detectArtexPackageArchiveVersion,
  validateArtworkConfigV2,
  validateStateJsonV2,
} from "./packageContract";
import type { ArtworkConfigV2 } from "./types";

const artwork: ArtworkConfigV2 = {
  version: 2,
  id: "test-artwork",
  title: "Test Artwork",
  assets: [
    { id: "base-image", kind: "image", path: "assets/base-image.png" },
  ],
  layers: [
    {
      id: "base",
      kind: "image",
      name: "Base",
      assetId: "base-image",
      zIndex: 0,
    },
  ],
  inputs: {
    camera: { enabled: true, detectPresence: true },
  },
  states: [
    { id: "idle", label: "Idle", initial: true },
  ],
  triggers: [],
  transitions: [],
  fallbackState: "idle",
  runtime: {
    renderer: "webgl",
    localFirst: true,
    allowRecording: false,
    allowCloudUpload: false,
  },
};

describe("v2 package contract", () => {
  it("validates a minimal artwork and synthesizes state", () => {
    expect(() => { validateArtworkConfigV2(artwork); }).not.toThrow();
    expect(createDefaultStateV2(artwork)).toMatchObject({
      artworkId: "test-artwork",
      activeStateId: "idle",
    });
  });

  it("builds capability requirements from enabled inputs", () => {
    const manifest = buildCapabilitiesManifestV2(artwork);
    expect(manifest.requirements.map((entry) => entry.capability)).toEqual(["time", "camera"]);
  });

  it("detects v1 and v2 package archive layouts", async () => {
    const JSZip = (await import("jszip")).default;

    const legacyZip = new JSZip();
    legacyZip.file("config.json", JSON.stringify({ version: 1, title: "Legacy" }));
    expect(await detectArtexPackageArchiveVersion(await legacyZip.generateAsync({ type: "blob" }))).toBe(1);

    const v2Zip = new JSZip();
    v2Zip.file("config/artwork.json", JSON.stringify(artwork));
    expect(await detectArtexPackageArchiveVersion(await v2Zip.generateAsync({ type: "blob" }))).toBe(2);
  });
});

describe("validateArtworkConfigV2 — rejection cases", () => {
  it("rejects wrong version number", () => {
    expect(() => { validateArtworkConfigV2({ ...artwork, version: 1 as never }); })
      .toThrow("Expected ARTEX artwork version 2");
  });

  it("rejects blank id or title", () => {
    expect(() => { validateArtworkConfigV2({ ...artwork, id: "  " }); }).toThrow("id and title are required");
    expect(() => { validateArtworkConfigV2({ ...artwork, title: "" }); }).toThrow("id and title are required");
  });

  it("rejects empty assets, layers, or states", () => {
    expect(() => { validateArtworkConfigV2({ ...artwork, assets: [] }); }).toThrow("At least one asset");
    expect(() => { validateArtworkConfigV2({ ...artwork, layers: [] }); }).toThrow("At least one layer");
    expect(() => { validateArtworkConfigV2({ ...artwork, states: [] }); }).toThrow("At least one artwork state");
  });

  it("rejects a fallbackState that is not declared", () => {
    expect(() => { validateArtworkConfigV2({ ...artwork, fallbackState: "deleted" }); })
      .toThrow('Fallback state "deleted" is not declared');
  });

  it("rejects a trigger rule with unsupported signal", () => {
    expect(() => { validateArtworkConfigV2({
      ...artwork,
      triggers: [{
        id: "bad-rule",
        when: [{ signal: "temperature" as never, operator: "gte", value: 30 }],
        then: [{ type: "enter_state", stateId: "idle" }],
      }],
    }); }).toThrow("unsupported signal");
  });

  it("rejects a trigger rule with unsupported operator", () => {
    expect(() => { validateArtworkConfigV2({
      ...artwork,
      triggers: [{
        id: "bad-op",
        when: [{ signal: "presence", operator: "not_equal" as never, value: 1 }],
        then: [{ type: "enter_state", stateId: "idle" }],
      }],
    }); }).toThrow("unsupported operator");
  });

  it("rejects a trigger rule with empty conditions or actions", () => {
    expect(() => { validateArtworkConfigV2({
      ...artwork,
      triggers: [{ id: "no-when", when: [], then: [{ type: "enter_state", stateId: "idle" }] }],
    }); }).toThrow("at least one condition");
    expect(() => { validateArtworkConfigV2({
      ...artwork,
      triggers: [{ id: "no-then", when: [{ signal: "presence", operator: "present" }], then: [] }],
    }); }).toThrow("at least one action");
  });

  it("rejects a transition with negative duration", () => {
    expect(() => { validateArtworkConfigV2({
      ...artwork,
      transitions: [{ id: "t1", from: "idle", to: "awake", durationMs: -100 }],
    }); }).toThrow("non-negative duration");
  });

  it("rejects an unknown layer kind (previously passed silently)", () => {
    expect(() => { validateArtworkConfigV2({
      ...artwork,
      layers: [
        {
          id: "bogus",
          kind: "hologram" as never,
          name: "Bogus",
          zIndex: 0,
        } as never,
      ],
    }); }).toThrow("unsupported kind");
  });

  it("rejects model3d layer under the plain webgl renderer", () => {
    expect(() => { validateArtworkConfigV2({
      ...artwork,
      assets: [
        { id: "base-image", kind: "image", path: "assets/base-image.png" },
        { id: "mesh", kind: "model", path: "assets/mesh.glb" },
      ],
      layers: [
        { id: "base", kind: "image", name: "Base", assetId: "base-image", zIndex: 0 },
        {
          id: "mesh-layer",
          kind: "model3d",
          name: "Mesh",
          assetId: "mesh",
          zIndex: 1,
        },
      ],
    }); }).toThrow('runtime.renderer is "webgl"');
  });

  it("accepts model3d layer when runtime.renderer is three-experimental", () => {
    expect(() => { validateArtworkConfigV2({
      ...artwork,
      assets: [
        { id: "base-image", kind: "image", path: "assets/base-image.png" },
        { id: "mesh", kind: "model", path: "assets/mesh.glb" },
      ],
      layers: [
        { id: "base", kind: "image", name: "Base", assetId: "base-image", zIndex: 0 },
        {
          id: "mesh-layer",
          kind: "model3d",
          name: "Mesh",
          assetId: "mesh",
          zIndex: 1,
        },
      ],
      runtime: {
        renderer: "three-experimental",
        localFirst: true,
        allowRecording: false,
        allowCloudUpload: false,
      },
    }); }).not.toThrow();
  });

  it("rejects model3d layer with unknown assetId", () => {
    expect(() => { validateArtworkConfigV2({
      ...artwork,
      layers: [
        { id: "base", kind: "image", name: "Base", assetId: "base-image", zIndex: 0 },
        {
          id: "mesh-layer",
          kind: "model3d",
          name: "Mesh",
          assetId: "missing-asset",
          zIndex: 1,
        },
      ],
      runtime: {
        renderer: "three-experimental",
        localFirst: true,
        allowRecording: false,
        allowCloudUpload: false,
      },
    }); }).toThrow('unknown assetId "missing-asset"');
  });

  it("accepts model3d layer with each defined preset and soundReactive on/off", () => {
    for (const preset of ["studio", "matte", "chrome"] as const) {
      for (const soundReactive of [true, false]) {
        expect(() => { validateArtworkConfigV2({
          ...artwork,
          assets: [
            { id: "base-image", kind: "image", path: "assets/base-image.png" },
            { id: "mesh", kind: "model", path: "assets/mesh.glb" },
          ],
          layers: [
            { id: "base", kind: "image", name: "Base", assetId: "base-image", zIndex: 0 },
            {
              id: "mesh-layer",
              kind: "model3d",
              name: "Mesh",
              assetId: "mesh",
              zIndex: 1,
              preset,
              soundReactive,
            },
          ],
          runtime: {
            renderer: "three-experimental",
            localFirst: true,
            allowRecording: false,
            allowCloudUpload: false,
          },
        }); }).not.toThrow();
      }
    }
  });

  it("rejects model3d layer with an unsupported preset", () => {
    expect(() => { validateArtworkConfigV2({
      ...artwork,
      assets: [
        { id: "base-image", kind: "image", path: "assets/base-image.png" },
        { id: "mesh", kind: "model", path: "assets/mesh.glb" },
      ],
      layers: [
        { id: "base", kind: "image", name: "Base", assetId: "base-image", zIndex: 0 },
        {
          id: "mesh-layer",
          kind: "model3d",
          name: "Mesh",
          assetId: "mesh",
          zIndex: 1,
          preset: "neon" as never,
        },
      ],
      runtime: {
        renderer: "three-experimental",
        localFirst: true,
        allowRecording: false,
        allowCloudUpload: false,
      },
    }); }).toThrow('unsupported preset "neon"');
  });

  it("rejects model3d layer with non-boolean soundReactive", () => {
    expect(() => { validateArtworkConfigV2({
      ...artwork,
      assets: [
        { id: "base-image", kind: "image", path: "assets/base-image.png" },
        { id: "mesh", kind: "model", path: "assets/mesh.glb" },
      ],
      layers: [
        { id: "base", kind: "image", name: "Base", assetId: "base-image", zIndex: 0 },
        {
          id: "mesh-layer",
          kind: "model3d",
          name: "Mesh",
          assetId: "mesh",
          zIndex: 1,
          soundReactive: "yes" as never,
        },
      ],
      runtime: {
        renderer: "three-experimental",
        localFirst: true,
        allowRecording: false,
        allowCloudUpload: false,
      },
    }); }).toThrow("soundReactive must be a boolean");
  });

  it("rejects an invalid runtime.renderer value", () => {
    expect(() => { validateArtworkConfigV2({
      ...artwork,
      runtime: {
        renderer: "opengl-3" as never,
        localFirst: true,
        allowRecording: false,
        allowCloudUpload: false,
      },
    }); }).toThrow("runtime.renderer must be one of");
  });
});

describe("validateStateJsonV2", () => {
  it("rejects mismatched artworkId", () => {
    const state = createDefaultStateV2(artwork);
    expect(() => { validateStateJsonV2({ ...state, artworkId: "wrong" }, artwork); })
      .toThrow("does not match");
  });

  it("rejects unknown active state", () => {
    const state = createDefaultStateV2(artwork);
    expect(() => { validateStateJsonV2({ ...state, activeStateId: "deleted" }, artwork); })
      .toThrow('Unknown active state "deleted"');
  });
});

describe("createDefaultStateV2", () => {
  it("initializes layerState for every layer in the artwork", () => {
    const multiLayerArtwork: ArtworkConfigV2 = {
      ...artwork,
      layers: [
        { id: "bg", kind: "image", name: "Background", assetId: "base-image", zIndex: 0 },
        { id: "fg", kind: "image", name: "Foreground", assetId: "base-image", zIndex: 1 },
      ],
    };
    const state = createDefaultStateV2(multiLayerArtwork);
    expect(Object.keys(state.layerState)).toEqual(["bg", "fg"]);
    expect(state.layerState.bg).toMatchObject({ visible: true, opacity: 1, playing: false });
  });

  it("selects the initial state when available", () => {
    const twoStateArtwork: ArtworkConfigV2 = {
      ...artwork,
      states: [
        { id: "sleep", label: "Sleep" },
        { id: "active", label: "Active", initial: true },
      ],
      fallbackState: "sleep",
    };
    expect(createDefaultStateV2(twoStateArtwork).activeStateId).toBe("active");
  });

  it("falls back to fallbackState when no state is marked initial", () => {
    const noInitialArtwork: ArtworkConfigV2 = {
      ...artwork,
      states: [
        { id: "sleep", label: "Sleep" },
        { id: "active", label: "Active" },
      ],
      fallbackState: "sleep",
    };
    expect(createDefaultStateV2(noInitialArtwork).activeStateId).toBe("sleep");
  });
});

describe("buildCapabilitiesManifestV2", () => {
  it("always includes the time capability", () => {
    const manifest = buildCapabilitiesManifestV2({ ...artwork, inputs: {} });
    expect(manifest.requirements.map((r) => r.capability)).toContain("time");
  });

  it("includes microphone and audio when mic is enabled", () => {
    const manifest = buildCapabilitiesManifestV2({
      ...artwork,
      inputs: { microphone: { enabled: true } },
    });
    const caps = manifest.requirements.map((r) => r.capability);
    expect(caps).toContain("microphone");
    expect(caps).toContain("audio");
  });

  it("does not duplicate capabilities for multiple input types", () => {
    const manifest = buildCapabilitiesManifestV2({
      ...artwork,
      inputs: {
        camera: { enabled: true },
        gesture: { enabled: true, gestures: ["wave"] },
        pose: { enabled: true, poses: ["standing"] },
        proximity: { enabled: true, strategy: "camera-scale" },
        microphone: { enabled: true },
      },
    });
    const caps = manifest.requirements.map((r) => r.capability);
    expect(new Set(caps).size).toBe(caps.length);
  });

  it("infers microphone + audio from a soundReactive model3d layer even when inputs.microphone is missing", () => {
    const manifest = buildCapabilitiesManifestV2({
      ...artwork,
      assets: [
        { id: "base-image", kind: "image", path: "assets/base-image.png" },
        { id: "mesh", kind: "model", path: "assets/mesh.glb" },
      ],
      layers: [
        { id: "base", kind: "image", name: "Base", assetId: "base-image", zIndex: 0 },
        {
          id: "mesh-layer",
          kind: "model3d",
          name: "Mesh",
          assetId: "mesh",
          zIndex: 1,
          soundReactive: true,
        },
      ],
      inputs: {},
      runtime: {
        renderer: "three-experimental",
        localFirst: true,
        allowRecording: false,
        allowCloudUpload: false,
      },
    });
    const caps = manifest.requirements.map((r) => r.capability);
    expect(caps).toContain("microphone");
    expect(caps).toContain("audio");
    // Still no duplicates if both the input and the layer demand it.
    expect(new Set(caps).size).toBe(caps.length);
  });

  it("does not infer microphone for a model3d layer with soundReactive disabled", () => {
    const manifest = buildCapabilitiesManifestV2({
      ...artwork,
      assets: [
        { id: "base-image", kind: "image", path: "assets/base-image.png" },
        { id: "mesh", kind: "model", path: "assets/mesh.glb" },
      ],
      layers: [
        { id: "base", kind: "image", name: "Base", assetId: "base-image", zIndex: 0 },
        {
          id: "mesh-layer",
          kind: "model3d",
          name: "Mesh",
          assetId: "mesh",
          zIndex: 1,
          soundReactive: false,
        },
      ],
      inputs: {},
      runtime: {
        renderer: "three-experimental",
        localFirst: true,
        allowRecording: false,
        allowCloudUpload: false,
      },
    });
    const caps = manifest.requirements.map((r) => r.capability);
    expect(caps).not.toContain("microphone");
    expect(caps).not.toContain("audio");
  });
});
