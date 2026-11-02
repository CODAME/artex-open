/**
 * Headless pixel test for the artwork pipeline helpers (`artexImage.ts`).
 *
 * Expectations are computed here in JS from the GLSL helper's math, so the
 * suite runs without WebGL. Nearest filtering throughout: it makes each
 * expected pixel one known texel, so geometry and blending are checked exactly.
 * Read on an sRGB screen, as the live backend presents, through `fromDisplay`,
 * as a ported graph returns colour.
 *
 * When this was written the helpers were also compared against the real
 * patched GLSL on WebGL (Chromium) over seven cases: with nearest filtering,
 * byte-identical for the artwork and a single state, within 1/255 for blends.
 * With linear filtering, sharp edges differ (WebGPU filters decoded linear
 * colour, WebGL filtered the raw sRGB bytes). Flow is not compared per pixel:
 * `artex_hash` is `fract(sin(x) * 43758.5)`, which differs between GPUs on
 * GLSL too.
 */
import { describe, it, expect, afterAll } from "vitest";
import { texture, uniform, uv, vec4 } from "three/tsl";
import { ClampToEdgeWrapping, DataTexture, NearestFilter, SRGBColorSpace, Vector2 } from "three/webgpu";
import type { TslPassInputs, TslScalarUniform } from "@artex/contract/tsl";
import { pixelAt } from "@artex/render-core/testing/headless-gpu";
import { probeHeadlessGpu } from "../testing/headlessGpuProbe";
import { stubFaceInputs, stubImageInputs, stubLiveVectors } from "../testing/stubImageInputs";
import { sampleMain } from "./artexImage";
import { fromDisplay } from "./displaySpace";

const gpu = await probeHeadlessGpu();

afterAll(() => gpu?.dispose());

const N = 64;

/** A flat-colour w x h texture, tagged sRGB like the backend's artwork. */
function flat(w: number, h: number, rgb: [number, number, number]): DataTexture {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i += 1) data.set([...rgb, 255], i * 4);
  const tex = new DataTexture(data, w, h);
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** A w x h texture, left half one colour and right half another. */
function halves(w: number, h: number, left: [number, number, number], right: [number, number, number]): DataTexture {
  const tex = flat(w, h, left);
  const data = tex.image.data as Uint8Array;
  for (let y = 0; y < h; y += 1) for (let x = w / 2; x < w; x += 1) data.set([...right, 255], (y * w + x) * 4);
  return tex;
}

function inputsFor(source: DataTexture, sourceSize: [number, number]) {
  const uniforms = new Map<string, TslScalarUniform>();
  const image = stubImageInputs(sourceSize[0], sourceSize[1]);
  const inputs = {
    source: texture(source),
    prevPass: texture(flat(1, 1, [0, 0, 0])),
    previousSource: texture(flat(1, 1, [0, 0, 0])),
    uniforms,
    image,
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
    time: uniform(0),
    resolution: uniform(new Vector2(N, N)),
    interaction: { audioLevel: uniform(0), bassLevel: uniform(0), proximity: uniform(0), cameraLevel: uniform(0) },
  };
  return { inputs, image, uniforms };
}

function mount(inputs: TslPassInputs) {
  if (!gpu) throw new Error("unreachable: the suite is skipped without an adapter");
  const color = sampleMain(inputs, uv());
  return gpu.mountColorNode(vec4(fromDisplay(color.rgb), 1), N, { screen: "srgb" });
}

const close = (actual: Uint8Array | number[], expected: readonly number[], label: string) => {
  for (let c = 0; c < 3; c += 1) expect(Math.abs(actual[c] - expected[c]), `${label} channel ${c}`).toBeLessThanOrEqual(1);
};

describe.skipIf(!gpu)("artwork pipeline helpers render headlessly", () => {
  it("contains a wide artwork in the frame: letterbox bands are empty, the artwork shows its own colours", async () => {
    // 2:1 artwork in a square frame: it fills the middle half vertically.
    const { inputs } = inputsFor(halves(8, 4, [200, 40, 40], [40, 40, 200]), [8, 4]);
    const scene = mount(inputs);
    const frame = await scene.frame();
    close(pixelAt(frame, 8, N / 2), [200, 40, 40], "left half");
    close(pixelAt(frame, N - 8, N / 2), [40, 40, 200], "right half");
    close(pixelAt(frame, N / 2, 4), [0, 0, 0], "top band");
    close(pixelAt(frame, N / 2, N - 4), [0, 0, 0], "bottom band");
    scene.dispose();
  }, 120_000);

  it("pans and zooms through the media transform", async () => {
    const { inputs, image } = inputsFor(halves(8, 8, [200, 40, 40], [40, 40, 200]), [8, 8]);
    // States carry the transform (as in GLSL, where the base pass had already
    // applied it to the artwork); with one state, a pan moves its picture.
    image.states[0].value = halves(8, 8, [10, 220, 10], [220, 220, 10]);
    image.stateResolutions[0].value.set(8, 8);
    image.stateCount.value = 1;
    const scene = mount(inputs);
    close(pixelAt(await scene.frame(), N / 2 + 2, N / 2), [220, 220, 10], "unpanned: right of centre is the right half");
    // translateX +0.25 samples a quarter-frame further right: left of centre now shows the right half.
    image.mediaTransform.value.set(0.25, 0, 1, 0);
    close(pixelAt(await scene.frame(), N / 2 - 4, N / 2), [220, 220, 10], "panned");
    // `scale` divides the sampling offset, as in GLSL: 0.5 shows the picture at
    // half size, so near the frame's edge is outside it; 2 magnifies it.
    image.mediaTransform.value.set(0, 0, 0.5, 0);
    close(pixelAt(await scene.frame(), 6, N / 2), [0, 0, 0], "zoomed out: outside the picture");
    image.mediaTransform.value.set(0, 0, 2, 0);
    close(pixelAt(await scene.frame(), 6, N / 2), [10, 220, 10], "zoomed in: still the left half");
    scene.dispose();
  }, 120_000);

  it("blends evolution states along blendFactor, as artex_blendStates does", async () => {
    const { inputs, image } = inputsFor(flat(4, 4, [255, 255, 255]), [4, 4]);
    const colours: [number, number, number][] = [[200, 0, 0], [0, 200, 0], [0, 0, 200], [200, 200, 0]];
    colours.forEach((rgb, i) => {
      image.states[i].value = flat(4, 4, rgb);
      image.stateResolutions[i].value.set(4, 4);
    });
    const scene = mount(inputs);
    const centre = async () => pixelAt(await scene.frame(), N / 2, N / 2);

    // No states: the artwork.
    close(await centre(), [255, 255, 255], "no states");
    // One state: A, whatever the factor.
    image.stateCount.value = 1;
    image.blendFactor.value = 0.8;
    close(await centre(), colours[0], "one state");
    // Two: mix(A, B, t). Display-space mix, as GLSL: halfway is 100/100.
    image.stateCount.value = 2;
    image.blendFactor.value = 0.5;
    close(await centre(), [100, 100, 0], "two at 0.5");
    // Three: A->B over 0..0.5, B->C over 0.5..1. At 0.75, halfway B->C.
    image.stateCount.value = 3;
    image.blendFactor.value = 0.75;
    close(await centre(), [0, 100, 100], "three at 0.75");
    // Four: thirds. At exactly 2/3 the third segment starts: C.
    image.stateCount.value = 4;
    image.blendFactor.value = 0.999;
    close(await centre(), [200, 200, 0].map((v, c) => Math.round(colours[2][c] + (v - colours[2][c]) * 0.997)), "four near 1");
    scene.dispose();
  }, 120_000);

  it("leaves the uv alone unless flow is on, and moves the picture when it is", async () => {
    const { inputs, uniforms } = inputsFor(halves(64, 64, [200, 40, 40], [40, 40, 200]), [64, 64]);
    const scene = mount(inputs);
    const still = await scene.frame();
    (uniforms.get("uFlowEnabled") as { value: number }).value = 1;
    (uniforms.get("uFlowIntensity") as { value: number }).value = 1;
    const flowing = await scene.frame();
    let moved = 0;
    for (let y = 0; y < N; y += 1) {
      // Only the seam can change: flow displaces by at most 0.075 of the frame.
      const a = pixelAt(still, N / 2, y);
      const b = pixelAt(flowing, N / 2, y);
      if (Math.abs(a[0] - b[0]) > 10) moved += 1;
    }
    expect(moved).toBeGreaterThan(0);
    // Far from the seam nothing changes.
    close(pixelAt(flowing, 4, N / 2), [200, 40, 40], "left, far from the seam");
    close(pixelAt(flowing, N - 4, N / 2), [40, 40, 200], "right, far from the seam");
    scene.dispose();
  }, 120_000);
});
