/**
 * The ending both phone trigger shaders share: cross-fade from the clean
 * artwork to the effect by strength, and where there is no artwork, show the
 * effect against transparent. Display-space in, the pipeline's colour out
 * (clamped first, as the GLSL's 8-bit target clamped it).
 */
import { clamp, max, mix, mul, smoothstep, sub, vec4 } from "three/tsl";
import type { Node } from "three/webgpu";
import type { TslColorNode, TslPassInputs } from "@artex/contract/tsl";
import { fromDisplay } from "../helpers/displaySpace";
import { sampleMainStretched } from "../helpers/artexImage";

type FloatNode = Node<"float">;

export function phoneComposite(
  inputs: TslPassInputs,
  fragUv: Node<"vec2">,
  effect: Node<"vec3">,
  [alphaR, alphaG, alphaB]: readonly [FloatNode, FloatNode, FloatNode],
  strength: FloatNode,
): TslColorNode {
  const clean = sampleMainStretched(inputs, fragUv);
  const mediaPresence = smoothstep(0.0, 0.05, clean.a);
  const finalColor = mix(clean.rgb, effect, strength);
  const baseAlpha = max(max(alphaR, alphaG), alphaB);
  const outAlpha = max(clean.a, mul(mul(baseAlpha, strength), sub(1.0, mediaPresence)));
  return vec4(fromDisplay(clamp(finalColor, 0.0, 1.0)), clamp(max(clean.a, outAlpha), 0.0, 1.0));
}
