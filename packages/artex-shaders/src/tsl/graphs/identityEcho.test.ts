import { describe, it, expect } from "vitest";
import { uniform, texture } from "three/tsl";
import { DataTexture, Vector2 } from "three/webgpu";
import type { TslPassInputs, TslScalarUniform } from "@artex/contract/tsl";
import { BUILTIN_TSL_GRAPHS_BY_ID } from "../index";
import {
  IDENTITY_ECHO_TSL_LIVE_UNIFORMS,
  IDENTITY_ECHO_TSL_SCRIPT_ID as SCRIPT_ID_FROM_LIGHT_MODULE,
  tslScriptIdForGlslShader,
} from "../scriptIds";
import { stubChannelInputs, stubFaceInputs, stubImageInputs, stubLiveVectors } from "../testing/stubImageInputs";
import { IDENTITY_ECHO_TSL_GRAPH, IDENTITY_ECHO_TSL_SCRIPT_ID } from "./identityEcho";

function stubInputs(): { inputs: TslPassInputs; declared: Map<string, number>; readsHistory: () => boolean } {
  const tex = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  tex.needsUpdate = true;
  let read = false;
  const previous = texture(tex);
  const declared = new Map<string, number>();
  const uniforms = new Map<string, TslScalarUniform>();
  const inputs: TslPassInputs = {
    source: texture(tex),
    prevPass: texture(tex),
    get previousSource() {
      read = true;
      return previous;
    },
    uniforms,
    time: uniform(0),
    resolution: uniform(new Vector2(1, 1)),
    liveUniform(name, initial = 0) {
      declared.set(name, initial);
      const node = uniforms.get(name) ?? uniform(initial);
      uniforms.set(name, node);
      return node;
    },
    ...stubLiveVectors(),
    image: stubImageInputs(),
    face: stubFaceInputs(),
    channels: stubChannelInputs(),
    interaction: {
      audioLevel: uniform(0),
      bassLevel: uniform(0),
      proximity: uniform(0),
      cameraLevel: uniform(0),
    },
  };
  return { inputs, declared, readsHistory: () => read };
}

describe("identityEcho TSL graph", () => {
  it("has a stable scriptId, defined once, and is registered", () => {
    expect(IDENTITY_ECHO_TSL_SCRIPT_ID).toBe("identity-echo-tsl");
    expect(SCRIPT_ID_FROM_LIGHT_MODULE).toBe(IDENTITY_ECHO_TSL_SCRIPT_ID);
    expect(IDENTITY_ECHO_TSL_GRAPH.id).toBe(IDENTITY_ECHO_TSL_SCRIPT_ID);
    expect(BUILTIN_TSL_GRAPHS_BY_ID[IDENTITY_ECHO_TSL_SCRIPT_ID]).toBe(IDENTITY_ECHO_TSL_GRAPH.factory);
  });

  it("is the port of the identity-echo-artex builtin", () => {
    expect(tslScriptIdForGlslShader("identity-echo-artex")).toBe(IDENTITY_ECHO_TSL_SCRIPT_ID);
  });

  it("declares exactly the GLSL's three sliders, at ARTEX's 1.0 default", () => {
    const stub = stubInputs();
    IDENTITY_ECHO_TSL_GRAPH.factory(stub.inputs);
    expect([...stub.declared.keys()].sort()).toEqual([...IDENTITY_ECHO_TSL_LIVE_UNIFORMS].sort());
    expect([...stub.declared.values()]).toEqual([1, 1, 1]);
  });

  it("never reads previousSource, so the compositor keeps no frame history for it", () => {
    const stub = stubInputs();
    IDENTITY_ECHO_TSL_GRAPH.factory(stub.inputs);
    expect(stub.readsHistory()).toBe(false);
  });
});
