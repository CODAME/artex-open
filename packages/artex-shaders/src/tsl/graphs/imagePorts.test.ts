import { describe, it, expect } from "vitest";
import { uniform, texture } from "three/tsl";
import { DataTexture, Vector2 } from "three/webgpu";
import type { TslGraphEntry, TslPassInputs, TslScalarUniform } from "@artex/contract/tsl";
import { BUILTIN_TSL_GRAPHS_BY_ID } from "../index";
import {
  LIVING_FIELD_TSL_LIVE_UNIFORMS,
  LIVING_FIELD_TSL_LIVE_VECTORS,
  PHONE_CHROMATIC_WARP_TSL_LIVE_UNIFORMS,
  PHONE_GLITCH_SPLIT_TSL_LIVE_UNIFORMS,
  TSL_GRAPH_LIVE_UNIFORMS,
} from "../scriptIds";
import { stubFaceInputs, stubImageInputs, stubLiveVectors } from "../testing/stubImageInputs";
import { PHONE_CHROMATIC_WARP_TSL_GRAPH } from "./phoneChromaticWarp";
import { PHONE_GLITCH_SPLIT_TSL_GRAPH } from "./phoneGlitchSplit";
import { LIVING_FIELD_TSL_GRAPH } from "./livingField";

function build(graph: TslGraphEntry): { scalars: Set<string>; vectors: Set<string> } {
  const tex = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  tex.needsUpdate = true;
  const uniforms = new Map<string, TslScalarUniform>();
  const scalars = new Set<string>();
  const lv = stubLiveVectors();
  const inputs: TslPassInputs = {
    source: texture(tex),
    prevPass: texture(tex),
    previousSource: texture(tex),
    uniforms,
    image: stubImageInputs(),
    face: stubFaceInputs(),
    liveVec2: lv.liveVec2,
    liveVec3: lv.liveVec3,
    liveUniform(name: string, initial = 0) {
      scalars.add(name);
      return uniforms.get(name) ?? uniform(initial);
    },
    time: uniform(0),
    resolution: uniform(new Vector2(1, 1)),
    interaction: { audioLevel: uniform(0), bassLevel: uniform(0), proximity: uniform(0), cameraLevel: uniform(0) },
  };
  expect(graph.factory(inputs)).toBeTruthy();
  return { scalars, vectors: new Set(lv.vectors.keys()) };
}

describe("ported artwork graphs", () => {
  it.each([
    ["phone-chromatic-warp-tsl", PHONE_CHROMATIC_WARP_TSL_GRAPH, PHONE_CHROMATIC_WARP_TSL_LIVE_UNIFORMS],
    ["phone-glitch-split-tsl", PHONE_GLITCH_SPLIT_TSL_GRAPH, PHONE_GLITCH_SPLIT_TSL_LIVE_UNIFORMS],
    ["artex-living-field-tsl", LIVING_FIELD_TSL_GRAPH, LIVING_FIELD_TSL_LIVE_UNIFORMS],
  ] as const)("%s is stable, registered, and declares exactly its listed live uniforms", (id, graph, listed) => {
    expect(graph.id).toBe(id);
    expect(BUILTIN_TSL_GRAPHS_BY_ID[id]).toBe(graph.factory);
    expect(TSL_GRAPH_LIVE_UNIFORMS[id]).toBe(listed);
    expect([...build(graph).scalars].sort()).toEqual([...listed].sort());
  });

  it("the Living Field declares its vec2 / vec3 inputs by their GLSL names", () => {
    expect([...build(LIVING_FIELD_TSL_GRAPH).vectors].sort()).toEqual(Object.values(LIVING_FIELD_TSL_LIVE_VECTORS).sort());
    expect(build(PHONE_GLITCH_SPLIT_TSL_GRAPH).vectors.size).toBe(0);
  });
});
