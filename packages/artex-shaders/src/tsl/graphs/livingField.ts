/**
 * ARTEX Living Field — the WebGPU/TSL port of `artex-living-field.frag`.
 *
 * The Living Field experience's own shader: a breathing, layered cloud tissue
 * that drifts on a current, pulls toward whoever is present (or a tracked
 * face), fractures under tension, glows with sound, and lets the artwork
 * through its pores. The experience's engine drives it with ~35 named fields
 * (material, motion, distortion, memory, light, the presence centroid and the
 * palette), sent through `setCustomUniforms`.
 *
 * A line-for-line translation of the GLSL, which stays the reference: the same
 * constants, the same order of operations, uv from the bottom-left, and display
 * space throughout (the artwork comes through the shared pipeline; the output
 * is converted with `fromDisplay`). An unset field reads 0, as an unset GLSL
 * uniform does, so the shader's own floors (`max(uDensity, 0.58)`, …) and its
 * default palette and centroid apply until the engine sends values. Its noise
 * hash is `fract(sin(x) * 43758.5)`, which differs between GPUs on GLSL too.
 *
 * Inputs: the artwork pipeline (`image`), `face`, and the exact-name live
 * uniforms listed in `LIVING_FIELD_TSL_LIVE_UNIFORMS` (scalars, plus the vec2
 * `uPresenceCentroid` and vec3 `uColorBase` / `uColorMid` / `uColorAccent`).
 */
import {
  add,
  clamp,
  cos,
  div,
  dot,
  exp,
  floor,
  fract,
  greaterThan,
  length,
  max,
  mix,
  mul,
  normalize,
  pow,
  select,
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
import {
  LIVING_FIELD_TSL_LIVE_UNIFORMS,
  LIVING_FIELD_TSL_LIVE_VECTORS,
  LIVING_FIELD_TSL_SCRIPT_ID,
} from "../scriptIds";
import { fromDisplay } from "../helpers/displaySpace";
import { sampleMain } from "../helpers/artexImage";

export { LIVING_FIELD_TSL_SCRIPT_ID };

type FloatNode = Node<"float">;
type Vec2Node = Node<"vec2">;
type Vec3Node = Node<"vec3">;

function hash(p: Vec2Node): FloatNode {
  return fract(mul(sin(dot(p, vec2(127.1, 311.7))), 43758.5453123));
}

function noise(p: Vec2Node): FloatNode {
  const i = floor(p) as unknown as Vec2Node;
  const f = fract(p) as unknown as Vec2Node;
  const a = hash(i);
  const b = hash(add(i, vec2(1, 0)));
  const c = hash(add(i, vec2(0, 1)));
  const d = hash(add(i, vec2(1, 1)));
  const u = mul(mul(f, f), sub(3.0, mul(2.0, f))) as unknown as Vec2Node;
  return add(
    add(mix(a, b, u.x), mul(mul(sub(c, a), u.y), sub(1.0, u.x))),
    mul(mul(sub(d, b), u.x), u.y),
  );
}

function fbm(p0: Vec2Node): FloatNode {
  let value: FloatNode = mul(0.0, p0.x);
  let p = p0;
  let amplitude = 0.5;
  for (let i = 0; i < 6; i += 1) {
    value = add(value, mul(amplitude, noise(p)));
    p = mul(p, 2.03);
    amplitude *= 0.52;
  }
  return value;
}

/** GLSL `rot(angle) * p` with `rot` = `mat2(c, -s, s, c)` (column-major). */
function rotate(p: Vec2Node, angle: FloatNode): Vec2Node {
  const s = sin(angle);
  const c = cos(angle);
  return vec2(add(mul(c, p.x), mul(s, p.y)), sub(mul(c, p.y), mul(s, p.x)));
}

function saturateColor(color: Vec3Node, saturation: FloatNode): Vec3Node {
  const luminance = dot(color, vec3(0.299, 0.587, 0.114));
  return mix(vec3(luminance, luminance, luminance), color, saturation);
}

const livingFieldFactory: TslGraphFactory = (inputs) => {
  const { liveUniform, liveVec2, liveVec3, time, resolution, face } = inputs;
  const live = (name: (typeof LIVING_FIELD_TSL_LIVE_UNIFORMS)[number]): FloatNode => liveUniform(name, 0);
  const vector = LIVING_FIELD_TSL_LIVE_VECTORS;
  const uTime = time;

  const density = max(live("uDensity"), 0.58);
  const softness = max(live("uSoftness"), 0.24);
  const porosity = max(live("uPorosity"), 0.12);
  const viscosity = max(live("uViscosity"), 0.72);
  const granularity = max(live("uGranularity"), 0.08);
  const layerSeparation = max(live("uLayerSeparation"), 0.42);
  const flowSpeedField = max(live("uFlowSpeedField"), 0.16);
  const breathingRate = max(live("uBreathingRate"), 0.08);
  const breathingDepth = max(live("uBreathingDepth"), 0.04);
  const driftAmount = max(live("uDrift"), 0.03);
  const displacementAmount = max(live("uDisplacementAmount"), 0.08);
  const pullStrength = max(live("uPullStrength"), 0.12);
  const stretchStrength = max(live("uStretchStrength"), 0.08);
  const fractureAmount = max(live("uFractureAmount"), 0.015);
  const warpScale = max(live("uWarpScale"), 1.2);
  const focusFalloff = max(live("uFocusFalloff"), 0.18);
  const trailDecay = max(live("uTrailDecay"), 0.96);
  const afterglow = max(live("uAfterglow"), 0.18);
  const imprintStrength = max(live("uImprintStrength"), 0.14);
  const memoryBlur = max(live("uMemoryBlur"), 0.08);
  const emissiveField = max(live("uEmissiveField"), 0.5);
  const bloomField = max(live("uBloomField"), 0.24);
  const contrastField = max(live("uContrastField"), 1.08);
  const blackLevelField = clamp(live("uBlackLevelField"), 0.0, 0.2);
  const vignetteField = max(live("uVignetteField"), 0.08);
  const saturationField = max(live("uSaturationField"), 0.42);
  const centroid = liveVec2(vector.presenceCentroid);
  const presenceCentroid = select(greaterThan(length(centroid), 0.001), centroid, vec2(0.5, 0.52));
  const colorBase = liveVec3(vector.colorBase);
  const colorMid = liveVec3(vector.colorMid);
  const colorAccent = liveVec3(vector.colorAccent);
  const hasPalette = step(0.001, add(length(colorMid), length(colorAccent)));
  const colorBaseField = mix(vec3(0.01, 0.012, 0.02), colorBase, hasPalette);
  const colorMidField = mix(vec3(0.42, 0.52, 0.68), colorMid, hasPalette);
  const colorAccentField = mix(vec3(0.82, 0.9, 0.98), colorAccent, hasPalette);

  const memoryResidue = live("uMemoryResidueField");
  const audioPulse = live("uAudioPulse");
  const intimacy = live("uIntimacy");
  const effectParam1 = live("uEffectParam1");
  const effectParam2 = live("uEffectParam2");
  const effectParam3 = live("uEffectParam3");

  const fragUv = uv() as unknown as Vec2Node;
  const aspect = div(resolution.x, max(1.0, resolution.y));
  const centered = vec2(mul(sub(fragUv.x, 0.5), aspect), sub(fragUv.y, 0.5)) as unknown as Vec2Node;

  const focus = mix(
    presenceCentroid,
    face.center,
    clamp(add(mul(face.present, 0.65), mul(intimacy, 0.35)), 0.0, 1.0),
  ) as unknown as Vec2Node;
  const focusVec0 = sub(focus, fragUv) as unknown as Vec2Node;
  const focusVec = vec2(mul(focusVec0.x, aspect), focusVec0.y) as unknown as Vec2Node;
  const focusDistance = length(focusVec);
  const focusInfluence = exp(div(mul(focusDistance, -1.0), max(0.02, mul(focusFalloff, 0.95))));

  const breath = add(
    1.0,
    mul(
      sin(add(mul(uTime, add(0.65, mul(breathingRate, 7.2))), mul(audioPulse, 2.4))),
      add(mul(breathingDepth, 0.9), 0.02),
    ),
  );
  const flowDirection = live("uFlowDirection");
  const flowAxis = vec2(cos(flowDirection), sin(flowDirection));
  const drift = mul(flowAxis, mul(uTime, add(0.02, mul(flowSpeedField, 0.2)))) as unknown as Vec2Node;
  const memoryDrift = vec2(
    mul(mul(uTime, driftAmount), 0.08),
    mul(mul(uTime, -1.0), add(0.01, mul(memoryResidue, 0.05))),
  ) as unknown as Vec2Node;

  let warpedUv = add(mul(sub(fragUv, 0.5), breath), 0.5) as unknown as Vec2Node;
  warpedUv = add(
    warpedUv,
    mul(sub(fbm(add(mul(warpedUv, add(1.2, warpScale)), drift)), 0.5), add(0.08, mul(displacementAmount, 0.16))),
  );
  warpedUv = add(
    warpedUv,
    mul(mul(mul(normalize(add(focusVec, 1e-4)), focusInfluence), pullStrength), 0.08),
  );
  warpedUv = add(
    warpedUv,
    sub(
      mul(
        vec2(
          fbm(mul(add(warpedUv, drift), add(2.4, warpScale))),
          fbm(mul(sub(warpedUv, drift.yx), add(2.0, mul(warpScale, 0.8)))),
        ),
        0.12,
      ),
      0.06,
    ),
  );

  const rotated = add(
    rotate(sub(warpedUv, 0.5), add(mul(sub(live("uNovelty"), 0.5), 0.35), mul(live("uMotionAmount"), 0.1))),
    0.5,
  ) as unknown as Vec2Node;
  const tissueUv = vec2(mul(rotated.x, aspect), rotated.y) as unknown as Vec2Node;

  const innerField = fbm(add(add(mul(tissueUv, add(1.35, mul(viscosity, 1.45))), drift), memoryDrift));
  const layerField = fbm(
    sub(
      mul(add(tissueUv, vec2(mul(layerSeparation, 0.18), mul(layerSeparation, -0.12))), add(2.25, mul(stretchStrength, 1.3))),
      mul(drift, 1.6),
    ),
  );
  const residueField = fbm(
    add(mul(add(tissueUv, mul(memoryDrift, 0.35)), add(4.4, mul(memoryBlur, 2.2))), vec2(11.2, -4.7)),
  );
  let field: FloatNode = mix(innerField, layerField, add(0.42, mul(intimacy, 0.08)));
  field = add(field, mul(sub(residueField, 0.5), add(0.12, mul(memoryResidue, 0.22))));
  field = add(
    field,
    mul(
      sub(fbm(sub(mul(tissueUv, add(9.0, mul(granularity, 7.0))), mul(drift, 0.35))), 0.5),
      add(mul(granularity, 0.34), 0.01),
    ),
  );

  const pulseGlow = add(add(mul(audioPulse, 0.18), mul(live("uArousal"), 0.1)), mul(live("uBassLevel"), 0.12));
  const fracture = smoothstep(
    0.56,
    0.86,
    fbm(sub(mul(tissueUv, add(7.0, mul(fractureAmount, 8.0))), mul(uTime, add(0.06, mul(live("uTension"), 0.18))))),
  );
  field = mul(field, sub(1.0, mul(fracture, add(0.22, mul(fractureAmount, 0.38)))));

  const densityCenter = mix(density, add(0.42, mul(live("uAttention"), 0.18)), mul(focusInfluence, 0.55));
  field = smoothstep(
    sub(densityCenter, add(mul(softness, 0.75), 0.04)),
    add(densityCenter, add(mul(softness, 0.9), 0.06)),
    field,
  );

  const eyeDistance = (eye: Vec2Node): FloatNode =>
    length(mul(sub(fragUv, eye), vec2(aspect, 1.0)));
  const eyeTrace = add(
    mul(mul(exp(mul(eyeDistance(face.leftEye), -18.0)), face.present), 0.5),
    mul(mul(exp(mul(eyeDistance(face.rightEye), -18.0)), face.present), 0.5),
  );
  const traceField = fbm(
    mul(add(fragUv, vec2(mul(uTime, 0.03), mul(uTime, -0.02))), add(5.0, mul(trailDecay, 2.0))),
  );
  field = add(field, add(mul(eyeTrace, add(0.08, mul(afterglow, 0.2))), mul(mul(traceField, imprintStrength), 0.1)));

  // The artwork, when loaded, shows through the pores; alone, the field stands on its own.
  const baseImage = sampleMain(inputs, fragUv);
  const baseLuma = dot(baseImage.rgb, vec3(0.299, 0.587, 0.114));
  field = add(field, mul(baseLuma, add(0.08, mul(porosity, 0.12))));

  let glow: FloatNode = add(0.08, mul(focusInfluence, add(0.12, mul(afterglow, 0.24))));
  glow = add(glow, pulseGlow);
  glow = add(glow, add(mul(live("uCameraLevel"), 0.08), mul(live("uProximity"), 0.1)));
  glow = add(glow, mul(pow(max(0.0, field), 2.0), add(mul(emissiveField, 0.35), 0.08)));

  const veil = add(add(0.06, mul(residueField, 0.08)), mul(focusInfluence, 0.05));
  let value: FloatNode = clamp(add(add(mul(field, 0.78), glow), veil), 0.0, 1.0);
  value = pow(value, div(1.0, max(0.001, add(contrastField, mul(effectParam2, 0.18)))));
  value = max(0.0, sub(value, max(0.0, sub(blackLevelField, mul(effectParam1, 0.04)))));

  let color: Vec3Node = mix(colorBaseField, colorMidField, value);
  color = mix(color, colorAccentField, clamp(mul(pow(value, 1.55), add(0.72, mul(effectParam3, 0.3))), 0.0, 1.0));
  color = add(color, mul(mul(baseImage.rgb, add(0.06, mul(baseLuma, 0.18))), porosity));
  color = saturateColor(color, add(saturationField, mul(effectParam3, 0.12)));
  color = add(color, mul(vec3(1.0, 1.0, 1.0), mul(pow(max(0.0, value), 3.0), add(mul(bloomField, 0.45), 0.04))));

  const vignette = smoothstep(add(1.18, mul(vignetteField, 0.55)), 0.12, length(centered));
  color = mul(color, vignette);
  color = mul(color, add(0.95, mul(live("uEffectStrength"), 0.08)));

  return vec4(
    fromDisplay(clamp(color, 0.0, 1.0)),
    clamp(add(value, mul(afterglow, 0.14)), 0.0, 1.0),
  );
};

export const LIVING_FIELD_TSL_GRAPH: TslGraphEntry = {
  id: LIVING_FIELD_TSL_SCRIPT_ID,
  label: "ARTEX Living Field",
  description:
    "A breathing cloud tissue that drifts, pulls toward presence and a tracked face, fractures under tension and glows with sound.",
  tags: ["webgpu", "tsl", "image", "field", "presence", "face", "audio", "experience"],
  factory: livingFieldFactory,
};
