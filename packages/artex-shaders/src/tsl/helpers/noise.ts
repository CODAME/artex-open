/**
 * License-clean TSL noise helpers.
 *
 * Clean-room reimplementations of well-known public-domain algorithms — NOT
 * ported from LYGIA (Prosperity, non-commercial) or any copyrighted shader.
 *
 *   - `hash21` / `hash22`: the integer-free hash popularised by Dave Hoskins
 *     ("Hash without Sine", CC0 / public domain).
 *   - `valueNoise2D`: standard bilinear value noise over the hash lattice.
 *   - `fbm`: fractional Brownian motion (summed octaves) — textbook math.
 *
 * Authored as node-building functions (not `Fn` wrappers) so they inline into a
 * graph and avoid `Fn` argument-typing friction. See docs/SHADERS.md.
 */
import { vec2, vec3, fract, floor, dot, add, sub, mul, mix } from "three/tsl";
import type { Node } from "three/webgpu";

type FloatNode = Node<"float">;
type Vec2Node = Node<"vec2">;

/** Hash a vec2 → float in [0, 1). Public-domain "hash without sine". */
export function hash21(p: Vec2Node): FloatNode {
  const p3 = fract(mul(vec3(p.x, p.y, p.x), 0.1031));
  const p3b = add(p3, dot(p3, add(p3.yzx, 33.33)));
  return fract(mul(add(p3b.x, p3b.y), p3b.z)) as unknown as FloatNode;
}

/** Hash a vec2 → vec2 in [0, 1). */
export function hash22(p: Vec2Node): Vec2Node {
  const p3 = fract(mul(vec3(p.x, p.y, p.x), vec3(0.1031, 0.103, 0.0973)));
  const p3b = add(p3, dot(p3, add(p3.yzx, 33.33)));
  return fract(mul(vec2(add(p3b.x, p3b.y), add(p3b.y, p3b.z)), p3b.z)) as unknown as Vec2Node;
}

/** Bilinear value noise over the hash lattice. Returns [0, 1). */
export function valueNoise2D(p: Vec2Node): FloatNode {
  const i = floor(p);
  const f = fract(p);
  // Smoothstep weights: f·f·(3 − 2f).
  const u = mul(mul(f, f), sub(3, mul(f, 2)));
  const a = hash21(i as unknown as Vec2Node);
  const b = hash21(add(i, vec2(1, 0)) as unknown as Vec2Node);
  const c = hash21(add(i, vec2(0, 1)) as unknown as Vec2Node);
  const d = hash21(add(i, vec2(1, 1)) as unknown as Vec2Node);
  const bottom = mix(a, b, u.x);
  const top = mix(c, d, u.x);
  return mix(bottom, top, u.y) as unknown as FloatNode;
}

/** 5-octave fractional Brownian motion. Returns roughly [0, 1). */
export function fbm(p: Vec2Node): FloatNode {
  let sum = mul(valueNoise2D(p), 0.5);
  sum = add(sum, mul(valueNoise2D(mul(p, 2) as unknown as Vec2Node), 0.25));
  sum = add(sum, mul(valueNoise2D(mul(p, 4) as unknown as Vec2Node), 0.125));
  sum = add(sum, mul(valueNoise2D(mul(p, 8) as unknown as Vec2Node), 0.0625));
  sum = add(sum, mul(valueNoise2D(mul(p, 16) as unknown as Vec2Node), 0.03125));
  return sum as unknown as FloatNode;
}
