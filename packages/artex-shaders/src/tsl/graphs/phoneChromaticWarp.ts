/**
 * Phone Chromatic Warp — the WebGPU/TSL port of `Phone Chromatic Warp ARTEX.glsl`.
 *
 * A polar swirl with a per-channel chromatic split, written as the trigger
 * shader for the "holding a phone" gesture: the edges twist most, red and blue
 * pull apart along the radius, and the frame breathes with a radial pulse.
 *
 * A line-for-line translation of the GLSL, which stays the reference: the same
 * constants and order of operations, uv from the bottom-left, and display
 * space throughout (the artwork pipeline returns display-space colour; the
 * output is converted with `fromDisplay`). It samples through the stretched
 * state blend its GLSL carries inline (`sampleMainStretched`).
 *
 * Inputs: the artwork pipeline (`image`), and the exact-name live uniforms
 * uEffectStrength, uEffectParam1..3 (swirl, chroma spread, pulse), uAudioLevel
 * and the flow effect's uFlow*.
 */
import { add, atan, clamp, cos, div, length, max, mul, sin, smoothstep, sub, uv, vec2, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import type { TslGraphEntry, TslGraphFactory } from "@artex/contract/tsl";
import { PHONE_CHROMATIC_WARP_TSL_LIVE_UNIFORMS, PHONE_CHROMATIC_WARP_TSL_SCRIPT_ID } from "../scriptIds";
import { sampleMainStretched } from "../helpers/artexImage";
import { phoneComposite } from "./phoneComposite";

export { PHONE_CHROMATIC_WARP_TSL_SCRIPT_ID };

type FloatNode = Node<"float">;
type Vec2Node = Node<"vec2">;

const phoneChromaticWarpFactory: TslGraphFactory = (inputs) => {
  const { liveUniform, time, resolution } = inputs;
  const live = (name: (typeof PHONE_CHROMATIC_WARP_TSL_LIVE_UNIFORMS)[number], initial: number): FloatNode =>
    liveUniform(name, initial);

  const fragUv = uv() as unknown as Vec2Node;
  const aspect = div(resolution.x, resolution.y);

  // Centered coords with aspect correction so the swirl is radial, not elliptical.
  const centered = vec2(mul(sub(fragUv.x, 0.5), aspect), sub(fragUv.y, 0.5)) as unknown as Vec2Node;
  const radius = length(centered);
  const angle = atan(centered.y, centered.x);

  const strength = clamp(live("uEffectStrength", 1), 0.0, 1.0);
  const swirlAmount = mul(1.8, max(0.0, mul(live("uEffectParam1", 1), 2.0)));
  const splitAmount = mul(0.018, max(0.0, mul(live("uEffectParam2", 1), 2.0)));
  const pulseAmount = mul(0.25, max(0.0, mul(live("uEffectParam3", 1), 2.0)));
  const t = time;

  // Swirl: the angle shifts with radius, so the centre barely moves.
  const audio = add(1.0, mul(live("uAudioLevel", 0), 0.5));
  const twist = mul(mul(swirlAmount, smoothstep(0.0, 0.6, radius)), audio);
  const swirlAngle = add(angle, mul(twist, add(0.6, mul(0.4, sin(mul(t, 1.3))))));
  const swirled = vec2(
    add(div(mul(cos(swirlAngle), radius), aspect), 0.5),
    add(mul(sin(swirlAngle), radius), 0.5),
  ) as unknown as Vec2Node;

  // Per-channel chromatic split along the radius.
  const chromatic = mul(splitAmount, add(0.7, mul(0.3, sin(mul(t, 4.1)))));
  const splitOffset = mul(vec2(cos(angle), sin(angle)), chromatic) as unknown as Vec2Node;
  const sampleR = sampleMainStretched(inputs, add(swirled, splitOffset));
  const sampleG = sampleMainStretched(inputs, swirled);
  const sampleB = sampleMainStretched(inputs, sub(swirled, splitOffset));

  // Radial pulse so the effect breathes on the frame.
  const pulse = add(1.0, mul(pulseAmount, sin(sub(mul(t, 2.4), mul(radius, 6.0)))));
  const warped = mul(vec3(sampleR.r, sampleG.g, sampleB.b), pulse);

  return phoneComposite(inputs, fragUv, warped, [sampleR.a, sampleG.a, sampleB.a], strength);
};

export const PHONE_CHROMATIC_WARP_TSL_GRAPH: TslGraphEntry = {
  id: PHONE_CHROMATIC_WARP_TSL_SCRIPT_ID,
  label: "Phone Chromatic Warp",
  description: "Polar swirl with per-channel chromatic split. Designed as a trigger shader for the 'holding a phone' gesture.",
  tags: ["webgpu", "tsl", "image", "swirl", "chromatic", "trigger", "audio"],
  factory: phoneChromaticWarpFactory,
};
