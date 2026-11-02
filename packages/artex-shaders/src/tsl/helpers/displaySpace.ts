/**
 * Display-space colour for graphs ported from GLSL.
 *
 * A GLSL shader on the WebGL path works in display space: it samples the
 * artwork's stored sRGB bytes as-is and writes the bytes the screen shows. The
 * WebGPU path does not. Artwork textures are tagged sRGB, so sampling decodes
 * them to linear, and a graph's colour is treated as linear and sRGB-encoded on
 * its way to the canvas (0.5 shows as 187, not 128).
 *
 * A port keeps its GLSL math, and its GLSL look, by working in display space
 * and converting at the two edges: `toDisplay` on what it samples, and
 * `fromDisplay` on what it returns, which the pipeline's encode then turns back
 * into exactly the GLSL bytes. Graphs written natively in TSL (Flow Field)
 * work in linear and use neither.
 */
import { sRGBTransferEOTF, sRGBTransferOETF, vec4 } from "three/tsl";
import type { Node } from "three/webgpu";

type Vec3Node = Node<"vec3">;
type Vec4Node = Node<"vec4">;

/** Display-space rgb (what GLSL would write) to the linear rgb the pipeline expects. */
export function fromDisplay(rgb: Vec3Node): Vec3Node {
  return sRGBTransferEOTF(rgb) as unknown as Vec3Node;
}

/** Linear rgb (what sampling an sRGB texture returns) to display space (what GLSL would read). */
export function toDisplay(rgb: Vec3Node): Vec3Node {
  return sRGBTransferOETF(rgb) as unknown as Vec3Node;
}

/** `toDisplay` on a sample, alpha untouched. */
export function toDisplay4(color: Vec4Node): Vec4Node {
  return vec4(toDisplay(color.rgb), color.a);
}
