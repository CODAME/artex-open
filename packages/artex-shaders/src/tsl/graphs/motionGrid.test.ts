import { describe, it, expect } from "vitest";
import { uniform, texture } from "three/tsl";
import { DataTexture, Vector2 } from "three/webgpu";
import type { TslPassInputs } from "@artex/contract/tsl";
import { BUILTIN_TSL_GRAPHS_BY_ID } from "../index";
import { MOTION_GRID_TSL_SCRIPT_ID as SCRIPT_ID_FROM_LIGHT_MODULE } from "../scriptIds";
import {
  MOTION_GRID_DEFAULT_PARAMS,
  MOTION_GRID_TSL_GRAPH,
  MOTION_GRID_TSL_SCRIPT_ID,
} from "./motionGrid";

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

describe("motionGrid TSL graph", () => {
  it("has a stable scriptId, defined once, and is registered", () => {
    expect(MOTION_GRID_TSL_SCRIPT_ID).toBe("motion-grid-tsl");
    expect(SCRIPT_ID_FROM_LIGHT_MODULE).toBe(MOTION_GRID_TSL_SCRIPT_ID);
    expect(MOTION_GRID_TSL_GRAPH.id).toBe(MOTION_GRID_TSL_SCRIPT_ID);
    expect(BUILTIN_TSL_GRAPHS_BY_ID[MOTION_GRID_TSL_SCRIPT_ID]).toBe(MOTION_GRID_TSL_GRAPH.factory);
  });

  it("builds with the declared params, and with none", () => {
    expect(MOTION_GRID_TSL_GRAPH.factory(stubInputs({ ...MOTION_GRID_DEFAULT_PARAMS }).inputs)).toBeTruthy();
    expect(MOTION_GRID_TSL_GRAPH.factory(stubInputs({}).inputs)).toBeTruthy();
  });

  it("reads previousSource, which is what asks the compositor to keep a frame of history", () => {
    const stub = stubInputs({});
    MOTION_GRID_TSL_GRAPH.factory(stub.inputs);
    expect(stub.readsHistory()).toBe(true);
  });
});
