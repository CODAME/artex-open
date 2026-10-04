/**
 * Word sources for the Ghost Font sandbox.
 *
 * A ghost-font piece never renders arbitrary layout — it renders one short
 * phrase at a time, materialising and dissolving. The interesting design
 * question is *where the words come from*. Each source below models one of
 * the candidate interaction ideas:
 *
 * - `createPhraseSource`      — the visitor types a word or phrase directly.
 * - `createEmotionWordSource` — an emotion input picks from curated pools.
 * - `createAdviceWordSource`  — the piece speaks: short aphorisms about
 *                               thinking for yourself in the age of AI, or
 *                               about getting sharper.
 * - `createSecretMessageSource` — a hidden message that only becomes legible
 *                               when a live signal (proximity) crosses in.
 *
 * All sources are pure and dependency-free so they can be exercised without
 * a renderer.
 */

import type { MediaInputFrame } from "@artex/extensions";

/** Supplies the next phrase the ghost should form. */
export interface GhostWordSource {
  id: string;
  label: string;
  /** The phrase to materialise next. Called once per assemble cycle. */
  next(): string;
}

/**
 * The subset of a sensing frame the ghost cares about. Partial so callers
 * can feed frames from adapters that only produce one of the signals.
 */
export type GhostSignalFrame = Partial<
  Pick<MediaInputFrame, "proximity" | "audioLevel">
>;

/**
 * A word source whose legibility is driven by a live signal.
 * `reveal` returns 0 (fully scattered / unreadable) … 1 (fully legible).
 */
export interface GhostRevealSource extends GhostWordSource {
  reveal(frame: GhostSignalFrame): number;
}

const MAX_PHRASE_LENGTH = 48;

/** Normalise visitor input: collapse whitespace, cap length, strip controls. */
export function sanitizePhrase(raw: string): string {
  let stripped = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    stripped += code < 32 || code === 127 ? " " : ch;
  }
  const collapsed = stripped.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, MAX_PHRASE_LENGTH);
}

/**
 * Direct visitor input: one word or phrase, repeated each cycle until the
 * visitor changes it via `setPhrase`.
 */
export function createPhraseSource(initialPhrase: string): GhostWordSource & {
  setPhrase(raw: string): void;
} {
  let phrase = sanitizePhrase(initialPhrase) || "whisper";
  return {
    id: "phrase",
    label: "Your word",
    setPhrase(raw: string) {
      const clean = sanitizePhrase(raw);
      if (clean) phrase = clean;
    },
    next() {
      return phrase;
    },
  };
}

export const GhostEmotion = {
  calm: "calm",
  joy: "joy",
  awe: "awe",
  melancholy: "melancholy",
  unrest: "unrest",
  longing: "longing",
} as const;

export type GhostEmotion = (typeof GhostEmotion)[keyof typeof GhostEmotion];

const EMOTION_POOLS: Record<GhostEmotion, readonly string[]> = {
  calm: ["still water", "slow breath", "settle", "quiet mind", "here now"],
  joy: ["lightness", "yes", "bloom", "carry the sun", "laugh first"],
  awe: ["vast", "look up", "small and lucky", "the long now", "stardust"],
  melancholy: ["what remains", "soft grey", "almost", "echoes", "fading light"],
  unrest: ["restless", "storm inside", "move", "unfinished", "loud silence"],
  longing: ["come back", "almost home", "reach", "the distance", "one more day"],
};

/**
 * Emotion-driven words: the visitor (or an upstream classifier) sets an
 * emotion; the source cycles deterministically through that emotion's pool.
 */
export function createEmotionWordSource(
  initialEmotion: GhostEmotion = GhostEmotion.calm,
): GhostWordSource & { setEmotion(emotion: GhostEmotion): void } {
  let emotion = initialEmotion;
  let cursor = 0;
  return {
    id: "emotion",
    label: "Emotion",
    setEmotion(next: GhostEmotion) {
      if (next !== emotion) {
        emotion = next;
        cursor = 0;
      }
    },
    next() {
      const pool = EMOTION_POOLS[emotion];
      const phrase = pool[cursor % pool.length];
      cursor += 1;
      return phrase;
    },
  };
}

export const GhostAdviceTheme = {
  /** Keep your own mind: gentle counter-weights to outsourcing thought. */
  ownMind: "own-mind",
  /** Get sharper: small provocations toward deliberate learning. */
  sharpen: "sharpen",
} as const;

export type GhostAdviceTheme =
  (typeof GhostAdviceTheme)[keyof typeof GhostAdviceTheme];

const ADVICE_POOLS: Record<GhostAdviceTheme, readonly string[]> = {
  "own-mind": [
    "think first, ask second",
    "doubt the easy answer",
    "your taste is yours",
    "write before you prompt",
    "keep one skill unaided",
    "slow is a feature",
  ],
  sharpen: [
    "read the hard book",
    "learn it twice",
    "teach it to someone",
    "ask a better question",
    "practice in public",
    "finish small things",
  ],
};

/**
 * The piece speaks: cycles through short aphorisms for the chosen theme.
 */
export function createAdviceWordSource(
  theme: GhostAdviceTheme,
): GhostWordSource {
  let cursor = 0;
  const pool = ADVICE_POOLS[theme];
  return {
    id: `advice:${theme}`,
    label: "Advice",
    next() {
      const phrase = pool[cursor % pool.length];
      cursor += 1;
      return phrase;
    },
  };
}

/**
 * A secret message: the phrase is always the same, but `reveal` stays near 0
 * until the viewer comes close (proximity from the sensing stack). The engine
 * maps low reveal to heavy scatter, so from afar the piece reads as abstract
 * dust and only resolves into words at intimate distance.
 */
export function createSecretMessageSource(
  message: string,
  options: { threshold?: number; softness?: number } = {},
): GhostRevealSource {
  const threshold = options.threshold ?? 0.55;
  const softness = Math.max(0.05, options.softness ?? 0.25);
  const phrase = sanitizePhrase(message) || "closer";
  return {
    id: "secret-message",
    label: "Secret message",
    next() {
      return phrase;
    },
    reveal(frame) {
      const proximity = frame.proximity ?? 0;
      // Smoothstep around the threshold so legibility eases in, not snaps.
      const t = Math.min(
        1,
        Math.max(0, (proximity - (threshold - softness)) / (2 * softness)),
      );
      return t * t * (3 - 2 * t);
    },
  };
}
