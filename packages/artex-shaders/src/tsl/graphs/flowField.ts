/**
 * Flow Field — original WebGPU/TSL shader graph.
 *
 * A value-noise domain warp: screen UVs are pushed along an fbm flow field and
 * re-sampled, then coloured with a cosine palette. The motion drifts with
 * `time`, brightness pulses with `audioLevel`, and `speed` / `scale` / `warp`
 * are live-mutable params. WebGPU-inspired (klevron/test-webgpu) but authored
 * from scratch — no third-party shader code.
 */
import { uv, vec2, vec4, uniform, add, mul } from "three/tsl";
import type { Node } from "three/webgpu";
import type { TslGraphEntry, TslGraphFactory, TslScalarUniform, TslColorNode } from "@artex/contract/tsl";
import { fbm } from "../helpers/noise";
import { auroraPalette } from "../helpers/color";

// Re-exported, not declared: the id itself lives in the dependency-free
// `../scriptIds` module so light catalog surfaces can name this graph without
// pulling `three/tsl` (imported above at module scope). See that file for the
// route weld this removed. One definition, so the two cannot drift.
import { FLOW_FIELD_TSL_SCRIPT_ID } from "../scriptIds";

export { FLOW_FIELD_TSL_SCRIPT_ID };

type Vec2Node = Node<"vec2">;
type FloatNode = Node<"float">;

const param = (uniforms: Map<string, TslScalarUniform>, name: string, fallback: number): TslScalarUniform =>
  uniforms.get(name) ?? uniform(fallback);

const flowFieldFactory: TslGraphFactory = ({ uniforms, time, interaction }) => {
  const speed = param(uniforms, "speed", 0.15);
  const scale = param(uniforms, "scale", 3.0);
  const warp = param(uniforms, "warp", 0.6);

  const p = uv();
  const drift = mul(time, speed) as FloatNode;

  // Two decorrelated fbm channels form the flow vector.
  const flowX = fbm(add(mul(p, scale), drift) as Vec2Node);
  const flowY = fbm(add(add(mul(p, scale), vec2(5.2, 1.3)), drift) as Vec2Node);
  const flow = vec2(flowX, flowY) as Vec2Node;

  // Warp the coordinates along the flow, then sample the field again.
  const warped = add(p, mul(flow, warp)) as Vec2Node;
  const field = fbm(mul(warped, scale) as Vec2Node);

  const color = auroraPalette(add(field, mul(time, 0.05)) as FloatNode);
  const lit = mul(color, add(1.0, mul(interaction.audioLevel, 0.5)));

  return vec4(lit, 1.0) as unknown as TslColorNode;
};

export const FLOW_FIELD_TSL_GRAPH: TslGraphEntry = {
  id: FLOW_FIELD_TSL_SCRIPT_ID,
  label: "Flow Field",
  description: "Value-noise domain warp coloured with a cosine palette; drifts over time and pulses with sound.",
  tags: ["webgpu", "tsl", "flow", "noise", "procedural"],
  factory: flowFieldFactory,
};
