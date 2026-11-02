import { describe, it, expect } from "vitest";
import { uniform, texture } from "three/tsl";
import { DataTexture, Vector2 } from "three/webgpu";
import type { TslPassInputs, TslScalarUniform } from "@artex/contract/tsl";
import { BUILTIN_TSL_GRAPHS_BY_ID } from "../index";
import {
  FLOWER_SDF_TSL_LIVE_UNIFORMS,
  FLOWER_SDF_TSL_SCRIPT_ID as SCRIPT_ID_FROM_LIGHT_MODULE,
  TSL_GRAPH_LIVE_UNIFORMS,
} from "../scriptIds";
import { stubFaceInputs, stubImageInputs, stubLiveVectors } from "../testing/stubImageInputs";
import { FLOWER_SDF_DEFAULT_PARAMS, FLOWER_SDF_TSL_GRAPH, FLOWER_SDF_TSL_SCRIPT_ID } from "./flowerSdf";

function stubInputs(params: Record<string, number>): { inputs: TslPassInputs; declared: Set<string> } {
  const tex = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  tex.needsUpdate = true;
  const uniforms = new Map<string, TslScalarUniform>(Object.entries(params).map(([k, v]) => [k, uniform(v)]));
  const declared = new Set<string>();
  const inputs = {
    source: texture(tex),
    prevPass: texture(tex),
    previousSource: texture(tex),
    uniforms,
    image: stubImageInputs(),
    face: stubFaceInputs(),
    ...stubLiveVectors(),
    liveUniform(name: string, initial = 0) {
      declared.add(name);
      return uniforms.get(name) ?? uniform(initial);
    },
    time: uniform(0),
    resolution: uniform(new Vector2(1, 1)),
    interaction: {
      audioLevel: uniform(0),
      bassLevel: uniform(0),
      proximity: uniform(0),
      cameraLevel: uniform(0),
    },
  };
  return { inputs, declared };
}

describe("flowerSdf TSL graph", () => {
  it("has a stable scriptId, defined once, and is registered", () => {
    expect(FLOWER_SDF_TSL_SCRIPT_ID).toBe("flower-sdf-tsl");
    expect(SCRIPT_ID_FROM_LIGHT_MODULE).toBe(FLOWER_SDF_TSL_SCRIPT_ID);
    expect(FLOWER_SDF_TSL_GRAPH.id).toBe(FLOWER_SDF_TSL_SCRIPT_ID);
    expect(BUILTIN_TSL_GRAPHS_BY_ID[FLOWER_SDF_TSL_SCRIPT_ID]).toBe(FLOWER_SDF_TSL_GRAPH.factory);
  });

  it("builds with the demo params, and with none", () => {
    expect(FLOWER_SDF_TSL_GRAPH.factory(stubInputs({ ...FLOWER_SDF_DEFAULT_PARAMS }).inputs)).toBeTruthy();
    expect(FLOWER_SDF_TSL_GRAPH.factory(stubInputs({}).inputs)).toBeTruthy();
  });

  it("declares exactly the live uniforms the light catalog lists, so voice detection sees them", () => {
    const stub = stubInputs({});
    FLOWER_SDF_TSL_GRAPH.factory(stub.inputs);
    expect([...stub.declared].sort()).toEqual([...FLOWER_SDF_TSL_LIVE_UNIFORMS].sort());
    expect(TSL_GRAPH_LIVE_UNIFORMS[FLOWER_SDF_TSL_SCRIPT_ID]).toBe(FLOWER_SDF_TSL_LIVE_UNIFORMS);
  });
});
