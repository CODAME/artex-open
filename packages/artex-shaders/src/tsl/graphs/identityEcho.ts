/**
 * Identity Echo — the WebGPU/TSL port of `Identity Echo ARTEX.glsl`
 * (`identity-echo-artex`, the builtin the Studio's Identity Echo experience
 * preset picks).
 *
 * Where a visitor's face is, the artwork opens into the live camera: a
 * face-shaped window, two eye windows or a wide soft halo. With no face
 * reported the artwork plays untouched. The camera shows inside the mask;
 * nothing here records it.
 *
 * A line-for-line translation of the GLSL, which stays the reference: the same
 * constants and order of operations, display space throughout. Parity is
 * pinned per pixel in `identityEcho.headless.test.ts`.
 *
 * Inputs, as the GLSL reads them:
 *   uMainImage                      -> `source` (the composite's base target)
 *   iChannel1                       -> `channels.textures[1]` (the camera)
 *   iChannelResolution[1]           -> `channels.resolutions[1]`
 *   uFaceCenter/uLeftEye/uRightEye  -> `face` (GL uv, bottom-left)
 *   uHasFace                        -> `face.present`
 *   uEffectParam1..3 (0..2, each halved to 0..1: opacity, softness, mask
 *   mode in thirds: face, eyes, aura) -> exact-name live uniforms
 *
 * The camera covers the frame (cropped, never stretched) and the face points,
 * which are in the camera's own uv, go through the same mapping, so the window
 * lands on the face whatever the shapes of camera and screen.
 *
 * Orientation (docs/shaders.md, "Orientation"): the GLSL's `uv` is
 * `gl_FragCoord / uResolution`, bottom-up. On the WebGPU compositor `uv()`
 * grows down, so the graph works in GL uv, `(u, 1 - v)`: the face points are
 * in it, and the camera's texture keeps its top at v = 1. The base is a render
 * target and is read in the compositor's own uv, as the composite reads it.
 */
import { add, distance, div, float, greaterThan, lessThan, max, mix, mul, select, smoothstep, step, sub, uv, vec2, vec4, clamp } from "three/tsl";
import type { Node } from "three/webgpu";
import type { TslGraphEntry, TslGraphFactory } from "@artex/contract/tsl";
import { IDENTITY_ECHO_TSL_LIVE_UNIFORMS, IDENTITY_ECHO_TSL_SCRIPT_ID } from "../scriptIds";
import { fromDisplay, toDisplay4 } from "../helpers/displaySpace";

export { IDENTITY_ECHO_TSL_SCRIPT_ID };

type FloatNode = Node<"float">;
type Vec2Node = Node<"vec2">;
type Vec4Node = Node<"vec4">;

const identityEchoFactory: TslGraphFactory = (inputs) => {
  const { liveUniform, resolution, face, channels, source } = inputs;
  const live = (name: (typeof IDENTITY_ECHO_TSL_LIVE_UNIFORMS)[number]): FloatNode => liveUniform(name, 1);

  const screen = uv();
  const glUv = vec2(screen.x, sub(1, screen.y)) as unknown as Vec2Node;

  // vec4 art = texture2D(uMainImage, uv);
  const art = toDisplay4(source.sample(screen));

  // Cover: the part of the camera frame the screen shows, per axis.
  const camRes = max(channels.resolutions[1], vec2(1, 1)) as unknown as Vec2Node;
  const camAspect = div(camRes.x, camRes.y);
  const frameAspect = div(resolution.x, max(resolution.y, 1.0));
  const window = mix(
    vec2(1.0, div(camAspect, frameAspect)),
    vec2(div(frameAspect, camAspect), 1.0),
    step(frameAspect, camAspect),
  ) as unknown as Vec2Node;
  const cam = toDisplay4(channels.textures[1].sample(add(mul(sub(glUv, 0.5), window), 0.5)));

  // Face points from the camera's uv to the screen's, then to pixels.
  const toScreenPx = (point: Node<"vec2">): Vec2Node =>
    mul(add(div(sub(point, 0.5), window), 0.5), resolution);
  const px = mul(glUv, resolution) as unknown as Vec2Node;
  const facePx = toScreenPx(face.center);
  const lEyePx = toScreenPx(face.leftEye);
  const rEyePx = toScreenPx(face.rightEye);
  const eyeDist = distance(lEyePx, rEyePx);
  const faceR = max(mul(eyeDist, 1.85), 64.0);

  const p1 = clamp(mul(live("uEffectParam1"), 0.5), 0.0, 1.0);
  const p2 = clamp(mul(live("uEffectParam2"), 0.5), 0.0, 1.0);
  const p3 = clamp(mul(live("uEffectParam3"), 0.5), 0.0, 1.0);
  const opacity = mix(float(0.85), float(1.0), p1);
  const softness = p2;
  const maskMode = mul(p3, 3.0);

  // Face: one oval window.
  const faceSoft = mul(faceR, mix(float(0.04), float(0.55), softness));
  const faceMask = sub(1.0, smoothstep(sub(faceR, faceSoft), add(faceR, faceSoft), distance(px, facePx)));

  // Eyes: two soft circles.
  const eyeR = mul(eyeDist, 0.58);
  const eyeSoft = mul(eyeR, mix(float(0.1), float(0.65), softness));
  const eyesMask = max(
    sub(1.0, smoothstep(sub(eyeR, eyeSoft), add(eyeR, eyeSoft), distance(px, lEyePx))),
    sub(1.0, smoothstep(sub(eyeR, eyeSoft), add(eyeR, eyeSoft), distance(px, rEyePx))),
  );

  // Aura: a wide diffuse halo.
  const auraR = mul(faceR, 2.4);
  const auraSoft = mul(auraR, mix(float(0.28), float(0.72), softness));
  const auraMask = sub(1.0, smoothstep(sub(auraR, auraSoft), add(auraR, auraSoft), distance(px, facePx)));

  const mask = select(lessThan(maskMode, 1.0), faceMask, select(lessThan(maskMode, 2.0), eyesMask, auraMask));

  // gl_FragColor = mix(art, cam, mask * opacity * uHasFace);
  // With no camera bound, WebGL's channel 1 falls back to the base, so the
  // window shows the artwork unchanged; here an empty slot is transparent and
  // would darken it. An unbound slot reports 1x1: no camera, no window.
  const hasCamera = select(greaterThan(channels.resolutions[1].x, 1.5), float(1), float(0));
  const color = mix(art, cam, mul(mul(mul(mask, opacity), face.present), hasCamera)) as unknown as Vec4Node;
  return vec4(fromDisplay(color.rgb), color.a);
};

export const IDENTITY_ECHO_TSL_GRAPH: TslGraphEntry = {
  id: IDENTITY_ECHO_TSL_SCRIPT_ID,
  label: "Identity Echo",
  description: "Your face becomes a window into the artwork: the camera shows through a face-shaped mask you can soften, or move to the eyes or an aura.",
  tags: ["webgpu", "tsl", "camera", "face", "portrait", "presence"],
  factory: identityEchoFactory,
};
