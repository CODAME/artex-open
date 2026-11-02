import { describe, it, expect } from "vitest";
import { uniform, texture } from "three/tsl";
import { DataTexture, Vector2 } from "three/webgpu";
import type { TslPassInputs } from "@artex/contract/tsl";
import { BUILTIN_TSL_GRAPHS_BY_ID } from "../index";
import { TOUCH_GRID_TSL_SCRIPT_ID as SCRIPT_ID_FROM_LIGHT_MODULE } from "../scriptIds";
import { TOUCH_GRID_DEFAULT_PARAMS, TOUCH_GRID_TSL_GRAPH, TOUCH_GRID_TSL_SCRIPT_ID } from "./touchGrid";

function stubInputs(params: Record<string, number>): { inputs: TslPassInputs; readsHistory: () => boolean } {
  const tex = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  tex.needsUpdate = true;
  let read = false;
  const previous = texture(tex);
  const inputs = {
    source: texture(tex),
    prevPass: texture(tex),
    get previousSource() {
      read = true;
      return previous;
    },
    uniforms: new Map(Object.entries(params).map(([k, v]) => [k, uniform(v)])),
    time: uniform(0),
    resolution: uniform(new Vector2(1, 1)),
    interaction: {
      audioLevel: uniform(0),
      bassLevel: uniform(0),
      proximity: uniform(0),
      cameraLevel: uniform(0),
    },
  } as unknown as TslPassInputs;
  return { inputs, readsHistory: () => read };
}

describe("touchGrid TSL graph", () => {
  it("has a stable scriptId, defined once, and is registered", () => {
    expect(TOUCH_GRID_TSL_SCRIPT_ID).toBe("touch-grid-tsl");
    expect(SCRIPT_ID_FROM_LIGHT_MODULE).toBe(TOUCH_GRID_TSL_SCRIPT_ID);
    expect(TOUCH_GRID_TSL_GRAPH.id).toBe(TOUCH_GRID_TSL_SCRIPT_ID);
    expect(BUILTIN_TSL_GRAPHS_BY_ID[TOUCH_GRID_TSL_SCRIPT_ID]).toBe(TOUCH_GRID_TSL_GRAPH.factory);
  });

  it("builds with the declared params, and with none", () => {
    expect(TOUCH_GRID_TSL_GRAPH.factory(stubInputs({ ...TOUCH_GRID_DEFAULT_PARAMS }).inputs)).toBeTruthy();
    expect(TOUCH_GRID_TSL_GRAPH.factory(stubInputs({}).inputs)).toBeTruthy();
  });

  it("never reads previousSource, so the compositor keeps no frame history for it", () => {
    const stub = stubInputs({});
    TOUCH_GRID_TSL_GRAPH.factory(stub.inputs);
    expect(stub.readsHistory()).toBe(false);
  });
});
