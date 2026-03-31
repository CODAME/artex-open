import type {
  MediaInputAdapter,
  MediaInputFrame,
  MediaInputAdapterDefinition,
} from "@artex/extensions";
import type { ExperimentModule } from "../../index";

/**
 * Sample Web Audio Adapter
 *
 * A reference implementation of MediaInputAdapter that reads a live microphone
 * via the Web Audio API AnalyserNode and derives three signals every frame:
 *
 *   • audioLevel     — RMS amplitude of the time-domain waveform, 0..1
 *                      Feeds uAudioLevel in shaders.
 *   • bassLevel      — mean of the lowest 5 FFT bins (~0–215 Hz at 44.1 kHz), 0..1
 *                      Feeds uBassLevel in shaders.
 *   • transientLevel — spectral flux onset: how much the current RMS exceeds the
 *                      rolling short-term average (α=0.1). Detects claps and snaps.
 *                      Feeds uTransientLevel in shaders.
 *
 * This is the real-microphone counterpart to OscillatorMediaAdapter, which only
 * produces synthetic signals. Copy this as a starting point for any audio-reactive
 * live-input extension.
 *
 * Usage:
 *   const adapter = new SampleWebAudioAdapter();
 *   const off = adapter.onFrame((frame) => console.log(frame));
 *   await adapter.start();  // prompts for microphone permission
 *   // later…
 *   adapter.stop();
 *   off();
 */
export class SampleWebAudioAdapter implements MediaInputAdapter {
  id = "sample-web-audio";
  label = "Sample Web Audio Input";

  private isRunning = false;
  private animFrame = 0;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private timeDomainBuf: Uint8Array | null = null;
  private frequencyBuf: Uint8Array | null = null;
  private rollingRms = 0;
  private callbacks = new Set<(frame: MediaInputFrame) => void>();

  async start(): Promise<void> {
    if (this.isRunning) return;

    // AudioContext must be created inside start() — browsers require a user
    // gesture before audio contexts can run.
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    this.audioContext = new AudioContext();

    // Resume if the browser created the context in a suspended state.
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.8;
    this.analyser.minDecibels = -90;
    this.analyser.maxDecibels = -10;

    this.source = this.audioContext.createMediaStreamSource(this.stream);
    // Connect microphone → analyser only. Do NOT connect to destination
    // to avoid feeding the mic signal back through the speakers.
    this.source.connect(this.analyser);

    this.timeDomainBuf = new Uint8Array(this.analyser.fftSize);           // 1024
    this.frequencyBuf  = new Uint8Array(this.analyser.frequencyBinCount); // 512
    this.rollingRms    = 0;
    this.isRunning     = true;
    this.tick();
  }

  stop(): void {
    this.isRunning = false;
    cancelAnimationFrame(this.animFrame);
    this.source?.disconnect();
    this.analyser?.disconnect();
    void this.audioContext?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream        = null;
    this.audioContext  = null;
    this.analyser      = null;
    this.source        = null;
    this.timeDomainBuf = null;
    this.frequencyBuf  = null;
  }

  onFrame(callback: (frame: MediaInputFrame) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  private tick = (): void => {
    if (!this.isRunning || !this.analyser || !this.timeDomainBuf || !this.frequencyBuf) return;

    // --- audioLevel: RMS of the time-domain waveform ---
    // Each byte is in [0, 255] where 128 represents silence (DC offset).
    // Centre on zero → range [-1, 1], then compute RMS.
    this.analyser.getByteTimeDomainData(this.timeDomainBuf);
    let sumSq = 0;
    for (let i = 0; i < this.timeDomainBuf.length; i++) {
      const s = (this.timeDomainBuf[i] / 128.0) - 1.0;
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / this.timeDomainBuf.length);
    // Normalise: a full-scale sine wave has RMS = 1/√2 ≈ 0.7071; divide and clamp.
    const audioLevel = Math.min(rms / 0.7071, 1.0);

    // --- bassLevel: mean of the lowest 5 FFT frequency bins ---
    // At 44.1 kHz with fftSize=1024: bin width ≈ 43 Hz; bins 0–4 ≈ 0–215 Hz.
    this.analyser.getByteFrequencyData(this.frequencyBuf);
    const BASS_BINS = 5;
    let bassSum = 0;
    for (let i = 0; i < BASS_BINS; i++) {
      bassSum += this.frequencyBuf[i];
    }
    const bassLevel = (bassSum / BASS_BINS) / 255.0;

    // --- transientLevel: spectral flux onset detection ---
    // Exponential moving average of RMS (α=0.1 ≈ 10-frame window at 60fps ≈ 167ms).
    // Detect sharp increases above the local average — claps, snaps, kick onsets.
    const ALPHA = 0.1;
    this.rollingRms = ALPHA * rms + (1.0 - ALPHA) * this.rollingRms;
    const excess = rms - this.rollingRms;
    const transientLevel = Math.min(Math.max(excess / (this.rollingRms + 0.01), 0.0), 1.0);

    const frame: MediaInputFrame = {
      timestamp: performance.now(),
      audioLevel,
      bassLevel,
      transientLevel,
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
 *   host.registerMediaInput(sampleWebAudioExtension);
 */
export const sampleWebAudioExtension: MediaInputAdapterDefinition = {
  id:           "sample-web-audio",
  kind:         "media-input",
  label:        "Sample Web Audio Input",
  adapterKey:   "sample-web-audio-adapter",
  capabilities: ["media-input:register"],
};

/**
 * ARTEX Experiment Sandbox Wrapper
 */
export const sampleWebAudioSandbox: ExperimentModule = {
  track:       "sample-extensions",
  label:       "Sample Web Audio Adapter",
  description: "A reference MediaInputAdapter using the Web Audio API AnalyserNode to derive audioLevel (RMS), bassLevel (low-frequency FFT bins), and transientLevel (spectral flux onset) from a live microphone. Copy this as a starting point for real audio-reactive live inputs.",
  stable:      true,
};
