import type {
  MediaInputAdapter,
  MediaInputFrame,
  MediaInputAdapterDefinition,
} from "@artex/extensions";
import type { ExperimentModule } from "../../index";

/**
 * Example Media Input Adapter
 *
 * This is a reference implementation of a custom input adapter that generates
 * synthetic oscillator waves for `uAudioLevel` and `uBassLevel`.
 *
 * In a real extension, you would connect to a Web Audio analyser, MIDI device,
 * OSC stream, or other live signal hardware.
 */
export class OscillatorMediaAdapter implements MediaInputAdapter {
  id = "example-oscillator";
  label = "Example Audio Oscillator";

  private isRunning = false;
  private animFrame = 0;
  private startTime = 0;
  private callbacks = new Set<(frame: MediaInputFrame) => void>();

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startTime = performance.now();
    this.tick();
  }

  stop(): void {
    this.isRunning = false;
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
    }
  }

  onFrame(cb: (frame: MediaInputFrame) => void): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  private tick = () => {
    if (!this.isRunning) return;

    const t = (performance.now() - this.startTime) / 1000.0;

    // Generate synthetic signals to simulate an audio beat
    // This allows testing the uAudioLevel and uBassLevel uniforms
    const audioLevel = (Math.sin(t * Math.PI * 2.0 * 2.0) + 1.0) * 0.5; // Fast pulse
    const bassLevel = (Math.sin(t * Math.PI * 2.0 * 0.5) + 1.0) * 0.5; // Slow pulse

    const frame: MediaInputFrame = {
      timestamp: t,
      audioLevel,
      bassLevel,
      // Leaving cameraLevel and proximity empty, as this only simulates audio
    };

    this.callbacks.forEach((cb) => cb(frame));

    this.animFrame = requestAnimationFrame(this.tick);
  };
}

/**
 * The Extension Definition that the ExtensionHost will register
 */
export const exampleMediaInputExtension: MediaInputAdapterDefinition = {
  id: "example-oscillator",
  kind: "media-input",
  label: "Synthetic Oscillator",
  adapterKey: "oscillator-adapter",
  capabilities: ["media-input:register"],
};

/**
 * ARTex Experiment Sandbox Wrapper
 */
export const exampleMediaInputSandbox: ExperimentModule = {
  track: "media-input-research",
  label: "Example Media Input Sandbox",
  description:
    "A reference implementation of a MediaInputAdapter simulating audio.",
  stable: true,
};
