/**
 * Headless pixel tests for the evolution effects mounted on their own, so
 * each output can be read back as a number: a warped uv as red and green, a
 * colour effect over a known input colour. Expectations are the GLSL in
 * `unifiedFragmentShader`, transcribed to JS below.
 *
 * Paint's brush and inside's streaks are broken up by `artex_noise`, whose
 * hash is `fract(sin(x) * 43758.5)`: the reference computes it in 32-bit
 * floats, as the GPU does (and WebGL did), since in doubles it lands
 * somewhere else entirely.
 */
import { describe, it, expect, afterAll } from "vitest";
import { clamp, texture, uniform, uv, vec3, vec4 } from "three/tsl";
import { ClampToEdgeWrapping, DataTexture, LinearFilter, NearestFilter, SRGBColorSpace, Vector2 } from "three/webgpu";
import type { Node } from "three/webgpu";
import type { TslPassInputs, TslScalarUniform } from "@artex/contract/tsl";
import { pixelAt, type HeadlessFrame } from "@artex/render-core/testing/headless-gpu";
import { probeHeadlessGpu } from "../testing/headlessGpuProbe";
import { stubFaceInputs, stubImageInputs, stubLiveVectors } from "../testing/stubImageInputs";
import { fromDisplay } from "./displaySpace";
import { applyInsideColor, applyInsideUv, applyPaintLocal } from "./evolutionEffects";

const gpu = await probeHeadlessGpu();
afterAll(() => gpu?.dispose());

const SIZE = 64;
type Rgb = [number, number, number];

/** A square artwork, `left` then `right` from the middle column on, tagged sRGB like the backend's. */
function artworkOf(left: Rgb, right: Rgb = left, filter: typeof NearestFilter | typeof LinearFilter = NearestFilter): DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i += 1) data.set([...(i % SIZE < SIZE / 2 ? left : right), 255], i * 4);
  const tex = new DataTexture(data, SIZE, SIZE);
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = filter;
  tex.minFilter = filter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function setup(artwork: DataTexture, settings: Record<string, number>, time: number) {
  const uniforms = new Map<string, TslScalarUniform>();
  const source = artwork;
  const inputs: TslPassInputs = {
    source: texture(source),
    prevPass: texture(source),
    previousSource: texture(source),
    uniforms,
    image: stubImageInputs(SIZE, SIZE),
    face: stubFaceInputs(),
    ...stubLiveVectors(),
    liveUniform(name: string, initial = 0) {
      let node = uniforms.get(name);
      if (!node) {
        node = uniform(initial);
        uniforms.set(name, node);
      }
      return node;
    },
    time: uniform(time),
    resolution: uniform(new Vector2(SIZE, SIZE)),
    interaction: { audioLevel: uniform(0), bassLevel: uniform(0), proximity: uniform(0), cameraLevel: uniform(0) },
  };
  const apply = () => {
    for (const [name, value] of Object.entries(settings)) (uniforms.get(name) as { value: number }).value = value;
  };
  return { inputs, apply };
}

/** Mount `rgb` (display space, read back as bytes of it) and draw one frame with `settings` applied. */
async function draw(apply: () => void, rgb: Node<"vec3">): Promise<HeadlessFrame> {
  if (!gpu) throw new Error("unreachable: the suite is skipped without an adapter");
  const scene = gpu.mountColorNode(vec4(fromDisplay(clamp(rgb, 0, 1)), 1), SIZE, { screen: "srgb" });
  apply();
  return scene.frame();
}

/** The uv of screen pixel (x, y): the mount reads back flipped. */
const uvAt = (x: number, y: number): [number, number] => [(x + 0.5) / SIZE, (SIZE - 1 - y + 0.5) / SIZE];

/** The worst channel difference over the frame; `want` returns null to skip a pixel. */
function worstOver(frame: HeadlessFrame, want: (u: number, v: number) => number[] | null): number {
  let worst = 0;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const got = pixelAt(frame, x, y);
      want(...uvAt(x, y))?.forEach((w, c) => {
        worst = Math.max(worst, Math.abs(got[c] - Math.round(Math.min(1, Math.max(0, w)) * 255)));
      });
    }
  }
  return worst;
}

describe.skipIf(!gpu)("evolution effects on their own (headless WebGPU)", { timeout: 20_000 }, () => {
  it("warps the uv as the WebGL base pass's inside fly-through does", async () => {
    const settings = { intensity: 1.3, speed: 0.7, twist: 0.6, time: 1.7 };
    const { inputs, apply } = setup(
      artworkOf([0, 0, 0]),
      { uInsideEnabled: 1, uInsideIntensity: settings.intensity, uInsideSpeed: settings.speed, uInsideTwist: settings.twist },
      settings.time,
    );
    const warped = applyInsideUv(inputs, uv());
    const frame = await draw(apply, vec3(warped.x, warped.y, 0));
    expect(worstOver(frame, (u, v) => [...insideUvReference([u, v], settings), 0])).toBeLessThanOrEqual(1);
  });

  // This pixel reference depends on `artex_hash`'s sine. Metal's GPU `sin`
  // approximation differs from JS Math.sin in low bits, which the 43758.5453
  // multiplier amplifies into a different noise field. Keep the exact oracle
  // only on Lavapipe, the adapter used for the reference comparison, and exercise
  // the effect on all GPUs.
  it("lights the colour as the WebGL base pass's inside fly-through does", async () => {
    const settings = { intensity: 1.6, speed: 0.9, time: 2.4 };
    const color: Rgb = [0.35, 0.5, 0.62];
    const { inputs, apply } = setup(
      artworkOf([0, 0, 0]),
      { uInsideEnabled: 1, uInsideIntensity: settings.intensity, uInsideSpeed: settings.speed },
      settings.time,
    );
    const lit = applyInsideColor(inputs, vec4(...color, 1), uv());
    const frame = await draw(apply, lit.rgb);
    const changedPixels = Array.from({ length: SIZE * SIZE }, (_, index) => {
      const pixel = pixelAt(frame, index % SIZE, Math.floor(index / SIZE));
      return pixel.some((channel, i) => Math.abs(channel - Math.round(color[i] * 255)) > 2);
    }).filter(Boolean).length;
    expect(changedPixels).toBeGreaterThan(100);
    if (gpu && /lavapipe/i.test(gpu.adapterName)) {
      expect(worstOver(frame, (u, v) => insideColorReference(color, [u, v], settings))).toBeLessThanOrEqual(2);
    }
  });

  it("paints as the WebGL base pass's local paint does", async () => {
    // Split down the middle, under the brush, and linearly filtered: the split
    // is a one-texel ramp, so where the smear samples shows to a fraction of
    // a texel.
    const [left, right]: Rgb[] = [[200, 80, 40], [30, 90, 220]];
    const color: Rgb = [0.3, 0.6, 0.5];
    const paint = { strength: 1.2, x: 0.4, y: 0.6, radius: 0.3, hardness: 0.5, hue: 0.15, time: 1.1 };
    const { inputs, apply } = setup(
      artworkOf(left, right, LinearFilter),
      {
        uPaintEnabled: 1,
        uPaintStrength: paint.strength,
        uPaintX: paint.x,
        uPaintY: paint.y,
        uPaintRadius: paint.radius,
        uPaintHardness: paint.hardness,
        uPaintHue: paint.hue,
      },
      paint.time,
    );
    const painted = applyPaintLocal(inputs, vec4(...color, 1), uv());
    const frame = await draw(apply, painted.rgb);
    // The GPU filters decoded linear colour, then the graph works in display space.
    const decode = (b: number) => {
      const c = b / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const encode = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
    const smearAt = (su: number): Rgb => {
      const w = Math.min(1, Math.max(0, su * SIZE - (SIZE / 2 - 0.5)));
      return left.map((l, i) => encode(decode(l) + (decode(right[i]) - decode(l)) * w)) as Rgb;
    };
    if (gpu && /lavapipe/i.test(gpu.adapterName)) {
      expect(worstOver(frame, (u, v) => paintReference(color, smearAt, [u, v], paint))).toBeLessThanOrEqual(2);
    }
    // The brush is local: far from it the colour is untouched (to rounding).
    const far = pixelAt(frame, 63, 63);
    color.forEach((c, i) => {
      expect(Math.abs(far[i] - c * 255)).toBeLessThanOrEqual(1);
    });
  });
});

/* The GLSL, in JS. */

const f = Math.fround;
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const fract = (x: number) => x - Math.floor(x);

/** `artex_hash` in 32-bit floats. */
function hash32(x: number, y: number): number {
  const v = f(f(Math.sin(f(f(f(x) * f(12.9898)) + f(f(y) * f(78.233))))) * f(43758.5453));
  return f(v - Math.floor(v));
}

/** `artex_noise` with its hash in 32-bit floats. */
function noise32(px: number, py: number): number {
  const [x, y] = [f(px), f(py)];
  const [ix, iy] = [Math.floor(x), Math.floor(y)];
  const [fx, fy] = [f(x - ix), f(y - iy)];
  const [ux, uy] = [fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)];
  const a = hash32(ix, iy);
  const b = hash32(ix + 1, iy);
  const c = hash32(ix, iy + 1);
  const d = hash32(ix + 1, iy + 1);
  return mix(mix(a, b, ux), mix(c, d, ux), uy);
}

function insideUvReference(
  [u, v]: [number, number],
  { intensity: rawIntensity, speed, twist: rawTwist, time }: { intensity: number; speed: number; twist: number; time: number },
): [number, number] {
  const intensity = Math.min(2, Math.max(0, rawIntensity));
  const [px, py] = [u - 0.5, v - 0.5];
  const r = Math.max(Math.hypot(px, py), 1e-4);
  const t = time * speed;
  const twist = rawTwist * intensity;
  const angle = Math.atan2(py, px) + twist * (0.35 + (1 - Math.min(1, Math.max(0, r))) * 1.8);
  const tunnel = 1 - Math.exp(-r * (2 + intensity * 5));
  const radialPull = intensity * (0.06 + 0.08 * Math.sin(t * 1.9 + r * 24));
  const newR = Math.min(1.25, Math.max(0, r - radialPull * (0.25 + tunnel * 0.75)));
  const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
  const along = intensity * 0.012 * Math.sin(t * 8 + r * 42);
  const across = intensity * 0.01 * Math.sin(t * 5 + r * 28);
  const wx = 0.5 + dx * newR + dx * along - dy * across;
  const wy = 0.5 + dy * newR + dy * along + dx * across;
  return [Math.min(1, Math.max(0, wx)), Math.min(1, Math.max(0, wy))];
}

function insideColorReference(
  color: Rgb,
  [u, v]: [number, number],
  { intensity: rawIntensity, speed, time }: { intensity: number; speed: number; time: number },
): number[] {
  const intensity = Math.min(2, Math.max(0, rawIntensity));
  const [px, py] = [u - 0.5, v - 0.5];
  const r = Math.hypot(px, py);
  const angle = Math.atan2(py, px);
  const t = time * (0.8 + speed * 1.3);
  const tunnel = smoothstep(0.04, 0.92, r);
  const streakNoise = noise32(r * 22 - t * 1.5, angle * 3 + t * 0.35);
  const streaks = smoothstep(0.4, 1, Math.abs(Math.sin(r * 90 - t * 16 + streakNoise * 4))) ** 2.3;
  const edgeDarken = smoothstep(0.28, 1.05, r) * intensity * 0.38;
  const centerGlow = (1 - smoothstep(0, 0.35, r)) * intensity * (0.16 + 0.08 * Math.sin(t * 2.2));
  return [0.35, 0.55, 0.92].map((streak, c) => {
    const lit = (color[c] + streak * streaks * tunnel * intensity * 0.28) * (1 - edgeDarken * 0.38);
    return lit + [0.12, 0.18, 0.27][c] * centerGlow;
  });
}

function paintReference(
  color: Rgb,
  smearAt: (u: number) => Rgb,
  [u, v]: [number, number],
  p: { strength: number; x: number; y: number; radius: number; hardness: number; hue: number; time: number },
): number[] {
  const strength = Math.min(2.5, Math.max(0, p.strength));
  const radius = Math.min(0.85, Math.max(0.02, p.radius));
  const hardness = Math.min(0.98, Math.max(0.05, p.hardness));
  const dist = Math.hypot(u - p.x, v - p.y);
  const falloff = mix(radius * 0.45, radius * 0.05, hardness);
  const inner = Math.max(0, radius - falloff);
  const mask = (1 - smoothstep(inner, radius, dist)) * Math.min(1, strength);
  const scale = 10 + radius * 40;
  const brushNoise = noise32((u - p.x) * scale + p.time * 0.7, (v - p.y) * scale - p.time * 0.55);
  const stroke = smoothstep(0.22, 0.9, brushNoise);
  const ridge = smoothstep(0, 0.22, radius - dist);
  const localMask = mask * mix(0.55, 1, stroke) * (0.7 + ridge * 0.3);
  const hue = fract(p.hue);
  const tint = [0, 0.33, 0.66].map((phase) => 0.5 + 0.5 * Math.sin(6.2831853 * (hue + phase)));
  const luma = color[0] * 0.299 + color[1] * 0.587 + color[2] * 0.114;
  // The smear samples the artwork a little along the hue's direction; the
  // artwork varies only across u.
  const smearAngle = hue * 6.2831853;
  const [sx, sy] = [Math.cos(smearAngle) + 0.001, Math.sin(smearAngle)];
  const smearReach = (0.012 + strength * 0.006) / Math.hypot(sx, sy);
  const smear = smearAt(Math.min(1, Math.max(0, u + sx * smearReach)));
  return color.map((c, i) => {
    const painted = mix(c * (1 + strength * 0.15), tint[i] * (0.35 + luma * 0.65), 0.45 + strength * 0.15);
    const brushed = mix(c, painted, localMask);
    return mix(brushed, smear[i] * (0.8 + strength * 0.25), localMask * 0.35);
  });
}
