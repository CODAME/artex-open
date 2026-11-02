/**
 * Reeded Glass Portrait — the WebGPU/TSL port of `Reeded Glass Portrait ARTEX.glsl`.
 *
 * The artwork seen through a column of vertical cylindrical lenses: each rib
 * refracts the source sideways, repeating features and smearing them into
 * dark drips, under a warm amber duotone. Sound adds shimmer on the rib seams,
 * proximity clears the glass, and a tracked face centres the ribs on itself.
 *
 * A line-for-line translation of the GLSL, which stays the reference: the same
 * constants, the same order of operations (including its own flow warp before
 * the shared one, so flow applies twice, as it does there), the same
 * coordinate frame (uv from the bottom-left, as `gl_FragCoord / uResolution`)
 * and the same colour space: it samples and grades in display space through
 * the artwork pipeline and converts its output with `fromDisplay`.
 *
 * Inputs:
 *   - the artwork pipeline (`image`): contained artwork, pan/zoom, flow,
 *     evolution states. Two or more states are sampled stretched, not
 *     contained, as the GLSL does.
 *   - live exact-name uniforms: uEffectStrength, uEffectParam1..3 (the Studio
 *     sliders), uAudioLevel, uBassLevel, uProximity, uCameraLevel,
 *     uTransientLevel, uFlowEnabled/Intensity/Speed/Scale.
 *   - `face`: centre and presence.
 */
import {
  abs,
  add,
  and,
  clamp,
  div,
  dot,
  floor,
  fract,
  greaterThan,
  greaterThanEqual,
  length,
  lessThan,
  max,
  mix,
  mul,
  pow,
  select,
  sign,
  sin,
  smoothstep,
  step,
  sub,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { Node } from "three/webgpu";
import type { TslGraphEntry, TslGraphFactory } from "@artex/contract/tsl";
import { REEDED_GLASS_TSL_LIVE_UNIFORMS, REEDED_GLASS_TSL_SCRIPT_ID } from "../scriptIds";
import { fromDisplay, toDisplay4 } from "../helpers/displaySpace";
import { sampleMain } from "../helpers/artexImage";

export { REEDED_GLASS_TSL_SCRIPT_ID };

type FloatNode = Node<"float">;
type Vec2Node = Node<"vec2">;
type Vec3Node = Node<"vec3">;
type Vec4Node = Node<"vec4">;

/** The GLSL's `const float uMood = 0.5;`. */
const MOOD = 0.5;

const sat = (x: FloatNode): FloatNode => clamp(x, 0.0, 1.0);

function hash11(p: FloatNode): FloatNode {
  return fract(mul(sin(add(mul(p, 127.1), 311.7)), 43758.5453123));
}

function hash12(p: Vec2Node): FloatNode {
  return fract(mul(sin(dot(p, vec2(127.1, 311.7))), 43758.5453123));
}

function noise2(p: Vec2Node): FloatNode {
  const i = floor(p) as unknown as Vec2Node;
  const f = fract(p) as unknown as Vec2Node;
  const a = hash12(i);
  const b = hash12(add(i, vec2(1, 0)));
  const c = hash12(add(i, vec2(0, 1)));
  const d = hash12(add(i, vec2(1, 1)));
  const u = mul(mul(f, f), sub(3.0, mul(2.0, f))) as unknown as Vec2Node;
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

function luma(c: Vec3Node): FloatNode {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

const reededGlassFactory: TslGraphFactory = (inputs) => {
  const { liveUniform, time, resolution, image, face } = inputs;
  const live = (name: (typeof REEDED_GLASS_TSL_LIVE_UNIFORMS)[number], initial: number): FloatNode =>
    liveUniform(name, initial);

  // The shader's own flow warp (a different noise from the shared one).
  const applyFlow = (p0: Vec2Node): Vec2Node => {
    const p = mul(p0, max(mul(live("uFlowScale", 3), 6.0), 0.5)) as unknown as Vec2Node;
    const drift = mul(time, live("uFlowSpeed", 0.4));
    const nx = noise2(add(add(p, vec2(11.0, 0.0)), drift));
    const ny = noise2(add(add(p, vec2(0.0, 11.0)), drift));
    const warped = add(p0, mul(vec2(sub(nx, 0.5), sub(ny, 0.5)), mul(live("uFlowIntensity", 0.05), 0.12)));
    return select(greaterThan(abs(sub(live("uFlowEnabled", 0), 1)), 0.5), p0, warped);
  };

  // `sampleSource`: clamped so refraction near rib edges never wraps. Two or
  // more states blend A and B stretched over the frame; otherwise the shared
  // pipeline (contained artwork or states, flow again).
  const sampleSource = (p: Vec2Node): Vec4Node => {
    const clamped = clamp(applyFlow(p), vec2(0.0, 0.0), vec2(1.0, 1.0)) as unknown as Vec2Node;
    const a = toDisplay4(image.states[0].sample(clamped));
    const b = toDisplay4(image.states[1].sample(clamped));
    const stretched = mix(a, b, sat(image.blendFactor));
    return select(greaterThanEqual(floor(image.stateCount), 2), stretched, sampleMain(inputs, clamped));
  };

  const res = max(resolution, vec2(1.0, 1.0)) as unknown as Vec2Node;
  const fragUv = uv() as unknown as Vec2Node;
  const fragCoord = mul(fragUv, res) as unknown as Vec2Node;
  const canvasAspect = div(res.x, res.y);

  // Preserve artwork bounds: don't paint into letterbox/pillarbox.
  const baseSample = sampleSource(fragUv);
  const mediaPresence = smoothstep(0.0, 0.05, baseSample.a);

  const audio = sat(live("uAudioLevel", 0));
  const bass = sat(live("uBassLevel", 0));
  const transient = sat(live("uTransientLevel", 0));
  const proximity = sat(live("uProximity", 0));
  const camera = sat(live("uCameraLevel", 0));
  const mood = MOOD;

  // Subject anchor: the optical axis follows the tracked face.
  const haveFace = sat(face.present);
  const anchor = mix(vec2(0.5, 0.5), clamp(face.center, vec2(0.05, 0.05), vec2(0.95, 0.95)), haveFace) as unknown as Vec2Node;

  const densityKnob = add(0.15, mul(1.85, sat(mul(live("uEffectParam1", 1), 0.5))));
  const ribCount = clamp(
    add(mul(mix(14.0, 56.0, sat(mul(densityKnob, 0.5))), 0.9 + 0.25 * mood), mul(4.0, bass)),
    8.0,
    96.0,
  );

  const curvature = add(
    add(add(mul(0.65, sat(mul(live("uEffectParam2", 1), 0.55))), 0.2), mul(0.22, bass)),
    mul(0.1, transient),
  );
  const drip = add(mul(sat(mul(live("uEffectParam3", 1), 0.55)), 0.85), mul(0.15, proximity));
  const warmth = sat(add(MOOD * 0.5 + 0.35, mul(0.25, camera)));

  // --- Rib lattice, centred on the anchor ---
  const centeredX = sub(fragUv.x, anchor.x);
  const ribIndex = floor(add(mul(centeredX, ribCount), 0.5));
  const ribCenterX = add(anchor.x, div(ribIndex, ribCount));
  const ribHalf = div(0.5, ribCount);
  const ribLocal = clamp(div(sub(fragUv.x, ribCenterX), ribHalf), -1.0, 1.0);

  const ribSig = hash11(add(mul(ribIndex, 1.37), 4.1));
  const ribSig2 = hash11(add(mul(ribIndex, 2.71), 9.3));

  // Cylindrical refraction, a slow sway, and per-rib jitter.
  let lensBend = mul(sin(mul(ribLocal, 1.5707963)), curvature);
  lensBend = add(lensBend, mul(mul(0.04, sin(add(mul(time, 0.55), mul(ribSig, 6.2831)))), curvature));
  lensBend = add(lensBend, mul(mul(sub(ribSig, 0.5), 0.06), curvature));

  // Drip: pull the sample up the rib, weighted towards the bottom.
  const dripMask = smoothstep(0.05, 0.95, fragUv.y);
  const dripProfile = pow(dripMask, 1.4);
  const dripAmount = mul(
    mul(mul(drip, dripProfile), add(0.35, mul(0.65, ribSig2))),
    add(0.85, mul(0.15, sin(add(mul(time, 0.35), mul(ribSig, 12.0))))),
  );
  const refractedY0 = sub(fragUv.y, mul(dripAmount, 0.22));
  // Slight per-rib vertical stretch.
  const refractedY = mix(refractedY0, add(0.5, mul(sub(refractedY0, 0.5), sub(1.0, mul(0.08, curvature)))), 0.4);
  const refractedUv = vec2(add(ribCenterX, mul(mul(lensBend, ribHalf), 1.15)), refractedY) as unknown as Vec2Node;

  const refracted = sampleSource(refractedUv);
  let glass: Vec3Node = refracted.rgb;

  // A neighbour sample at the seam makes the rib edge read as a hard boundary.
  const seam = sub(1.0, abs(ribLocal));
  const seamBend = mul(mul(mul(sign(ribLocal), sub(1.0, seam)), curvature), 0.3);
  const seamSample = sampleSource(vec2(add(ribCenterX, seamBend), refractedY));
  const seamMix = pow(sub(1.0, seam), 3.0);
  glass = mix(glass, seamSample.rgb, mul(seamMix, 0.25));

  // Rib shimmer where ribs meet, lifted by audio, camera and transients.
  const seamLine = smoothstep(0.85, 1.0, sub(1.0, abs(ribLocal)));
  const shimmer = add(
    mul(seamLine, add(add(0.3, mul(0.7, audio)), mul(0.35, camera))),
    mul(mul(mul(seamLine, transient), 0.45), add(0.5, mul(0.5, sin(add(mul(time, 9.0), mul(ribSig, 17.0)))))),
  );

  // --- Drip darkening ---
  const sampleLuma = luma(glass);
  const dripDarken = mul(
    mul(mul(sub(1.0, smoothstep(0.15, 0.55, sampleLuma)), dripProfile), drip),
    add(0.55, mul(0.45, ribSig2)),
  );
  glass = mix(glass, mul(glass, 0.08), sat(dripDarken));

  // --- Duotone grade ---
  const shadow = mix(vec3(0.02, 0.01, 0.02), vec3(0.24, 0.03, 0.02), warmth);
  const mid = mix(vec3(0.62, 0.18, 0.05), vec3(0.95, 0.35, 0.05), warmth);
  const highlight = mix(vec3(0.98, 0.7, 0.18), vec3(1.0, 0.82, 0.22), warmth);

  const L = sat(pow(sampleLuma, 0.85));
  let graded: Vec3Node = mix(shadow, mid, smoothstep(0.0, 0.55, L));
  graded = mix(graded, highlight, smoothstep(0.45, 1.0, L));
  graded = mix(graded, glass, mul(0.12, sub(1.0, warmth)));
  graded = mul(graded, add(add(1.0, mul(0.1, audio)), mul(0.06, bass)));
  graded = add(graded, mul(mul(vec3(1.0, 0.55, 0.15), shimmer), 0.35));

  // Proximity clears the glass.
  graded = mix(graded, glass, mul(proximity, 0.55));

  // Vignette.
  const vignetteP = vec2(mul(sub(mul(fragUv.x, 2.0), 1.0), canvasAspect), sub(mul(fragUv.y, 2.0), 1.0));
  const vignette = sub(1.0, smoothstep(0.8, 1.7, mul(length(vignetteP), sub(0.95, mul(0.15, warmth)))));
  graded = mul(graded, mix(1.0, vignette, 0.35));

  // Film grain.
  const grain = mul(sub(hash12(add(fragCoord, mul(time, 37.0))), 0.5), 0.04);
  graded = add(graded, mul(grain, add(0.5, mul(0.5, warmth))));

  // Output: blend with the artwork by strength and clip to the media region;
  // with no media at all, the graded ribs stand alone at `strength`.
  const strength = sat(live("uEffectStrength", 1));
  const mixed = mix(baseSample.rgb, graded, strength);
  const alpha0 = max(baseSample.a, mul(strength, sub(1.0, mediaPresence)));
  const alpha1 = mul(alpha0, max(mediaPresence, step(0.001, baseSample.a)));
  const noSource = and(lessThan(alpha1, 0.001), lessThan(mediaPresence, 0.001));
  const finalColor = select(noSource, graded, mixed);
  const alpha = select(noSource, strength, alpha1);

  return vec4(fromDisplay(clamp(finalColor, 0.0, 1.0)), sat(alpha));
};

export const REEDED_GLASS_TSL_GRAPH: TslGraphEntry = {
  id: REEDED_GLASS_TSL_SCRIPT_ID,
  label: "Reeded Glass Portrait",
  description:
    "Portrait viewed through vertical fluted glass — face refracts into amber ribs with black drips, reactive to face, audio, and proximity.",
  tags: ["webgpu", "tsl", "portrait", "glass", "refraction", "image", "face", "audio", "proximity"],
  factory: reededGlassFactory,
};
