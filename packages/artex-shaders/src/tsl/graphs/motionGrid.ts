/**
 * Motion Grid — original WebGPU/TSL shader graph.
 *
 * Cuts the source (a photo, a video, or the live webcam) into a grid of cells
 * that break apart where the picture moves. Each cell measures its own motion
 * on the GPU by comparing the source with the previous frame
 * (`previousSource`), then shifts and stretches the image it shows by that
 * amount: still areas hold together, moving ones smear into slit-scan streaks.
 * The more movement, the more abstraction.
 *
 * It deliberately does NOT read `interaction.cameraLevel`. That uniform means
 * different things depending on where a piece plays (gesture activity in the
 * Studio preview, presence or movement energy in the player), so a piece
 * built on it would behave one way in the editor and another once published.
 * Motion measured from the pixels is the same everywhere the graph runs.
 *
 * Authored from scratch; no third-party shader code.
 */
import {
  uv,
  vec2,
  vec3,
  vec4,
  float,
  floor,
  fract,
  abs,
  clamp,
  dot,
  max,
  min,
  mix,
  smoothstep,
  step,
  add,
  sub,
  mul,
  div,
} from "three/tsl";
import type { Node } from "three/webgpu";
import type {
  TslGraphEntry,
  TslGraphFactory,
  TslScalarUniform,
  TslTextureUniform,
} from "@artex/contract/tsl";
import { hash22 } from "../helpers/noise";
import { MOTION_GRID_TSL_SCRIPT_ID } from "../scriptIds";

export { MOTION_GRID_TSL_SCRIPT_ID };

type Vec2Node = Node<"vec2">;
type Vec3Node = Node<"vec3">;
type FloatNode = Node<"float">;

/** Defaults, exported so the Studio template and the tests agree with the graph. */
export const MOTION_GRID_DEFAULT_PARAMS = {
  /** Cells across the frame; rows follow the frame's aspect so cells stay square. */
  cells: 16,
  /** Abstraction held even when nothing moves (0 = an intact picture behind a grid). */
  abstraction: 0.06,
  /** How strongly measured motion breaks a cell apart. */
  response: 1,
  /** How far a broken cell reaches for its picture, in cells. */
  displacement: 2.5,
  /** How far a broken cell streaks its picture (0 = shift only, 1 = full slit-scan). */
  stretch: 1,
  /** Grid line strength. */
  lines: 0.5,
  /** Per-pixel change ignored as sensor noise (0-1 colour difference). */
  threshold: 0.03,
  /** Gain applied to motion above the threshold. */
  sensitivity: 10,
} as const;

type ParamName = keyof typeof MOTION_GRID_DEFAULT_PARAMS;

const param = (uniforms: Map<string, TslScalarUniform>, name: ParamName): FloatNode =>
  uniforms.get(name) ?? float(MOTION_GRID_DEFAULT_PARAMS[name]);

/** Where each cell samples to measure its motion, in cell units from its centre. */
const MOTION_TAPS: readonly (readonly [number, number])[] = [
  [0, 0],
  [-0.3, -0.3],
  [0.3, -0.3],
  [-0.3, 0.3],
  [0.3, 0.3],
];

/** Mean absolute colour change between two frames at one point, 0-1. */
function frameDifference(
  current: TslTextureUniform,
  previous: TslTextureUniform,
  at: Vec2Node,
): FloatNode {
  const delta = abs(sub(current.sample(at).rgb, previous.sample(at).rgb)) as unknown as Vec3Node;
  return dot(delta, vec3(1 / 3, 1 / 3, 1 / 3));
}

const motionGridFactory: TslGraphFactory = ({ source, previousSource, uniforms, resolution }) => {
  const cells = max(param(uniforms, "cells"), 1);
  const abstraction = param(uniforms, "abstraction");
  const response = param(uniforms, "response");
  const displacement = param(uniforms, "displacement");
  const stretch = param(uniforms, "stretch");
  const lines = param(uniforms, "lines");
  const threshold = param(uniforms, "threshold");
  const sensitivity = param(uniforms, "sensitivity");

  // Square cells: the row count follows the frame's aspect.
  const aspect = div(resolution.y, max(resolution.x, 1));
  const rows = max(floor(add(mul(cells, aspect), 0.5)), 1);
  const gridSize = vec2(cells, rows) as unknown as Vec2Node;
  const cellSize = div(vec2(1, 1), gridSize) as unknown as Vec2Node;

  const p = uv() as unknown as Vec2Node;
  const gridPos = mul(p, gridSize) as unknown as Vec2Node;
  const cell = floor(gridPos) as unknown as Vec2Node;
  const local = fract(gridPos) as unknown as Vec2Node;
  const centre = mul(add(cell, 0.5), cellSize) as unknown as Vec2Node;

  // Motion for the whole cell, so every pixel in it moves together.
  let summed: FloatNode = float(0);
  for (const [dx, dy] of MOTION_TAPS) {
    const at = add(centre, mul(vec2(dx, dy), cellSize)) as unknown as Vec2Node;
    summed = add(summed, frameDifference(source, previousSource, at));
  }
  const change = div(summed, MOTION_TAPS.length);
  const motion = clamp(mul(sub(change, threshold), sensitivity), 0, 1);
  const amount = clamp(add(abstraction, mul(motion, response)), 0, 1) as unknown as FloatNode;

  // Per-cell randomness picks the direction of the shift and the streak axis.
  const shiftSeed = hash22(cell);
  const axisSeed = hash22(add(cell, vec2(17.3, 41.9)));
  const offset = mul(mul(sub(shiftSeed, 0.5), cellSize), mul(amount, displacement));

  // Streak along one axis: squeeze the cell's footprint toward a line, which
  // stretches whatever sits on it across the whole cell.
  const horizontal = step(0.5, axisSeed.x);
  const streak = clamp(mul(amount, stretch), 0, 1);
  const zoom = vec2(
    mix(float(1), float(0.06), mul(horizontal, streak)),
    mix(float(1), float(0.06), mul(sub(1, horizontal), streak)),
  );

  const footprint = mul(mul(sub(local, 0.5), cellSize), zoom);
  const sampleAt = clamp(add(add(centre, offset), footprint), vec2(0, 0), vec2(1, 1)) as unknown as Vec2Node;
  const picture = source.sample(sampleAt).rgb as unknown as Vec3Node;

  // One-pixel grid lines, firmer where a cell has broken apart.
  const cellPixels = div(resolution, gridSize) as unknown as Vec2Node;
  const edgePixels = mul(min(local, sub(1, local)), cellPixels) as unknown as Vec2Node;
  const edge = min(edgePixels.x, edgePixels.y);
  const onLine = sub(1, smoothstep(0, 1.25, edge));
  const lineWeight = mul(mul(onLine, lines), add(0.4, mul(amount, 0.6)));
  const rgb = mix(picture, mul(picture, 0.12), lineWeight);

  return vec4(rgb, 1);
};

export const MOTION_GRID_TSL_GRAPH: TslGraphEntry = {
  id: MOTION_GRID_TSL_SCRIPT_ID,
  label: "Motion Grid",
  description: "Cuts a photo, video, or live webcam into a grid that breaks apart where the picture moves.",
  tags: ["webgpu", "tsl", "camera", "webcam", "motion", "grid", "portrait"],
  factory: motionGridFactory,
};
