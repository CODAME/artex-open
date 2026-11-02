/**
 * The WebGL base pass's evolution effects (`unifiedFragmentShader` in
 * render-core), ported line for line for the artwork base graph. On WebGL
 * these run in the base pass, which a user shader reads as `uMainImage`; the
 * base graph plays that part on WebGPU, so each effect ported here reaches
 * every ported shader. Display-space colour in and out, like the GLSL.
 *
 * Inputs are exact-name live uniforms the WebGPU backend sets from the
 * evolution effects (`setEffects`), at the WebGL backend's defaults when an
 * effect leaves a param out.
 *
 *   applySliceDisplace   ->  slices (`slice-displace`):
 *                            uSliceEnabled, uSliceIntensity, uSliceBands, uSliceOffset, uSliceAngle
 *   applyDepthParallax   ->  depth parallax (`depth-parallax`):
 *                            uDepthEnabled, uDepthDepth, uDepthSpeed
 *   applyColorEvolution  ->  colour evolution (`color-evolution`):
 *                            uColorEnabled, uColorSpeed, uColorIntensity, uColorTemperature
 *   applyFeedback        ->  feedback (`feedback`):
 *                            uFeedbackEnabled, uFeedbackIntensity, uFeedbackDecay
 *   applyPaintLocal      ->  paint (`paint-local`):
 *                            uPaintEnabled, uPaintStrength, uPaintX, uPaintY, uPaintRadius,
 *                            uPaintHardness, uPaintHue (WebGL's u_paintPosition is uPaintX, uPaintY)
 *   applyInsideUv,       ->  inside fly-through (`inside-flythrough`):
 *   applyInsideColor         uInsideEnabled, uInsideIntensity, uInsideSpeed, uInsideTwist
 */
import {
  abs,
  add,
  atan,
  clamp,
  cos,
  distance,
  div,
  dot,
  exp,
  float,
  floor,
  fract,
  greaterThan,
  length,
  lessThan,
  max,
  mix,
  mul,
  normalize,
  pow,
  select,
  sin,
  smoothstep,
  sub,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { Node } from "three/webgpu";
import type { TslPassInputs } from "@artex/contract/tsl";
import { FLOW_UNIFORM_DEFAULTS, artexHash, artexNoise, sampleMainTexture } from "./artexImage";

/**
 * Every evolution effect's exact-name uniforms and the WebGL backend's
 * defaults for them (flow's included), the one place the defaults live.
 */
export const EVOLUTION_UNIFORM_DEFAULTS = {
  ...FLOW_UNIFORM_DEFAULTS,
  uSliceEnabled: 0,
  uSliceIntensity: 0,
  uSliceBands: 10,
  uSliceOffset: 0,
  uSliceAngle: 0,
  uDepthEnabled: 0,
  uDepthDepth: 0.8,
  uDepthSpeed: 0.6,
  uColorEnabled: 0,
  uColorSpeed: 0.1,
  uColorIntensity: 0.8,
  uColorTemperature: 0,
  uFeedbackEnabled: 0,
  uFeedbackIntensity: 0.3,
  uFeedbackDecay: 0.9,
  uPaintEnabled: 0,
  uPaintStrength: 0,
  uPaintX: 0.5,
  uPaintY: 0.5,
  uPaintRadius: 0.22,
  uPaintHardness: 0.72,
  uPaintHue: 0.5,
  uInsideEnabled: 0,
  uInsideIntensity: 0,
  uInsideSpeed: 1,
  uInsideTwist: 0,
} as const;

type EvolutionUniform = keyof typeof EVOLUTION_UNIFORM_DEFAULTS;

function live(inputs: TslPassInputs, name: EvolutionUniform) {
  return inputs.liveUniform(name, EVOLUTION_UNIFORM_DEFAULTS[name]);
}

/**
 * Declare every evolution uniform now, at its default. A graph that builds
 * its effects lazily (inside `Fn`, at compile) calls this first, so the host's
 * values land on the uniforms from the first frame rather than the one after
 * the compile.
 */
export function declareEvolutionUniforms(inputs: TslPassInputs): void {
  for (const name of Object.keys(EVOLUTION_UNIFORM_DEFAULTS) as EvolutionUniform[]) live(inputs, name);
}

type FloatNode = Node<"float">;
type Vec2Node = Node<"vec2">;
type Vec3Node = Node<"vec3">;
type Vec4Node = Node<"vec4">;

/**
 * `applySliceDisplace`: cuts the frame into `bands` parallel bands (rotated
 * by `angle`, in turns) and slides each along the band by its own amount:
 * alternating waves, a constant offset and a per-band jitter that changes
 * 1.3 times a second, all pulsing with intensity. A uv displacement, applied
 * after flow and before depth parallax, as in the GLSL; off unless
 * `uSliceEnabled` is 1.
 */
export function applySliceDisplace(inputs: TslPassInputs, uv: Vec2Node): Vec2Node {
  const enabled = live(inputs, "uSliceEnabled");
  const intensity = live(inputs, "uSliceIntensity");
  const bands = max(2.0, live(inputs, "uSliceBands"));
  const sliceOffset = live(inputs, "uSliceOffset");
  const angle = mul(live(inputs, "uSliceAngle"), 6.2831853);

  const dir = normalize(vec2(cos(angle), sin(angle))) as unknown as Vec2Node;
  const acrossDir = vec2(mul(dir.y, -1), dir.x);
  const sliceCoord = dot(sub(uv, vec2(0.5, 0.5)), acrossDir);
  const sliceIndex = floor(mul(add(sliceCoord, 0.5), bands));

  // GLSL `mod(sliceIndex, 2.0) < 1.0`, with GLSL's floor-based mod for negative bands.
  const even = lessThan(sub(sliceIndex, mul(2.0, floor(div(sliceIndex, 2.0)))), 1.0);
  const alt = select(even, -1.0, 1.0);
  const wave = sin(add(mul(sliceIndex, 1.913), mul(inputs.time, add(0.55, mul(intensity, 0.35)))));
  const pulse = add(mul(sin(add(mul(inputs.time, 3.1), mul(sliceIndex, 0.37))), 0.5), 0.5);
  const jitter = mul(sub(artexHash(vec2(sliceIndex, floor(mul(inputs.time, 1.3)))), 0.5), 2.0);
  const strength = mul(intensity, add(0.6, mul(pulse, 0.4)));
  const offset = mul(add(add(mul(mul(alt, wave), 0.72), mul(sliceOffset, 0.9)), mul(jitter, 0.25)), strength);

  const displaced = clamp(add(uv, mul(dir, offset)), vec2(0, 0), vec2(1, 1));
  return select(greaterThan(enabled, 0.5), displaced, uv);
}

/**
 * `applyDepthParallax`: a slow drifting offset, two octaves of value noise and
 * a swirl about the centre, all scaled by depth. A uv displacement, applied
 * after flow and before the artwork is sampled, as in the GLSL; off unless
 * `uDepthEnabled` is 1.
 */
export function applyDepthParallax(inputs: TslPassInputs, uv: Vec2Node): Vec2Node {
  const enabled = live(inputs, "uDepthEnabled");
  const depth = live(inputs, "uDepthDepth");
  const speed = live(inputs, "uDepthSpeed");

  const t = mul(inputs.time, speed);

  let offset = vec2(mul(mul(sin(t), depth), 0.08), mul(mul(cos(mul(t, 0.7)), depth), 0.08)) as unknown as Vec2Node;

  const noise1 = artexNoise(add(mul(uv, 3.0), t));
  const noise2 = artexNoise(add(mul(uv, 7.0), mul(t, 1.3)));
  offset = add(offset, vec2(mul(mul(sub(noise1, 0.5), depth), 0.04), mul(mul(sub(noise2, 0.5), depth), 0.04)));

  const toCenter = sub(uv, vec2(0.5, 0.5)) as unknown as Vec2Node;
  const angle = add(atan(toCenter.y, toCenter.x), mul(t, 0.5));
  const radius = length(toCenter);
  offset = add(offset, vec2(mul(mul(mul(cos(angle), depth), 0.02), radius), mul(mul(mul(sin(angle), depth), 0.02), radius)));

  // GLSL: `if (u_depthEnabled != 1) return uv;`
  return select(greaterThan(enabled, 0.5), add(uv, offset), uv);
}

/**
 * `applyColorEvolution`: a slow multi-sine hue drift, the evolution state's
 * warm/cool bias, a breathing brightness, a saturation swing and a partial
 * hue rotation. Same constants and order as the GLSL; off unless
 * `uColorEnabled` is 1.
 */
export function applyColorEvolution(inputs: TslPassInputs, color: Vec4Node): Vec4Node {
  const enabled = live(inputs, "uColorEnabled");
  const speed = live(inputs, "uColorSpeed");
  const intensity = live(inputs, "uColorIntensity");
  const temperature = clamp(live(inputs, "uColorTemperature"), -1.0, 1.0);

  const t = mul(inputs.time, speed);

  const hueShift1 = mul(sin(t), intensity);
  const hueShift2 = mul(mul(sin(add(mul(t, 1.3), 1.0)), intensity), 0.7);
  const hueShift3 = mul(mul(sin(add(mul(t, 0.7), 2.0)), intensity), 0.5);
  const hueShift = mul(add(add(hueShift1, hueShift2), hueShift3), 1 / 2.2) as unknown as FloatNode;

  let rgb = add(color.rgb, vec3(mul(hueShift, 0.8), mul(hueShift, 0.4), mul(hueShift, -0.8))) as unknown as Vec3Node;

  const directTempShift = mul(temperature, add(0.25, mul(intensity, 0.35)));
  rgb = add(rgb, vec3(directTempShift, mul(directTempShift, 0.35), mul(directTempShift, -1.0)));

  const breathing = add(1.0, mul(mul(sin(mul(t, 2.0)), intensity), 0.4));
  rgb = mul(rgb, breathing);

  const saturation = add(1.0, mul(mul(sin(mul(t, 1.5)), intensity), 0.4));
  const gray = dot(rgb, vec3(0.299, 0.587, 0.114));
  rgb = mix(vec3(gray, gray, gray), rgb, saturation);

  const hueRot = mul(mul(sin(mul(t, 0.8)), intensity), 0.2);
  const rotated = vec3(
    add(mul(rgb.x, add(1.0, hueRot)), mul(rgb.z, hueRot)),
    rgb.y,
    add(mul(rgb.z, sub(1.0, hueRot)), mul(rgb.x, hueRot)),
  );
  rgb = mix(rgb, rotated, 0.5);

  // GLSL: `if (u_colorEnabled != 1) return color;`
  const on = greaterThan(enabled, 0.5);
  return vec4(select(on, rgb, color.rgb), color.a);
}

/**
 * `applyFeedback`: despite the name, no previous frame. The GLSL blends three
 * samples of the artwork (not the states) at offsets circling with time, then
 * tints warm and brightens, all scaled by intensity x decay. `uv` is the
 * distorted uv the colour was sampled at. Off unless `uFeedbackEnabled` is 1.
 */
export function applyFeedback(inputs: TslPassInputs, color: Vec4Node, uv: Vec2Node): Vec4Node {
  const enabled = live(inputs, "uFeedbackEnabled");
  const intensity = live(inputs, "uFeedbackIntensity");
  const decay = live(inputs, "uFeedbackDecay");

  const amount = mul(intensity, decay);
  const t = mul(inputs.time, 0.8);
  const offset = (phase: number, scale: number): Vec2Node =>
    vec2(mul(mul(sin(add(t, phase)), amount), scale), mul(mul(cos(add(t, phase)), amount), scale));

  const feedback1 = sampleMainTexture(inputs, add(uv, offset(0, 0.03)));
  const feedback2 = sampleMainTexture(inputs, add(uv, offset(1.5, 0.025)));
  const feedback3 = sampleMainTexture(inputs, add(uv, offset(3.0, 0.02)));

  let mixed = mix(color, feedback1, mul(amount, 0.4));
  mixed = mix(mixed, feedback2, mul(amount, 0.3));
  mixed = mix(mixed, feedback3, mul(amount, 0.2));

  let rgb = add(mixed.rgb, vec3(mul(amount, 0.1), 0.0, mul(amount, -0.1)));
  rgb = mul(rgb, add(1.0, mul(amount, 0.1)));

  // GLSL: `if (u_feedbackEnabled != 1) return color;`
  return select(greaterThan(enabled, 0.5), vec4(rgb, mixed.a), color);
}

/**
 * `applyPaintLocal`: a brush on the artwork at (`uPaintX`, `uPaintY`), in uv.
 * Inside its radius (softened by hardness, broken up by moving value noise,
 * ridged at the rim) the colour moves towards a hue tint scaled by luma, then
 * smears towards an artwork sample a little along the hue's direction. `uv`
 * is the distorted uv the colour was sampled at. Off unless `uPaintEnabled`
 * is 1.
 */
export function applyPaintLocal(inputs: TslPassInputs, color: Vec4Node, uv: Vec2Node): Vec4Node {
  const enabled = live(inputs, "uPaintEnabled");
  const strength = clamp(live(inputs, "uPaintStrength"), 0.0, 2.5);
  const paintPos = clamp(
    vec2(live(inputs, "uPaintX"), live(inputs, "uPaintY")),
    vec2(0, 0),
    vec2(1, 1),
  ) as unknown as Vec2Node;
  const radius = clamp(live(inputs, "uPaintRadius"), 0.02, 0.85);
  const hardness = clamp(live(inputs, "uPaintHardness"), 0.05, 0.98);
  const dist = distance(uv, paintPos);

  const falloff = mix(mul(radius, 0.45), mul(radius, 0.05), hardness);
  const inner = max(0.0, sub(radius, falloff));
  const mask = mul(sub(1.0, smoothstep(inner, radius, dist)), clamp(strength, 0.0, 1.0));

  const brushUv = mul(sub(uv, paintPos), add(10.0, mul(radius, 40.0))) as unknown as Vec2Node;
  const brushNoise = artexNoise(add(brushUv, vec2(mul(inputs.time, 0.7), mul(inputs.time, -0.55))));
  const stroke = smoothstep(0.22, 0.9, brushNoise);
  const ridge = smoothstep(0.0, 0.22, sub(radius, dist));
  const localMask = mul(mul(mask, mix(0.55, 1.0, stroke)), add(0.7, mul(ridge, 0.3)));

  const hue = fract(live(inputs, "uPaintHue"));
  const tintChannel = (phase: number) => add(0.5, mul(0.5, sin(mul(6.2831853, add(hue, phase)))));
  const tint = vec3(tintChannel(0.0), tintChannel(0.33), tintChannel(0.66));

  const luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  const painted = mix(
    mul(color.rgb, add(1.0, mul(strength, 0.15))),
    mul(tint, add(0.35, mul(luma, 0.65))),
    add(0.45, mul(strength, 0.15)),
  );
  let rgb = mix(color.rgb, painted, localMask) as unknown as Vec3Node;

  const hueAngle = mul(hue, 6.2831853);
  const smearDir = normalize(add(vec2(cos(hueAngle), sin(hueAngle)), vec2(0.001, 0.0)));
  const smearUv = clamp(add(uv, mul(smearDir, add(0.012, mul(strength, 0.006)))), vec2(0, 0), vec2(1, 1));
  const smearSample = sampleMainTexture(inputs, smearUv).rgb;
  rgb = mix(rgb, mul(smearSample, add(0.8, mul(strength, 0.25))), mul(localMask, 0.35));

  // GLSL: `if (u_paintEnabled != 1) return color;`
  return select(greaterThan(enabled, 0.5), vec4(rgb, color.a), color);
}

/**
 * `applyInsideFlythroughUv`: the inside fly-through's tunnel warp. Twists the
 * uv about the centre (more towards it), pulls it inwards in pulsing rings,
 * and ripples it along and across the radius. The last uv displacement,
 * after depth parallax, as in the GLSL; off unless `uInsideEnabled` is 1.
 */
export function applyInsideUv(inputs: TslPassInputs, uv: Vec2Node): Vec2Node {
  const enabled = live(inputs, "uInsideEnabled");
  const intensity = clamp(live(inputs, "uInsideIntensity"), 0.0, 2.0);
  const p = sub(uv, vec2(0.5, 0.5)) as unknown as Vec2Node;
  const r = max(length(p), 1e-4);
  const t = mul(inputs.time, live(inputs, "uInsideSpeed"));

  const twist = mul(live(inputs, "uInsideTwist"), intensity);
  const angle = add(atan(p.y, p.x), mul(twist, add(0.35, mul(sub(1.0, clamp(r, 0.0, 1.0)), 1.8))));

  const tunnel = sub(1.0, exp(mul(float(-1), mul(r, add(2.0, mul(intensity, 5.0))))));
  const radialPull = mul(intensity, add(0.06, mul(0.08, sin(add(mul(t, 1.9), mul(r, 24.0))))));
  const radialShift = mul(radialPull, add(0.25, mul(tunnel, 0.75)));
  const newR = clamp(sub(r, radialShift), 0.0, 1.25);

  const dir = vec2(cos(angle), sin(angle)) as unknown as Vec2Node;
  let warped = add(vec2(0.5, 0.5), mul(dir, newR)) as unknown as Vec2Node;
  warped = add(warped, mul(dir, mul(mul(intensity, 0.012), sin(add(mul(t, 8.0), mul(r, 42.0))))));
  warped = add(
    warped,
    mul(vec2(mul(dir.y, -1), dir.x), mul(mul(intensity, 0.01), sin(add(mul(t, 5.0), mul(r, 28.0))))),
  );

  return select(greaterThan(enabled, 0.5), clamp(warped, vec2(0, 0), vec2(1, 1)), uv);
}

/**
 * `applyInsideFlythroughColor`: the inside fly-through's light. Blue streaks
 * racing out along the radius (broken up by value noise, faded in towards
 * the edge), a darkened rim and a pulsing glow at the centre. `uv` is the
 * distorted uv. The last colour effect, as in the GLSL; off unless
 * `uInsideEnabled` is 1.
 */
export function applyInsideColor(inputs: TslPassInputs, color: Vec4Node, uv: Vec2Node): Vec4Node {
  const enabled = live(inputs, "uInsideEnabled");
  const intensity = clamp(live(inputs, "uInsideIntensity"), 0.0, 2.0);
  const p = sub(uv, vec2(0.5, 0.5)) as unknown as Vec2Node;
  const r = length(p);
  const angle = atan(p.y, p.x);
  const t = mul(inputs.time, add(0.8, mul(live(inputs, "uInsideSpeed"), 1.3)));

  const tunnel = smoothstep(0.04, 0.92, r);
  const streakNoise = artexNoise(vec2(sub(mul(r, 22.0), mul(t, 1.5)), add(mul(angle, 3.0), mul(t, 0.35))));
  const streaks = pow(
    smoothstep(0.4, 1.0, abs(sin(add(sub(mul(r, 90.0), mul(t, 16.0)), mul(streakNoise, 4.0))))),
    2.3,
  );

  let rgb = add(color.rgb, mul(vec3(0.35, 0.55, 0.92), mul(mul(mul(streaks, tunnel), intensity), 0.28))) as unknown as Vec3Node;

  const edgeDarken = mul(mul(smoothstep(0.28, 1.05, r), intensity), 0.38);
  rgb = mul(rgb, sub(1.0, mul(edgeDarken, 0.38)));

  const centerGlow = mul(mul(sub(1.0, smoothstep(0.0, 0.35, r)), intensity), add(0.16, mul(0.08, sin(mul(t, 2.2)))));
  rgb = add(rgb, mul(vec3(0.12, 0.18, 0.27), centerGlow));

  // GLSL: `if (u_insideEnabled != 1) return color;`
  return select(greaterThan(enabled, 0.5), vec4(rgb, color.a), color);
}
