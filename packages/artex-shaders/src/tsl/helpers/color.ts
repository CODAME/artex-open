/**
 * License-clean TSL colour helpers.
 *
 * `cosinePalette` is the canonical cosine gradient `a + b·cos(2π(c·t + d))` —
 * a mathematical formula (commonly attributed to Inigo Quilez's articles),
 * reimplemented here from the formula, not copied from licensed shader code.
 */
import { vec3, cos, add, mul } from "three/tsl";
import type { Node } from "three/webgpu";

type FloatNode = Node<"float">;
type Vec3Node = Node<"vec3">;

const TWO_PI = 6.28318530718;

/** Per-channel cosine. `cos` is typed scalar-only in @types/three but is
 *  vector-capable at runtime (component-wise in WGSL/GLSL). */
function vec3Cos(x: Vec3Node): Vec3Node {
  return cos(x as unknown as number) as unknown as Vec3Node;
}

/**
 * Cosine palette: `a + b · cos(2π · (c·t + d))`. Each of `a,b,c,d` is a vec3.
 * `t` is a scalar position node (e.g. a noise value or a normalised coordinate).
 */
export function cosinePalette(
  t: FloatNode,
  a: Vec3Node,
  b: Vec3Node,
  c: Vec3Node,
  d: Vec3Node,
): Vec3Node {
  const phase = mul(add(mul(c, t), d), TWO_PI) as unknown as Vec3Node;
  return add(a, mul(b, vec3Cos(phase))) as unknown as Vec3Node;
}

/** A warm aurora-ish default palette tuned for the flow-field starter. */
export function auroraPalette(t: FloatNode): Vec3Node {
  return cosinePalette(
    t,
    vec3(0.5, 0.5, 0.55) as unknown as Vec3Node,
    vec3(0.45, 0.4, 0.5) as unknown as Vec3Node,
    vec3(1.0, 1.0, 1.0) as unknown as Vec3Node,
    vec3(0.0, 0.15, 0.4) as unknown as Vec3Node,
  );
}
