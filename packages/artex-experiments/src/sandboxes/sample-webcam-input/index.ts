import type {
  MediaInputAdapter,
  MediaInputFrame,
  MediaInputAdapterDefinition,
} from "@artex/extensions";
import type { ExperimentModule } from "../../index";

/**
 * Sample Webcam Media Input Adapter
 *
 * A reference implementation that reads a live webcam via `getUserMedia` and
 * derives two signals every animation frame:
 *
 *   • `cameraLevel`  — average scene brightness (luminance), 0..1
 *   • `audioLevel`   — motion energy between frames (frame-diff magnitude), 0..1
 *
 * In a real extension you would add a Web Audio AnalyserNode alongside the
 * video stream to get a proper audio signal. Here we repurpose `audioLevel`
 * as a cheap motion proxy so the adapter is self-contained and works without
 * microphone permission.
 *
 * Usage (in your own package or sandbox):
 *
 *   const adapter = new SampleWebcamAdapter();
 *   const off = adapter.onFrame((frame) => console.log(frame));
 *   await adapter.start();
 *   // later…
 *   adapter.stop();
 *   off();
 */
export class SampleWebcamAdapter implements MediaInputAdapter {
  id = "sample-webcam";
  label = "Sample Webcam Input";

  private isRunning = false;
  private animFrame = 0;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private prevData: Uint8ClampedArray | null = null;
  private callbacks = new Set<(frame: MediaInputFrame) => void>();

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.stream = await navigator.mediaDevices.getUserMedia({ video: true });

    this.video = document.createElement("video");
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();

    // Small off-screen canvas for pixel analysis
    this.canvas = document.createElement("canvas");
    this.canvas.width  = 64;
    this.canvas.height = 48;
    this.ctx = this.canvas.getContext("2d");

    this.isRunning = true;
    this.tick();
  }

  stop(): void {
    this.isRunning = false;
    cancelAnimationFrame(this.animFrame);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.video?.pause();
    this.stream   = null;
    this.video    = null;
    this.canvas   = null;
    this.ctx      = null;
    this.prevData = null;
  }

  onFrame(callback: (frame: MediaInputFrame) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  private tick = (): void => {
    if (!this.isRunning || !this.ctx || !this.video || !this.canvas) return;

    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const pixels    = imageData.data; // RGBA, length = w * h * 4

    // --- cameraLevel: average luminance ---
    let totalLuma = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      // Rec. 709 luma coefficients
      totalLuma += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
    }
    const pixelCount  = pixels.length / 4;
    const cameraLevel = totalLuma / pixelCount / 255.0;

    // --- audioLevel: motion energy (frame-diff magnitude) ---
    let motion = 0;
    if (this.prevData) {
      for (let i = 0; i < pixels.length; i += 4) {
        const dr = Math.abs(pixels[i]     - this.prevData[i]);
        const dg = Math.abs(pixels[i + 1] - this.prevData[i + 1]);
        const db = Math.abs(pixels[i + 2] - this.prevData[i + 2]);
        motion += (dr + dg + db) / 3;
      }
      motion = Math.min(motion / pixelCount / 80.0, 1.0); // normalise; 80 = empirical ceiling
    }

    this.prevData = new Uint8ClampedArray(pixels);

    const frame: MediaInputFrame = {
      timestamp:   performance.now(),
      audioLevel:  motion,
      bassLevel:   0,
      cameraLevel,
    };

    this.callbacks.forEach((cb) => cb(frame));
    this.animFrame = requestAnimationFrame(this.tick);
  };
}

/**
 * Extension definition to register with ExtensionHost.
 *
 * Example:
 *   const host = createExtensionHost({ allowedCapabilities: ["media-input:register"] });
 *   host.registerMediaInput(sampleWebcamExtension);
 */
export const sampleWebcamExtension: MediaInputAdapterDefinition = {
  id:          "sample-webcam",
  kind:        "media-input",
  label:       "Sample Webcam Input",
  adapterKey:  "sample-webcam-adapter",
  capabilities: ["media-input:register"],
};

/**
 * ARTEX Experiment Sandbox Wrapper
 */
export const sampleWebcamSandbox: ExperimentModule = {
  track:       "sample-extensions",
  label:       "Sample Webcam Input Adapter",
  description: "A reference MediaInputAdapter that reads a live webcam and derives cameraLevel (luminance) and audioLevel (motion energy) — copy this as a starting point for camera-based live inputs.",
  stable:      true,
};
