/**
 * The display-space round trip, measured on what a canvas shows (`screen:
 * "srgb"`). If three's transfer functions or the pipeline's encoding ever
 * change, ported graphs drift from their GLSL originals; this fails first.
 */
import { describe, it, expect, afterAll } from "vitest";
import { vec3, vec4 } from "three/tsl";
import type { Node } from "three/webgpu";
import { pixelAt } from "@artex/render-core/testing/headless-gpu";
import { probeHeadlessGpu } from "../testing/headlessGpuProbe";
import { fromDisplay } from "./displaySpace";

const gpu = await probeHeadlessGpu();

afterAll(() => gpu?.dispose());

describe.skipIf(!gpu)("display space on screen", () => {
  it("shows a display-space colour as the bytes GLSL would write", async () => {
    if (!gpu) throw new Error("unreachable: the suite is skipped without an adapter");
    const display = vec3(0.5, 0.25, 0.75) as unknown as Node<"vec3">;

    const raw = gpu.mountColorNode(vec4(display, 1), 64, { screen: "srgb" });
    const rawPixel = pixelAt(await raw.frame(), 32, 32);
    raw.dispose();
    // The trap this guards: returned as-is, the colour is gamma-encoded.
    expect(rawPixel[0]).toBeGreaterThan(180);

    const ported = gpu.mountColorNode(vec4(fromDisplay(display), 1), 64, { screen: "srgb" });
    const portedPixel = pixelAt(await ported.frame(), 32, 32);
    ported.dispose();
    for (const [channel, expected] of [[0, 128], [1, 64], [2, 191]] as const) {
      expect(Math.abs(portedPixel[channel] - expected), `channel ${channel}`).toBeLessThanOrEqual(1);
    }
  }, 120_000);
});
