/**
 * Ghost Font engine — Canvas 2D prototype.
 *
 * Rasterises a phrase offscreen, samples the glyph coverage into target
 * points, and drives a particle field through an assemble → hold → dissolve
 * cycle. Between cycles it asks its `GhostWordSource` for the next phrase,
 * so the same engine serves every input idea (typed phrase, emotion pools,
 * advice pools, proximity-revealed secret).
 *
 * This is deliberately Canvas 2D: the sandbox explores the *behaviour*
 * (word lifecycle, reveal mapping, input sources), not the production
 * renderer. A promoted version would live as a WebGPU pass in
 * `@artex/render-core` per docs/runtime-target-and-rendering.md.
 */

import type {
  GhostRevealSource,
  GhostSignalFrame,
  GhostWordSource,
} from "./wordSources";

export interface GlyphPoint {
  /** Normalised 0..1 within the sampled text box. */
  x: number;
  y: number;
}

export interface GlyphSamplingOptions {
  /** CSS font family used for rasterisation. */
  fontFamily?: string;
  /** Rasterisation height in pixels; higher = denser sampling. */
  rasterHeight?: number;
  /** Sample every Nth pixel in both axes. */
  sampleStep?: number;
  /** Alpha threshold (0..255) above which a pixel counts as glyph. */
  alphaThreshold?: number;
}

/**
 * Rasterise `text` on an offscreen canvas and return normalised points
 * covering the glyphs. Requires a DOM (browser / Electron renderer).
 */
export function sampleGlyphPoints(
  text: string,
  options: GlyphSamplingOptions = {},
): GlyphPoint[] {
  const fontFamily = options.fontFamily ?? "Georgia, serif";
  const rasterHeight = options.rasterHeight ?? 160;
  const sampleStep = options.sampleStep ?? 3;
  const alphaThreshold = options.alphaThreshold ?? 96;

  if (typeof document === "undefined") {
    throw new Error("sampleGlyphPoints requires a DOM environment");
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas context unavailable");

  const fontSize = Math.round(rasterHeight * 0.6);
  ctx.font = `${fontSize}px ${fontFamily}`;
  const metrics = ctx.measureText(text);
  const width = Math.max(1, Math.ceil(metrics.width) + fontSize);
  canvas.width = width;
  canvas.height = rasterHeight;

  // Canvas size reset clears state; set the font again before drawing.
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.fillText(text, width / 2, rasterHeight / 2);

  const pixels = ctx.getImageData(0, 0, width, rasterHeight).data;
  const points: GlyphPoint[] = [];
  for (let y = 0; y < rasterHeight; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      if (alpha >= alphaThreshold) {
        points.push({ x: x / width, y: y / rasterHeight });
      }
    }
  }
  return points;
}

const GhostPhase = {
  assembling: "assembling",
  holding: "holding",
  dissolving: "dissolving",
} as const;

type GhostPhase = (typeof GhostPhase)[keyof typeof GhostPhase];

interface GhostParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Glyph target, normalised 0..1 (text box space). */
  tx: number;
  ty: number;
  /** Per-particle scatter direction used while hidden / dissolving. */
  sx: number;
  sy: number;
  /** Per-particle phase offset for shimmer. */
  seed: number;
}

export interface GhostFontEngineOptions {
  source: GhostWordSource;
  /** Seconds a fully formed word stays legible before dissolving. */
  holdSeconds?: number;
  /** Seconds the assemble transition targets. */
  assembleSeconds?: number;
  /** Particle count cap; excess glyph points are skipped evenly. */
  maxParticles?: number;
  fontFamily?: string;
  /** Ghost tint as CSS color used per particle (artwork data, not UI chrome). */
  tint?: string;
}

/** Deterministic PRNG so a given phrase always haunts the same way. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashPhrase(phrase: string): number {
  let h = 2166136261;
  for (let i = 0; i < phrase.length; i += 1) {
    h ^= phrase.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Drives the ghost-font lifecycle on a visible canvas.
 *
 * External signals arrive via `pushFrame` (same `MediaInputFrame` shape the
 * sensing adapters emit): audio adds shimmer, proximity drives reveal when
 * the source is a `GhostRevealSource`.
 */
export class GhostFontEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private source: GhostWordSource;
  private holdSeconds: number;
  private assembleSeconds: number;
  private maxParticles: number;
  private fontFamily: string;
  private tint: string;

  private particles: GhostParticle[] = [];
  private phase: GhostPhase = GhostPhase.assembling;
  private phaseElapsed = 0;
  private currentPhrase = "";
  private reveal = 1;
  private shimmer = 0;
  private running = false;
  private animFrame = 0;
  private lastTick = 0;

  constructor(canvas: HTMLCanvasElement, options: GhostFontEngineOptions) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
    this.source = options.source;
    this.holdSeconds = options.holdSeconds ?? 4;
    this.assembleSeconds = options.assembleSeconds ?? 2.5;
    this.maxParticles = options.maxParticles ?? 2200;
    this.fontFamily = options.fontFamily ?? "Georgia, serif";
    this.tint = options.tint ?? "rgba(220, 230, 255, 0.85)";
    this.loadNextPhrase();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTick = performance.now();
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }

  /** Swap the word source live (e.g. visitor switches emotion → secret). */
  setSource(source: GhostWordSource): void {
    this.source = source;
    // Reveal-driven sources start hidden; plain sources are always legible.
    // Without this reset, leaving a secret source at reveal 0 would keep
    // every later word scattered forever.
    const revealSource = source as Partial<GhostRevealSource>;
    this.reveal = typeof revealSource.reveal === "function" ? 0 : 1;
    this.phase = GhostPhase.dissolving;
    this.phaseElapsed = 0;
  }

  /** Feed live signals; shape matches the sensing adapters' frames. */
  pushFrame(frame: GhostSignalFrame): void {
    this.shimmer = frame.audioLevel ?? 0;
    const revealSource = this.source as Partial<GhostRevealSource>;
    if (typeof revealSource.reveal === "function") {
      this.reveal = revealSource.reveal(frame);
    }
  }

  private loadNextPhrase(): void {
    this.currentPhrase = this.source.next();
    const points = sampleGlyphPoints(this.currentPhrase, {
      fontFamily: this.fontFamily,
    });
    const stride = Math.max(1, Math.ceil(points.length / this.maxParticles));
    const rand = mulberry32(hashPhrase(this.currentPhrase));
    const targets = points.filter((_, i) => i % stride === 0);

    // Reuse existing particles where possible so words morph into each other.
    const next: GhostParticle[] = [];
    for (let i = 0; i < targets.length; i += 1) {
      const target = targets[i];
      const recycled = this.particles.at(i);
      const angle = rand() * Math.PI * 2;
      next.push({
        x: recycled ? recycled.x : rand(),
        y: recycled ? recycled.y : rand(),
        vx: 0,
        vy: 0,
        tx: target.x,
        ty: target.y,
        sx: Math.cos(angle),
        sy: Math.sin(angle),
        seed: rand() * Math.PI * 2,
      });
    }
    this.particles = next;
    this.phase = GhostPhase.assembling;
    this.phaseElapsed = 0;
  }

  private advancePhase(dt: number): void {
    this.phaseElapsed += dt;
    if (
      this.phase === GhostPhase.assembling &&
      this.phaseElapsed >= this.assembleSeconds
    ) {
      this.phase = GhostPhase.holding;
      this.phaseElapsed = 0;
    } else if (
      this.phase === GhostPhase.holding &&
      this.phaseElapsed >= this.holdSeconds
    ) {
      this.phase = GhostPhase.dissolving;
      this.phaseElapsed = 0;
    } else if (
      this.phase === GhostPhase.dissolving &&
      this.phaseElapsed >= this.assembleSeconds
    ) {
      this.loadNextPhrase();
    }
  }

  private tick = () => {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTick) / 1000);
    this.lastTick = now;

    this.advancePhase(dt);
    this.step(dt, now / 1000);
    this.render();

    this.animFrame = requestAnimationFrame(this.tick);
  };

  private step(dt: number, time: number): void {
    const dissolving = this.phase === GhostPhase.dissolving;
    // Low reveal scatters targets outward so the word stays unreadable.
    const scatter = dissolving ? 1 : 1 - this.reveal;
    const stiffness = dissolving ? 0.6 : 3.2;
    const damping = Math.exp(-3.4 * dt);

    for (const p of this.particles) {
      const wobble = 0.004 * (1 + this.shimmer * 3);
      const targetX =
        p.tx + p.sx * scatter * 0.45 + Math.sin(time * 1.7 + p.seed) * wobble;
      const targetY =
        p.ty + p.sy * scatter * 0.45 + Math.cos(time * 1.3 + p.seed) * wobble;
      p.vx = (p.vx + (targetX - p.x) * stiffness * dt) * damping;
      p.vy = (p.vy + (targetY - p.y) * stiffness * dt) * damping;
      p.x += p.vx;
      p.y += p.vy;
    }
  }

  private render(): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    // Translucent clear leaves trails: the "ghost" of previous frames.
    ctx.fillStyle = "rgba(4, 6, 12, 0.16)";
    ctx.fillRect(0, 0, width, height);

    // Fit the normalised text box into the canvas with margins.
    const boxWidth = width * 0.8;
    const boxHeight = Math.min(height * 0.4, boxWidth * 0.25);
    const originX = (width - boxWidth) / 2;
    const originY = (height - boxHeight) / 2;

    const legibility =
      this.phase === GhostPhase.holding
        ? this.reveal
        : this.reveal *
          Math.min(1, this.phaseElapsed / this.assembleSeconds) *
          (this.phase === GhostPhase.dissolving ? 0.4 : 1);
    const radius = 1 + legibility * 0.8;

    ctx.fillStyle = this.tint;
    ctx.globalAlpha = 0.25 + legibility * 0.6;
    for (const p of this.particles) {
      const px = originX + p.x * boxWidth;
      const py = originY + p.y * boxHeight;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
