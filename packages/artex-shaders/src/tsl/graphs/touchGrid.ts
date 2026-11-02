/**
 * Touch Grid — original WebGPU/TSL shader graph.
 *
 * A wall of surveillance-style cells, each one a camera looking at the source
 * (a photo, a video, or the live webcam) through frosted glass.
 *
 * The glass model is what makes it read as real: blur and haze grow with each
 * pixel's own distance from the glass, not the cell's. A hand approaching is
 * tilted, its top (fingertips) leading, so the pads arrive first as dark,
 * nearly sharp marks while the palm is still a pale smear; pressed flat, the
 * whole hand sharpens into a charcoal silhouette with a soft halo. Each camera
 * runs its own approach: the subject rises into frame from below and grows as
 * it nears the glass, then falls back. The grid re-cuts on a rhythm, the odd
 * camera flips negative, and each carries a `CAM_nn // 0xhhhh` id and a
 * ticking `SRC_n.MP4 // T-n.nn` readout.
 *
 * Works best with a dark subject against a bright background — a hand against
 * a window, a lightbox, or a white wall — which is what frosted glass shows.
 * Orientation, measured in the browser: on the ARTEX WebGPU compositor uv y
 * grows DOWN the screen, while source textures (three's default flipY) store
 * the picture's top at v = 1. The graph works in screen-down coordinates and
 * flips v only where it samples, so the top of the picture is the end that
 * touches the glass first and labels read upright.
 *
 * Like `motionGrid.ts`, it does not read `interaction.cameraLevel` (#4795), and
 * it does not read `previousSource`, so the compositor keeps no history.
 *
 * Authored from scratch; no third-party shader code. See LICENSES.md for the
 * piece that prompted it.
 */
import {
  uv,
  vec2,
  vec3,
  vec4,
  float,
  floor,
  fract,
  cos,
  exp,
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
import { hash21, hash22 } from "../helpers/noise";
import { decimalDigit, drawLabel, GLYPH_ADVANCE, GLYPH_HEIGHT, glyph, glyphs, hexDigit, type LabelSlot } from "../helpers/pixelFont";
import { TOUCH_GRID_TSL_SCRIPT_ID } from "../scriptIds";

export { TOUCH_GRID_TSL_SCRIPT_ID };

type Vec2Node = Node<"vec2">;
type Vec3Node = Node<"vec3">;
type FloatNode = Node<"float">;

/** Defaults, exported so the experiment page and the tests agree with the graph. */
export const TOUCH_GRID_DEFAULT_PARAMS = {
  /** Columns; rows follow the frame so cells stay a little taller than wide. */
  cells: 4,
  /** Seconds between re-cuts of the grid (0 = the grid never changes). */
  rhythm: 4,
  /** Approach cycles per second, per camera (each runs a little faster or slower). */
  pace: 0.1,
  /** Blur at full distance from the glass, as a fraction of the frame height. */
  frost: 0.045,
  /** How fast distance fades the subject into the glass (0 = never). */
  haze: 0.55,
  /** How far the top of the subject leads the rest toward the glass (0 = flat). */
  tilt: 1,
  /** How far the subject sinks and shrinks when away from the glass (0 = held in place). */
  rise: 0.35,
  /** Pushes the picture toward a hard dark-on-light silhouette (0-1). */
  silhouette: 0.5,
  /** How differently each camera frames the picture (0 = all show the whole frame). */
  framing: 0.3,
  /** Warm paper and charcoal ink instead of neutral grey (0-1). */
  tint: 1,
  /** Film grain (0-1). */
  grain: 0.5,
  /** Chance that a camera shows its negative, re-rolled at every cut (0-1). */
  invert: 0.08,
  /** Strength of the red camera labels. */
  hud: 1,
  /** Strength of the dark gutters between cameras. */
  lines: 1,
} as const;

type ParamName = keyof typeof TOUCH_GRID_DEFAULT_PARAMS;

/** Slider bounds for each param: [min, max, step]. */
export const TOUCH_GRID_PARAM_RANGES: Readonly<Record<ParamName, readonly [number, number, number]>> = {
  cells: [1, 8, 1],
  rhythm: [0, 12, 0.5],
  pace: [0, 0.5, 0.01],
  frost: [0, 0.1, 0.005],
  haze: [0, 1, 0.05],
  tilt: [0, 2, 0.05],
  rise: [0, 1, 0.05],
  silhouette: [0, 1, 0.05],
  framing: [0, 1, 0.05],
  tint: [0, 1, 0.05],
  grain: [0, 1, 0.05],
  invert: [0, 1, 0.01],
  hud: [0, 1, 0.05],
  lines: [0, 1, 0.05],
};

const param = (uniforms: Map<string, TslScalarUniform>, name: ParamName): FloatNode =>
  uniforms.get(name) ?? float(TOUCH_GRID_DEFAULT_PARAMS[name]);

/** Cell height over width relative to the frame; 0.7 gives a 4×5 grid on a 9:16 frame. */
const CELL_SHAPE = 0.7;
/** Taps in the frosted-glass blur: a golden-angle disc, centre included. */
const BLUR_TAPS = 16;
const GOLDEN_ANGLE = 2.399963;
/** Glass diffuses a little even where the subject touches it. */
const CONTACT_FROST = 0.08;
/** `haze` 1 fades a subject at full distance to ~0.3% visible. */
const HAZE_RATE = 8;
const LUMA = vec3(0.2126, 0.7152, 0.0722);
const PAPER = vec3(0.962, 0.954, 0.938);
const INK = vec3(0.105, 0.1, 0.098);
const LABEL_RED = vec3(0.78, 0.2, 0.26);
const GUTTER = vec3(0.06, 0.06, 0.07);
const GRAIN_AMOUNT = 0.06;
/** Label inset from the cell corner, and the cell width per font pixel of scale. */
const LABEL_MARGIN = 6;
const LABEL_WIDTH_PER_SCALE = 150;
const SPACE = glyph(" ");

/** Unit-disc offsets for the blur, evenly spread by area. */
const BLUR_OFFSETS: readonly (readonly [number, number])[] = Array.from({ length: BLUR_TAPS }, (_, i) => {
  const r = Math.sqrt((i + 0.5) / BLUR_TAPS);
  const a = i * GOLDEN_ANGLE;
  return [Math.cos(a) * r, Math.sin(a) * r] as const;
});

/**
 * Disc blur of the source's luminance around `at` (screen-down coordinates);
 * outside the source reads as lit glass (1).
 */
function frostedLuminance(source: TslTextureUniform, at: Vec2Node, radius: Vec2Node): FloatNode {
  let summed: FloatNode = float(0);
  for (const [dx, dy] of BLUR_OFFSETS) {
    const tap = add(at, mul(vec2(dx, dy), radius)) as Vec2Node;
    const inside = mul(mul(step(0, tap.x), step(tap.x, 1)), mul(step(0, tap.y), step(tap.y, 1)));
    const upright = vec2(tap.x, sub(1, tap.y));
    const lum = dot(source.sample(clamp(upright, vec2(0, 0), vec2(1, 1))).rgb, LUMA);
    summed = add(summed, mix(float(1), lum, inside));
  }
  return div(summed, BLUR_TAPS);
}

const slotNode = (slot: LabelSlot): FloatNode => (typeof slot === "number" ? float(slot) : slot);

/** The two camera labels for one cell, as label slots. */
function cameraLabels(cellNumber: FloatNode, idSeed: FloatNode, countdown: FloatNode, srcSeed: FloatNode) {
  const id = floor(mul(idSeed, 65536)) as FloatNode;
  const src = floor(mul(srcSeed, 8)) as FloatNode;
  const t = floor(mul(clamp(countdown, 0, 9.99), 100)) as FloatNode;
  const top: LabelSlot[] = [
    ...glyphs("CAM_"),
    decimalDigit(cellNumber, 1),
    decimalDigit(cellNumber, 0),
    ...glyphs(" // 0x"),
    hexDigit(id, 3),
    hexDigit(id, 2),
    hexDigit(id, 1),
    hexDigit(id, 0),
  ];
  const bottom: LabelSlot[] = [
    ...glyphs("SRC_"),
    decimalDigit(src, 0),
    ...glyphs(".MP4 // T-"),
    decimalDigit(t, 2),
    ...glyphs("."),
    decimalDigit(t, 1),
    decimalDigit(t, 0),
  ];
  return { top, bottom };
}

const touchGridFactory: TslGraphFactory = ({ source, uniforms, time, resolution }) => {
  const rhythm = param(uniforms, "rhythm");
  const pace = param(uniforms, "pace");
  const frost = param(uniforms, "frost");
  const haze = param(uniforms, "haze");
  const tilt = param(uniforms, "tilt");
  const rise = param(uniforms, "rise");
  const silhouette = param(uniforms, "silhouette");
  const framing = param(uniforms, "framing");
  const tint = param(uniforms, "tint");
  const grain = param(uniforms, "grain");
  const invert = param(uniforms, "invert");
  const hud = param(uniforms, "hud");
  const lines = param(uniforms, "lines");

  // The grid re-cuts every `rhythm` seconds: one column more or fewer, and a
  // fresh roll for every camera. rhythm 0 holds the grid exactly at `cells`.
  const cutting = step(0.001, rhythm);
  const cut = mul(floor(div(time, max(rhythm, 0.001))), cutting);
  const variation = mul(sub(floor(mul(hash21(vec2(cut, 7.7)), 3)), 1), cutting);
  const cols = max(add(floor(param(uniforms, "cells")), variation), 1);
  const aspect = div(resolution.y, max(resolution.x, 1));
  const rows = max(floor(add(mul(mul(cols, aspect), CELL_SHAPE), 0.5)), 1);
  const gridSize = vec2(cols, rows);

  const p = uv();
  const gridPos = mul(p, gridSize) as Vec2Node;
  const cell = floor(gridPos) as Vec2Node;
  const local = fract(gridPos) as Vec2Node;
  const cellId = add(cell, mul(vec2(31.7, 17.3), cut)) as Vec2Node;
  const seedA = hash22(cellId);
  const seedB = hash22(add(cellId, vec2(5.1, 9.4)));

  // The approach: mostly away from the glass, briefly pressed flat to it.
  const phase = add(mul(mul(time, pace), add(0.7, mul(seedA.y, 0.6))), seedB.x);
  const wave = sub(0.5, mul(cos(mul(phase, Math.PI * 2)), 0.5));
  const press = smoothstep(0.15, 0.9, wave) as FloatNode;
  const away = sub(1, press);

  // Each camera is a window onto the source with the cell's proportions
  // (cover-fit), zoomed in by up to 1 + framing and panned at random. Away from
  // the glass the subject sinks and shrinks; it rises and grows as it nears.
  const window0 = div(vec2(rows, cols), max(cols, rows)) as Vec2Node;
  const zoom = mul(add(1, mul(seedA.x, framing)), add(1, mul(mul(press, rise), 0.6)));
  const view = div(window0, zoom) as Vec2Node;
  const centre = add(vec2(0.5, 0.5), mul(sub(seedB, 0.5), sub(vec2(1, 1), view))) as Vec2Node;
  // Sampling higher in the source draws the subject lower on screen.
  const sink = vec2(0, mul(away, rise));
  const at = sub(add(centre, mul(sub(local, 0.5), view)), sink) as Vec2Node;

  // Each pixel's own distance from the glass: the top of the subject leads.
  const distance = mul(away, add(1, mul(tilt, clamp(at.y, 0, 1)))) as FloatNode;
  const radius = mul(mul(vec2(aspect, 1), mul(frost, add(distance, CONTACT_FROST))), zoom) as Vec2Node;
  const lum = frostedLuminance(source, at, radius);
  const graded = mix(lum, smoothstep(0.15, 0.65, lum), silhouette);
  const visible = exp(mul(mul(haze, -HAZE_RATE), distance));
  const shade = mix(float(1), graded, visible) as FloatNode;

  // Paper and ink: neutral grey at tint 0, warm glass and charcoal at 1.
  const paper = mix(vec3(1, 1, 1), PAPER, tint);
  const ink = mix(vec3(0, 0, 0), INK, tint);
  const glass = mix(ink, paper, shade) as Vec3Node;

  // An occasional negative, re-rolled at every cut.
  const negative = step(fract(add(mul(seedA.x, 13.7), mul(seedB.y, 7.3))), mul(invert, 0.999));
  const toned = mix(glass, sub(vec3(1, 1, 1), glass), negative) as Vec3Node;

  // Film grain, fresh every frame.
  const screenPx = mul(p, resolution) as Vec2Node;
  const noise = sub(hash21(add(screenPx, mul(vec2(113.1, 71.7), fract(mul(time, 0.37))))), 0.5);
  const grained = add(toned, mul(noise, mul(grain, GRAIN_AMOUNT)));

  // Camera labels: an id top-left, a ticking readout bottom-right. One
  // drawLabel call serves both, switching slots and origin by which half of
  // the cell a pixel is in, which halves the per-pixel glyph lookups.
  const cellPixels = div(resolution, gridSize) as Vec2Node;
  const px = mul(local, cellPixels) as Vec2Node;
  const scale = max(floor(div(cellPixels.x, LABEL_WIDTH_PER_SCALE)), 1) as FloatNode;
  const cellNumber = add(cell.x, mul(cell.y, cols)) as FloatNode;
  const countdown = mul(away, 2) as FloatNode;
  const labels = cameraLabels(cellNumber, seedB.y, countdown, seedA.x);
  const isTop = step(px.y, mul(cellPixels.y, 0.5));
  const slots = labels.bottom.map((bottom, i) => mix(slotNode(bottom), slotNode(labels.top[i] ?? SPACE), isTop));
  const bottomWidth = mul(scale, labels.bottom.length * GLYPH_ADVANCE);
  const labelX = mix(sub(px.x, sub(sub(cellPixels.x, LABEL_MARGIN), bottomWidth)), sub(px.x, LABEL_MARGIN), isTop) as FloatNode;
  const labelY = mix(
    sub(px.y, sub(sub(cellPixels.y, LABEL_MARGIN), mul(scale, GLYPH_HEIGHT))),
    sub(px.y, LABEL_MARGIN),
    isTop,
  ) as FloatNode;
  const labelWeight = mul(drawLabel(slots, labelX, labelY, scale), mul(hud, 0.9));
  const rgb = mix(grained, LABEL_RED, labelWeight);

  // One-pixel dark gutters between cameras.
  const edgePixels = mul(min(local, sub(1, local)), cellPixels) as Vec2Node;
  const onLine = sub(1, smoothstep(0, 1.25, min(edgePixels.x, edgePixels.y)));
  const out = mix(rgb, GUTTER, mul(onLine, lines));

  return vec4(clamp(out, vec3(0, 0, 0), vec3(1, 1, 1)), 1);
};

export const TOUCH_GRID_TSL_GRAPH: TslGraphEntry = {
  id: TOUCH_GRID_TSL_SCRIPT_ID,
  label: "Touch Grid",
  description:
    "A grid of cameras watching a photo, video, or live webcam through frosted glass, each pressing in and out of focus.",
  tags: ["webgpu", "tsl", "camera", "webcam", "grid", "silhouette", "frosted glass"],
  factory: touchGridFactory,
};
