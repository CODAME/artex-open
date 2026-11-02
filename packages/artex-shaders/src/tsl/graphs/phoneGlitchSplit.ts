/**
 * Phone Glitch Split — the WebGPU/TSL port of `Phone Glitch Split ARTEX.glsl`.
 *
 * RGB split, scanline tears and pixel noise, written as the trigger shader for
 * the "holding a phone" gesture. Tears jump at ~12 fps, not every frame.
 *
 * A line-for-line translation of the GLSL, which stays the reference: the same
 * constants and order of operations, uv from the bottom-left, display space
 * throughout, and the stretched state blend its GLSL carries inline. Its two
 * hashes are `fract(sin(x) * 43758.5)`, which differ between GPUs on GLSL too,
 * so which lines tear and the noise grain are not pixel-comparable.
 *
 * Inputs: the artwork pipeline (`image`), and the exact-name live uniforms
 * uEffectStrength, uEffectParam1..3 (split, tear size, noise), uAudioLevel and
 * the flow effect's uFlow*.
 */
import { add, clamp, dot, floor, fract, max, mul, sin, step, sub, uv, vec2, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import type { TslGraphEntry, TslGraphFactory } from "@artex/contract/tsl";
import { PHONE_GLITCH_SPLIT_TSL_LIVE_UNIFORMS, PHONE_GLITCH_SPLIT_TSL_SCRIPT_ID } from "../scriptIds";
import { sampleMainStretched } from "../helpers/artexImage";
import { phoneComposite } from "./phoneComposite";

export { PHONE_GLITCH_SPLIT_TSL_SCRIPT_ID };

type FloatNode = Node<"float">;
type Vec2Node = Node<"vec2">;

function glitchRand(x: FloatNode): FloatNode {
  return fract(mul(sin(add(mul(x, 127.1), 311.7)), 43758.5453));
}

function glitchRand2(p: Vec2Node): FloatNode {
  return fract(mul(sin(dot(p, vec2(12.9898, 78.233))), 43758.5453));
}

const phoneGlitchSplitFactory: TslGraphFactory = (inputs) => {
  const { liveUniform, time, resolution } = inputs;
  const live = (name: (typeof PHONE_GLITCH_SPLIT_TSL_LIVE_UNIFORMS)[number], initial: number): FloatNode =>
    liveUniform(name, initial);

  const fragUv = uv() as unknown as Vec2Node;

  const strength = clamp(live("uEffectStrength", 1), 0.0, 1.0);
  const splitAmount = mul(0.008, max(0.0, mul(live("uEffectParam1", 1), 2.0)));
  const blockAmount = mul(0.06, max(0.0, mul(live("uEffectParam2", 1), 2.0)));
  const noiseAmount = mul(0.4, max(0.0, mul(live("uEffectParam3", 1), 2.0)));
  const t = time;

  // Tears jitter at ~12 fps.
  const frameT = floor(mul(t, 12.0));

  // Sparse per-scanline horizontal tears.
  const lineSeed = glitchRand(add(floor(mul(fragUv.y, 80.0)), frameT));
  const tearMask = step(0.92, lineSeed);
  const tearOffset = mul(mul(mul(sub(lineSeed, 0.5), blockAmount), 2.0), tearMask);
  const blockUv = add(fragUv, vec2(tearOffset, 0.0)) as unknown as Vec2Node;

  // RGB split: each channel sampled at its own horizontal offset.
  const audio = add(1.0, mul(live("uAudioLevel", 0), 0.6));
  const split = mul(mul(splitAmount, audio), add(0.7, mul(0.3, sin(mul(t, 7.3)))));
  const colR = sampleMainStretched(inputs, add(blockUv, vec2(split, 0.0)));
  const colG = sampleMainStretched(inputs, blockUv);
  const colB = sampleMainStretched(inputs, sub(blockUv, vec2(split, 0.0)));

  let glitched: Node<"vec3"> = vec3(colR.r, colG.g, colB.b);

  // Scanlines, the flash at the start of some tear frames, and pixel noise.
  const scanline = add(0.85, mul(0.15, sin(mul(mul(fragUv.y, resolution.y), 3.14159))));
  glitched = mul(glitched, scanline);
  const flashPulse = mul(step(0.97, glitchRand(frameT)), 0.25);
  glitched = add(glitched, flashPulse);
  const noise = sub(glitchRand2(add(mul(fragUv, resolution), frameT)), 0.5);
  glitched = add(glitched, mul(mul(noise, noiseAmount), 0.25));

  return phoneComposite(inputs, fragUv, glitched, [colR.a, colG.a, colB.a], strength);
};

export const PHONE_GLITCH_SPLIT_TSL_GRAPH: TslGraphEntry = {
  id: PHONE_GLITCH_SPLIT_TSL_SCRIPT_ID,
  label: "Phone Glitch Split",
  description: "RGB split, scanline tear, and pixel noise. Designed as a trigger shader for the 'holding a phone' gesture.",
  tags: ["webgpu", "tsl", "image", "glitch", "chromatic", "trigger", "audio"],
  factory: phoneGlitchSplitFactory,
};
