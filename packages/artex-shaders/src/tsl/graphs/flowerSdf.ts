/**
 * Procedural Flower (underwater) — the WebGPU/TSL port of `Flower SDF ARTEX.glsl`.
 *
 * A rose-curve flower drifting on a slow current, with caustic light, god rays
 * and rising bubbles behind it. Proximity opens the bloom, sound drives the
 * sway and rim glow, and the ten voice-command envelopes make it jump, dance,
 * spin, stop, explode, grow, shrink, glow, shift colour and calm down.
 *
 * A line-for-line translation of the GLSL, which stays the reference: the same
 * constants, the same order of operations, the same coordinate frame (pixel
 * coordinates from the bottom-left, as `gl_FragCoord`), and the same colour
 * space: it works in display space and converts its output with `fromDisplay`,
 * so the screen shows the GLSL's bytes. Pixel parity with the
 * GLSL on WebGL was checked when this was ported; the headless suite pins the
 * behaviour from here on. Change both together or retire the GLSL.
 *
 * Inputs:
 *   - pass params (as `uniforms`): petals, openness, curl, spin, hue,
 *     hueSpread, current. Exact 0 means "unset", as in the GLSL.
 *   - live exact-name uniforms (`liveUniform`): uProximity, uAudioLevel and
 *     the `uVoice*` envelopes. The host fills them from the interaction values,
 *     the stack's bindings and the voice-command bus.
 */
import {
  uv,
  vec2,
  vec3,
  vec4,
  float,
  abs,
  atan,
  clamp,
  cos,
  dot,
  exp,
  floor,
  fract,
  greaterThan,
  length,
  max,
  min,
  mix,
  pow,
  select,
  sin,
  smoothstep,
  step,
  add,
  sub,
  mul,
  div,
} from "three/tsl";
import type { Node } from "three/webgpu";
import type { TslGraphEntry, TslGraphFactory } from "@artex/contract/tsl";
import { FLOWER_SDF_TSL_LIVE_UNIFORMS, FLOWER_SDF_TSL_SCRIPT_ID } from "../scriptIds";
import { fromDisplay } from "../helpers/displaySpace";

export { FLOWER_SDF_TSL_SCRIPT_ID };

type FloatNode = Node<"float">;
type Vec2Node = Node<"vec2">;
type Vec3Node = Node<"vec3">;
type Vec4Node = Node<"vec4">;

/** The demo's params. 0 is also accepted and means "use the default". */
export const FLOWER_SDF_DEFAULT_PARAMS = {
  petals: 8,
  openness: 0.7,
  curl: 0.5,
  spin: 0.25,
  hue: 0.9,
  hueSpread: 0.18,
  current: 1,
} as const;

/** `x > threshold ? x : fallback`, the GLSL's "0 means unset" rule. */
const orDefault = (x: FloatNode, threshold: number, fallback: number): FloatNode =>
  select(greaterThan(x, threshold), x, float(fallback));

/** Rotate `p` by the 2x2 matrix GLSL writes as `mat2(c, -s, s, c) * p` (column-major). */
const rotate = (p: Vec2Node, c: FloatNode, s: FloatNode): Vec2Node =>
  vec2(add(mul(c, p.x), mul(s, p.y)), sub(mul(c, p.y), mul(s, p.x)));

function hsv2rgb(c: Vec3Node): Vec3Node {
  const K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  const p = abs(sub(mul(fract(add(vec3(c.x, c.x, c.x), K.xyz)), 6.0), K.www));
  return mul(c.z, mix(K.xxx, clamp(sub(p, K.xxx), 0.0, 1.0), c.y));
}

function hash12(p: Vec2Node): FloatNode {
  const p3 = fract(mul(vec3(p.x, p.y, p.x), 0.1031));
  const p3b = add(p3, dot(p3, add(p3.yzx, 33.33)));
  return fract(mul(add(p3b.x, p3b.y), p3b.z));
}

/** Cheap caustic web: two interfering warped sine lattices, sharpened. */
function caustics(p: Vec2Node, t: FloatNode): FloatNode {
  const q0 = mul(p, 6.0) as unknown as Vec2Node;
  const q1 = add(
    q0,
    mul(vec2(sin(add(mul(q0.y, 0.8), mul(t, 0.7))), cos(sub(mul(q0.x, 0.9), mul(t, 0.6)))), 0.9),
  ) as unknown as Vec2Node;
  const a = mul(sin(add(q1.x, t)), sin(sub(q1.y, mul(t, 0.8))));
  // mat2(0.8, -0.6, 0.6, 0.8) * q, then * 1.3.
  const q2 = mul(rotate(q1, float(0.8), float(0.6)), 1.3) as unknown as Vec2Node;
  const b = mul(sin(sub(q2.x, mul(t, 0.9))), sin(add(q2.y, mul(t, 0.5))));
  const c = sub(1.0, abs(add(a, b)));
  return pow(clamp(c, 0.0, 1.0), 6.0);
}

/** Rising bubbles: one per cell column, wrapping vertically. */
function bubbles(p: Vec2Node, t: FloatNode): FloatNode {
  const g = mul(p, vec2(7.0, 4.0)) as unknown as Vec2Node;
  const col = floor(g.x);
  const seed = hash12(vec2(col, 3.7));
  const speed = add(0.35, mul(seed, 0.45));
  const cellX = add(
    sub(fract(g.x), 0.5),
    mul(0.18, sin(add(add(mul(t, 2.0), mul(seed, 12.0)), mul(g.y, 2.0)))),
  );
  const cellY = sub(fract(add(sub(g.y, mul(t, speed)), mul(seed, 5.0))), 0.5);
  const radius = add(0.05, mul(0.06, seed));
  const d = length(vec2(cellX, mul(cellY, 1.75)));
  const ring = sub(
    smoothstep(radius, sub(radius, 0.02), d),
    smoothstep(sub(radius, 0.02), sub(radius, 0.05), d),
  );
  return mul(ring, step(0.35, seed));
}

interface LayerInputs {
  petals: FloatNode;
  bloom: FloatNode;
  curl: FloatNode;
  baseHue: FloatNode;
  hueSpread: FloatNode;
  rot: FloatNode;
  ripple: FloatNode;
  burst: FloatNode;
  t: FloatNode;
  aa: FloatNode;
}

/** One layer of petals: rgb in .xyz, coverage in .w. */
function flowerLayer(p: Vec2Node, l: LayerInputs): Vec4Node {
  const a = add(atan(p.y, p.x), l.rot);
  // "Explode" pushes every petal outward from the center, leaving a gap.
  const r = sub(length(p), mul(l.burst, 0.2));

  const lobe = pow(abs(cos(mul(mul(l.petals, 0.5), a))), mix(2.2, 0.45, clamp(l.curl, 0.0, 1.0)));
  // Petals undulate like fins: a wave travelling around and out along each petal.
  const fin = mul(l.ripple, sin(add(sub(mul(a, 3.0), mul(l.t, 2.1)), mul(r, 9.0))));
  const petalRadius = add(0.12, mul(mul(mul(l.bloom, 0.3), lobe), add(1.0, fin)));

  const torn = sub(1.0, mul(l.burst, smoothstep(0.55, 0.75, abs(sin(add(mul(l.petals, a), mul(r, 14.0)))))));
  const mask = mul(mul(smoothstep(add(petalRadius, l.aa), sub(petalRadius, l.aa), r), step(0.0, r)), torn);

  // Gradient from base (center) to tip, with a per-lobe vein shade.
  const tt = clamp(div(r, max(petalRadius, 1e-3)), 0.0, 1.0);
  const hue = fract(add(l.baseHue, mul(l.hueSpread, sub(1.0, tt))));
  const col = mul(
    hsv2rgb(vec3(hue, mix(0.45, 0.85, tt), mix(1.0, 0.82, tt))),
    mix(0.65, 1.0, lobe),
  );
  return vec4(col, mask);
}

const flowerSdfFactory: TslGraphFactory = ({ uniforms, liveUniform, time, resolution }) => {
  const param = (name: keyof typeof FLOWER_SDF_DEFAULT_PARAMS): FloatNode => uniforms.get(name) ?? float(0);
  const live = (name: (typeof FLOWER_SDF_TSL_LIVE_UNIFORMS)[number]): FloatNode => liveUniform(name, 0);

  // Centered, aspect-correct coordinates (~[-0.5, 0.5] on the short axis),
  // from bottom-left pixel coordinates like gl_FragCoord.
  const minDim = max(min(resolution.x, resolution.y), 1.0);
  const fragCoord = mul(uv(), resolution) as unknown as Vec2Node;
  const p0 = div(sub(fragCoord, mul(0.5, resolution)), minDim) as unknown as Vec2Node;
  const aa = div(1.5, minDim) as unknown as FloatNode;

  const petals = orDefault(param("petals"), 0.5, 8.0);
  const openness = orDefault(param("openness"), 0.001, 0.65);
  const curl = orDefault(param("curl"), 0.001, 0.4);
  const hueSpread = orDefault(param("hueSpread"), 0.001, 0.15);
  const current = orDefault(param("current"), 0.001, 1.0);
  const spin = param("spin");
  const baseHue = param("hue");

  const proximity = live("uProximity");
  const audio = live("uAudioLevel");
  const v = (name: (typeof FLOWER_SDF_TSL_LIVE_UNIFORMS)[number]): FloatNode =>
    clamp(live(name), 0.0, 1.0);
  const vJump = v("uVoiceJump");
  const vDance = v("uVoiceDance");
  const vSpin = v("uVoiceSpin");
  const vStop = v("uVoiceStop");
  const vExplode = v("uVoiceExplode");
  const vGrow = v("uVoiceGrow");
  const vShrink = v("uVoiceShrink");
  const vGlow = v("uVoiceGlow");
  const vColor = v("uVoiceColor");
  const vCalm = v("uVoiceCalm");

  const t = time as unknown as FloatNode;
  const motion = mul(sub(1.0, vStop), mix(1.0, 0.35, vCalm));
  const flow = mul(mul(current, motion), add(add(1.0, mul(audio, 0.8)), mul(vDance, 0.6)));

  // Water refraction: a gentle, slowly travelling warp of the whole frame.
  const warp = mul(
    vec2(
      add(sin(add(mul(p0.y, 7.0), mul(t, 0.9))), mul(0.5, sin(sub(mul(p0.y, 13.0), mul(t, 1.4))))),
      add(cos(sub(mul(p0.x, 6.0), mul(t, 0.8))), mul(0.5, cos(add(mul(p0.x, 11.0), mul(t, 1.2))))),
    ),
    mul(0.006, flow),
  );
  const wuv = add(p0, warp) as unknown as Vec2Node;

  // The flower floats: a Lissajous drift, a hop for "jump", a beat-bob for "dance".
  const drift = mul(
    vec2(
      add(mul(0.055, sin(mul(t, 0.23))), mul(0.025, sin(add(mul(t, 0.61), 1.3)))),
      add(mul(0.04, sin(add(mul(t, 0.31), 0.7))), mul(0.02, cos(mul(t, 0.53)))),
    ),
    flow,
  );
  const hop = mul(sin(mul(vJump, 3.14159)), 0.22);
  const bob = mul(vec2(mul(0.05, sin(mul(t, 6.0))), mul(0.045, abs(sin(mul(t, 6.0))))), vDance);
  const center = add(add(drift, vec2(0.0, hop)), bob);

  // Squash on take-off and landing, stretch mid-air.
  const stretch = add(1.0, mul(mul(0.18, sin(mul(vJump, 6.28318))), vJump));
  const p1 = mul(sub(wuv, center), vec2(stretch, div(1.0, stretch))) as unknown as Vec2Node;

  // Tilt with the current, wiggle with the dance.
  const tilt = add(mul(mul(0.12, sin(mul(t, 0.4))), flow), mul(mul(0.35, sin(mul(t, 6.0))), vDance));
  const p2 = rotate(p1, cos(tilt), sin(tilt));

  const r = length(p2) as unknown as FloatNode;

  // Explode: petals fly outward and the bloom swells; grow/shrink bias the bloom.
  const scatter = mul(vExplode, vExplode) as unknown as FloatNode;
  const p = div(p2, add(1.0, mul(scatter, 0.5))) as unknown as Vec2Node;

  const bloom = clamp(
    add(sub(add(add(openness, mul(proximity, 0.4)), mul(vGrow, 0.45)), mul(vShrink, 0.55)), mul(scatter, 0.3)),
    0.05,
    1.6,
  ) as unknown as FloatNode;
  const sway = mul(mul(add(0.04, mul(audio, 0.18)), sin(mul(t, 0.9))), motion);
  const rot = add(
    add(add(mul(mul(mul(spin, t), 0.3), motion), sway), mul(mul(mul(vSpin, vSpin), 6.28318), 1.5)),
    mul(mul(vDance, 0.6), sin(mul(t, 3.0))),
  ) as unknown as FloatNode;
  const ripple = add(
    mul(add(add(0.05, mul(0.1, audio)), mul(0.12, vDance)), flow),
    mul(0.25, scatter),
  ) as unknown as FloatNode;
  const hueNow = fract(
    add(add(baseHue, mul(vColor, add(0.5, mul(0.5, sin(mul(t, 0.8)))))), mul(mul(vColor, t), 0.1)),
  ) as unknown as FloatNode;

  // Background: deep water with caustics, god rays and bubbles; they fade under "stop".
  const depth = clamp(sub(0.5, mul(p0.y, 0.7)), 0.0, 1.0);
  let color = mix(vec3(0.05, 0.16, 0.22), vec3(0.01, 0.04, 0.08), depth) as unknown as Vec3Node;
  color = mul(color, mix(1.0, 0.75, smoothstep(0.3, 0.9, length(p0))));
  const ct = mul(mul(t, 0.6), mix(0.2, 1.0, motion)) as unknown as FloatNode;
  color = add(color, mul(mul(vec3(0.1, 0.22, 0.24), caustics(wuv, ct)), sub(1.0, mul(depth, 0.7))));
  const rays = add(0.5, mul(0.5, sin(add(add(mul(p0.x, 9.0), mul(p0.y, 3.0)), mul(mul(t, 0.25), motion)))));
  color = add(color, mul(mul(vec3(0.04, 0.09, 0.1), mul(rays, rays)), sub(1.0, depth)));
  const bubbleTime = add(mul(t, motion), mul(mul(vDance, t), 0.5)) as unknown as FloatNode;
  color = add(color, mul(mul(vec3(0.55, 0.75, 0.8), bubbles(wuv, bubbleTime)), 0.35));

  // Two counter-rotated layers for depth: a wide corolla and a brighter inner whorl.
  const layer = { petals, bloom, curl, hueSpread, ripple, burst: scatter, t, aa };
  const outer = flowerLayer(p, { ...layer, baseHue: hueNow, rot });
  const inner = flowerLayer(mul(p, 1.7), {
    ...layer,
    baseHue: fract(add(hueNow, 0.06)),
    rot: mul(rot, -1.3),
  });
  // Seen through water: the flower takes a little of the water's tint.
  const waterTint = vec3(0.86, 0.97, 1.0);
  color = mix(color, mul(outer.xyz, waterTint), mul(outer.w, sub(1.0, mul(scatter, 0.35))));
  color = mix(color, mul(mul(inner.xyz, 1.08), waterTint), inner.w);

  // Pulsing center eye.
  const disc = add(add(0.05, mul(0.012, sin(mul(t, 1.3)))), mul(0.02, vGlow));
  const discMask = smoothstep(add(disc, aa), sub(disc, aa), r);
  const centerCol = hsv2rgb(vec3(fract(add(hueNow, 0.08)), 0.8, 1.0));
  color = mix(color, centerCol, discMask);

  // Rim glow around the petal edge, lifted by audio and "glow".
  const edge = abs(sub(length(p), add(0.12, mul(bloom, 0.3))));
  const glow = mul(exp(mul(-7.0, edge)), add(add(0.12, mul(0.3, audio)), mul(0.55, vGlow)));
  color = add(color, mul(outer.xyz, glow));

  // Explode flash: a shock ring racing outward as the envelope decays.
  const ringR = mul(sub(1.0, vExplode), 0.9);
  const shock = mul(exp(mul(-60.0, abs(sub(r, ringR)))), vExplode);
  color = add(color, add(mul(mul(vec3(1.0, 0.92, 0.8), shock), 0.8), mul(mul(centerCol, scatter), 0.25)));

  // The GLSL writes display-space colour; hand the pipeline linear so its sRGB
  // encode shows the same bytes (see helpers/displaySpace).
  return vec4(fromDisplay(clamp(color, 0.0, 1.0)), 1.0);
};

export const FLOWER_SDF_TSL_GRAPH: TslGraphEntry = {
  id: FLOWER_SDF_TSL_SCRIPT_ID,
  label: "Procedural Flower",
  description:
    "A rose-curve flower drifting underwater; opens as viewers approach, sways to sound, and moves on spoken commands.",
  tags: ["webgpu", "tsl", "flower", "procedural", "underwater", "voice", "proximity", "audio"],
  factory: flowerSdfFactory,
};
