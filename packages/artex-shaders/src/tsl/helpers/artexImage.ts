/**
 * The artwork pipeline for graphs ported from GLSL: a line-for-line port of
 * the patcher's helper block (`ARTEX_HELPER` in
 * `packages/artex-runtime-web/src/shaderPatcher.ts`), which 26 builtin GLSL
 * shaders read the artwork through.
 *
 *   artex_hash / artex_noise        -> artexHash / artexNoise
 *   artex_mapContainedUv            -> mapContainedUv
 *   artex_sampleContained           -> sampleContained
 *   artex_sampleMainTexture         -> sampleMainTexture
 *   artex_applyFlow                 -> applyFlow
 *   artex_blendStates               -> blendStates
 *   artex_sampleMain                -> sampleMain
 *
 * Same constants and order of operations. Every sampler here returns
 * DISPLAY-space colour, as its GLSL namesake did, so a port can keep its GLSL
 * math; it converts its output with `fromDisplay` (see `displaySpace.ts`).
 *
 * Inputs come from `TslPassInputs.image` (artwork size, media transform,
 * states) and from exact-name live uniforms the hosts set like the WebGL
 * backend does: `uFlowEnabled`, `uFlowIntensity`, `uFlowSpeed`, `uFlowScale`.
 *
 * GLSL branches become `select`: every branch is evaluated and one is kept,
 * which costs the extra samples a branch would have skipped but keeps the
 * result identical. `uMediaTransformMainEnabled` was always 0 in GLSL (the
 * WebGL base pass had already applied pan/zoom to `uMainImage`); here the
 * artwork is raw, so `sampleMainTexture` applies the transform itself, which
 * matches both paths (the V3 path's transform is the identity).
 */
import {
  abs,
  clamp,
  cos,
  dot,
  float,
  floor,
  fract,
  greaterThan,
  lessThan,
  lessThanEqual,
  max,
  mix,
  or,
  select,
  sin,
  sub,
  add,
  mul,
  div,
  vec2,
  vec4,
} from "three/tsl";
import type { Node } from "three/webgpu";
import type { TslPassInputs, TslTextureUniform, TslVec2Uniform } from "@artex/contract/tsl";
import { toDisplay4 } from "./displaySpace";

type FloatNode = Node<"float">;
type Vec2Node = Node<"vec2">;
type Vec4Node = Node<"vec4">;

/** `artex_hash`: the sine hash, kept exactly (not hash21) so ports match their GLSL. */
export function artexHash(p: Vec2Node): FloatNode {
  return fract(mul(sin(dot(p, vec2(12.9898, 78.233))), 43758.5453));
}

/** `artex_noise`: bilinear value noise over `artexHash`. */
export function artexNoise(p: Vec2Node): FloatNode {
  const i = floor(p) as unknown as Vec2Node;
  const f = fract(p) as unknown as Vec2Node;
  const a = artexHash(i);
  const b = artexHash(add(i, vec2(1, 0)));
  const c = artexHash(add(i, vec2(0, 1)));
  const d = artexHash(add(i, vec2(1, 1)));
  const u = mul(mul(f, f), sub(3, mul(2, f))) as unknown as Vec2Node;
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/**
 * `artex_mapContainedUv`: fit a source of `sourceResolution` inside a frame of
 * `frameResolution` (contain, centred), optionally through the media
 * transform (translateX, translateY, scale, rotation radians).
 */
export function mapContainedUv(
  uv: Vec2Node,
  sourceResolution: TslVec2Uniform | Vec2Node,
  frameResolution: TslVec2Uniform | Vec2Node,
  mediaTransform: Node<"vec4"> | null,
): Vec2Node {
  const src = max(sourceResolution, vec2(1, 1)) as unknown as Vec2Node;
  const dst = max(frameResolution, vec2(1, 1)) as unknown as Vec2Node;
  const srcAspect = div(src.x, src.y);
  const dstAspect = div(dst.x, dst.y);
  const wider = greaterThan(srcAspect, dstAspect);
  const window = vec2(
    select(wider, float(1), div(srcAspect, dstAspect)),
    select(wider, div(dstAspect, srcAspect), float(1)),
  ) as unknown as Vec2Node;

  if (!mediaTransform) {
    return add(div(sub(uv, 0.5), max(window, vec2(0.0001, 0.0001))), 0.5);
  }
  const scaledWindow = mul(window, max(mediaTransform.z, 0.0001)) as unknown as Vec2Node;
  const centered = div(sub(uv, 0.5), max(scaledWindow, vec2(0.0001, 0.0001))) as unknown as Vec2Node;
  const s = sin(mediaTransform.w);
  const c = cos(mediaTransform.w);
  const rotated = vec2(
    sub(mul(centered.x, c), mul(centered.y, s)),
    add(mul(centered.x, s), mul(centered.y, c)),
  );
  return add(add(rotated, 0.5), mediaTransform.xy);
}

/** Transparent outside the unit square, as the GLSL's bounds check. */
function sampleInside(texture: TslTextureUniform, uv: Vec2Node): Vec4Node {
  const outside = or(
    or(lessThan(uv.x, 0), greaterThan(uv.x, 1)),
    or(lessThan(uv.y, 0), greaterThan(uv.y, 1)),
  );
  return select(outside, vec4(0, 0, 0, 0), toDisplay4(texture.sample(uv) as unknown as Vec4Node));
}

/** `artex_sampleContained`: a texture, contained in the frame, through the media transform. */
export function sampleContained(
  inputs: TslPassInputs,
  texture: TslTextureUniform,
  uv: Vec2Node,
  sourceResolution: TslVec2Uniform,
): Vec4Node {
  return sampleInside(texture, mapContainedUv(uv, sourceResolution, inputs.resolution, inputs.image.mediaTransform));
}

/** `artex_sampleMainTexture`: the artwork, contained in the frame. */
export function sampleMainTexture(inputs: TslPassInputs, uv: Vec2Node): Vec4Node {
  return sampleContained(inputs, inputs.source, uv, inputs.image.sourceResolution);
}

/** The flow effect's exact-name uniforms and the WebGL backend's defaults for them. */
export const FLOW_UNIFORM_DEFAULTS = {
  uFlowEnabled: 0,
  uFlowIntensity: 0.05,
  uFlowSpeed: 0.4,
  uFlowScale: 3,
} as const;

/** `artex_applyFlow`: the evolution flow effect's uv displacement (none unless `uFlowEnabled`). */
export function applyFlow(inputs: TslPassInputs, uv: Vec2Node): Vec2Node {
  const live = (name: keyof typeof FLOW_UNIFORM_DEFAULTS) => inputs.liveUniform(name, FLOW_UNIFORM_DEFAULTS[name]);
  const enabled = live("uFlowEnabled");
  const intensity = live("uFlowIntensity");
  const speed = live("uFlowSpeed");
  const scale = live("uFlowScale");
  const p = mul(uv, scale) as unknown as Vec2Node;
  const drift = mul(inputs.time, speed);
  const nx = artexNoise(add(add(p, vec2(10, 0)), drift));
  const ny = artexNoise(add(add(p, vec2(0, 10)), drift));
  const distortion = vec2(mul(mul(sub(nx, 0.5), intensity), 0.15), mul(mul(sub(ny, 0.5), intensity), 0.15));
  return select(greaterThan(abs(sub(enabled, 1)), 0.5), uv, add(uv, distortion));
}

/** `artex_blendStates`: the artwork, or the evolution states A–D blended along `blendFactor`. */
export function blendStates(inputs: TslPassInputs, uv: Vec2Node): Vec4Node {
  const { states, stateResolutions } = inputs.image;
  return blendWith(inputs, (i) => sampleContained(inputs, states[i], uv, stateResolutions[i]), sampleMainTexture(inputs, uv));
}

/**
 * The inline helper copy some builtins carry instead of the patcher's (the two
 * phone trigger shaders): the same blend, but each state image is sampled
 * stretched over the frame rather than contained. The artwork itself is not
 * stretched: on WebGL their `uMainImage` was the base pass, the artwork already
 * fitted to a frame-sized texture. So it reads as `sampleMainTexture`, at uv
 * clamped to the frame, as that texture's clamp-to-edge sampling did.
 */
export function blendStatesStretched(inputs: TslPassInputs, uv: Vec2Node): Vec4Node {
  const { states } = inputs.image;
  const inFrame = clamp(uv, vec2(0, 0), vec2(1, 1)) as unknown as Vec2Node;
  return blendWith(
    inputs,
    (i) => toDisplay4(states[i].sample(uv)),
    sampleMainTexture(inputs, inFrame),
  );
}

/** `blendStatesStretched` after flow: those shaders' `artex_sampleMain`. */
export function sampleMainStretched(inputs: TslPassInputs, uv: Vec2Node): Vec4Node {
  return blendStatesStretched(inputs, applyFlow(inputs, uv));
}

function blendWith(
  inputs: TslPassInputs,
  state: (i: 0 | 1 | 2 | 3) => Vec4Node,
  artwork: Vec4Node,
): Vec4Node {
  const { stateCount, blendFactor } = inputs.image;
  const a = state(0);
  const b = state(1);
  const c = state(2);
  const d = state(3);
  const t = blendFactor;

  const two = mix(a, b, t);
  const three = select(
    lessThan(t, 0.5),
    mix(a, b, mul(t, 2)),
    mix(b, c, mul(sub(t, 0.5), 2)),
  );
  const third = 1 / 3;
  const four = select(
    lessThan(t, third),
    mix(a, b, mul(t, 3)),
    select(
      lessThan(t, 2 / 3),
      mix(b, c, mul(sub(t, third), 3)),
      mix(c, d, mul(sub(t, 2 / 3), 3)),
    ),
  );
  // GLSL: `uUseStateBlending` is `uStateCount > 0`, then <= 1, == 2, == 3, >= 4.
  const count = floor(stateCount);
  const blended = select(
    lessThanEqual(count, 1),
    a,
    select(lessThan(count, 2.5), two, select(lessThan(count, 3.5), three, four)),
  );
  return select(lessThan(count, 0.5), artwork, blended);
}

/** `artex_sampleMain`: flow, then the artwork or its states. Display-space colour. */
export function sampleMain(inputs: TslPassInputs, uv: Vec2Node): Vec4Node {
  return blendStates(inputs, applyFlow(inputs, uv));
}
