/**
 * A 3×5 pixel font for short HUD labels drawn inside a TSL graph.
 *
 * Original glyph design (a 3×5 grid leaves little room for anything else).
 * Each glyph is packed into a 15-bit integer, row-major from the top-left, and
 * read back with float math so it compiles on every TSL backend.
 *
 * `drawLabel` takes device pixels measured from the label's top-left with y
 * growing DOWN (row 0 is the top row), which is how uv y reads on the ARTEX
 * WebGPU compositor.
 */
import { float, floor, mod, abs, step, exp2, clamp, add, sub, mul, div } from "three/tsl";
import type { Node } from "three/webgpu";

type FloatNode = Node<"float">;

/** Glyph order: indices 0-15 are the hex digits, so a hex digit's value IS its glyph index. */
const GLYPH_ORDER = "0123456789ABCDEFMPRSTx_/.- ";

const GLYPH_ROWS: Readonly<Record<string, readonly string[]>> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  A: ["010", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"],
  C: ["011", "100", "100", "100", "011"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"],
  F: ["111", "100", "110", "100", "100"],
  M: ["101", "111", "111", "101", "101"],
  P: ["110", "101", "110", "100", "100"],
  R: ["110", "101", "110", "101", "101"],
  S: ["011", "100", "010", "001", "110"],
  T: ["111", "010", "010", "010", "010"],
  x: ["000", "101", "010", "101", "000"],
  _: ["000", "000", "000", "000", "111"],
  "/": ["001", "001", "010", "100", "100"],
  ".": ["000", "000", "000", "000", "010"],
  "-": ["000", "000", "111", "000", "000"],
  " ": ["000", "000", "000", "000", "000"],
};

/** The characters of an ASCII string. Every string here is ASCII, so indexing is exact. */
const chars = (text: string): string[] => Array.from({ length: text.length }, (_, i) => text.charAt(i));

const GLYPH_CODES: readonly number[] = chars(GLYPH_ORDER).map((ch) =>
  chars(GLYPH_ROWS[ch].join("")).reduce((code, bit, i) => (bit === "1" ? code + 2 ** i : code), 0),
);

/** Font pixels per glyph cell, including one column of spacing. */
export const GLYPH_ADVANCE = 4;
export const GLYPH_HEIGHT = 5;

/** A label slot: a fixed glyph index, or a node computing one (a digit, a hex nibble). */
export type LabelSlot = number | FloatNode;

/** The glyph index for a character, for building label slots. */
export function glyph(ch: string): number {
  const index = GLYPH_ORDER.indexOf(ch);
  if (index < 0) throw new Error(`pixelFont has no glyph for "${ch}"`);
  return index;
}

/** Fixed slots for a whole string. */
export function glyphs(text: string): number[] {
  return chars(text).map(glyph);
}

/** 1 where `a` equals the integer `k`, else 0. */
function equals(a: FloatNode, k: number): FloatNode {
  return sub(1, step(0.5, abs(sub(a, k))));
}

/** Decimal digit `place` (0 = ones) of a non-negative integer node, as a glyph index. */
export function decimalDigit(value: FloatNode, place: number): FloatNode {
  return floor(mod(floor(div(value, 10 ** place)), 10));
}

/** Hex nibble `place` (0 = lowest) of a non-negative integer node, as a glyph index. */
export function hexDigit(value: FloatNode, place: number): FloatNode {
  return floor(mod(floor(div(value, 16 ** place)), 16));
}

/**
 * 1 on the label's lit pixels, else 0. `x` and `y` are device pixels from the
 * label's top-left corner; `scale` is device pixels per font pixel.
 */
export function drawLabel(slots: readonly LabelSlot[], x: FloatNode, y: FloatNode, scale: FloatNode): FloatNode {
  const fx = div(x, scale);
  const fy = div(y, scale);
  const slot = floor(div(fx, GLYPH_ADVANCE)) as unknown as FloatNode;
  const column = sub(fx, mul(slot, GLYPH_ADVANCE));
  const inside = mul(
    mul(step(0, fx), sub(1, step(slots.length * GLYPH_ADVANCE, fx))),
    mul(mul(step(0, fy), sub(1, step(GLYPH_HEIGHT, fy))), sub(1, step(3, column))),
  );

  let glyphIndex: FloatNode = float(0);
  slots.forEach((value, i) => {
    glyphIndex = add(glyphIndex, mul(value, equals(slot, i)));
  });
  let code: FloatNode = float(0);
  GLYPH_CODES.forEach((bits, k) => {
    if (bits !== 0) code = add(code, mul(bits, equals(glyphIndex, k)));
  });

  // Clamped: outside the label `bit` runs far negative, exp2 underflows, and
  // code / 0 makes mod() NaN, which survives the `inside` mask (0 × NaN) and
  // blanks every label sharing the pixel.
  const bit = clamp(add(mul(floor(fy), 3), floor(column)), 0, 14);
  const lit = floor(mod(div(code, exp2(bit)), 2));
  return mul(inside, lit);
}
