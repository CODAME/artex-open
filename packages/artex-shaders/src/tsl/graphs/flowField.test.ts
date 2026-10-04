import { describe, it, expect } from "vitest";
import { uniform, texture } from "three/tsl";
import { DataTexture } from "three/webgpu";
import type { TslPassInputs } from "@artex/contract/tsl";
import { FLOW_FIELD_TSL_GRAPH, FLOW_FIELD_TSL_SCRIPT_ID } from "./flowField";

function stubInputs(params: Record<string, number>): TslPassInputs {
  const tex = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  tex.needsUpdate = true;
  const uniforms = new Map(Object.entries(params).map(([k, v]) => [k, uniform(v)]));
  return {
    source: texture(tex),
    prevPass: texture(tex),
    uniforms,
    time: uniform(0),
    resolution: uniform({ x: 1, y: 1 } as never),
    interaction: {
      audioLevel: uniform(0),
      bassLevel: uniform(0),
      proximity: uniform(0),
      cameraLevel: uniform(0),
    },
  } as unknown as TslPassInputs;
}

describe("flowField TSL graph", () => {
  it("exposes a stable scriptId and entry", () => {
    expect(FLOW_FIELD_TSL_GRAPH.id).toBe(FLOW_FIELD_TSL_SCRIPT_ID);
    expect(FLOW_FIELD_TSL_GRAPH.id).toBe("flow-field-tsl");
    expect(typeof FLOW_FIELD_TSL_GRAPH.factory).toBe("function");
  });

  it("builds a colour node without throwing, given the declared params", () => {
    const node = FLOW_FIELD_TSL_GRAPH.factory(stubInputs({ speed: 0.15, scale: 3, warp: 0.6 }));
    expect(node).toBeTruthy();
  });

  it("builds even when params are missing (falls back to defaults)", () => {
    const node = FLOW_FIELD_TSL_GRAPH.factory(stubInputs({}));
    expect(node).toBeTruthy();
  });
});
