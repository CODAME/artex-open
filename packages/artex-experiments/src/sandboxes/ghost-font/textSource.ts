/**
 * Text-source consumption for the Ghost Font sandbox.
 *
 * Bridges the `TextSourceAdapter` extension contract (`@artex/extensions`)
 * into a `GhostWordSource`, making ghost font the first consumer of
 * owner-supplied phrases (docs/personal-text-sources-proposal.md, P1).
 *
 * Three pieces:
 * - `createStaticTextSource`  — reference adapter over a fixed phrase list.
 * - `createDisplayTextSource` — adapter over `window.artexTextSource`, the
 *   bridge the ARTEX Display preload exposes for the phrases configured in
 *   the display admin window ("Personal text").
 * - `createTextSourceWordSource` — lifts any adapter into a GhostWordSource
 *   that cycles the latest phrase list.
 */

import type { TextSourceAdapter, TextSourceAdapterDefinition } from "@artex/extensions";
import type { GhostWordSource } from "./wordSources";
import { sanitizePhrase } from "./wordSources";

/** Reference adapter: a fixed list, emitted once on start. */
export function createStaticTextSource(
  phrases: readonly string[],
  options: { id?: string; label?: string } = {},
): TextSourceAdapter {
  const list = Object.freeze([...phrases]);
  const callbacks = new Set<(phrases: readonly string[]) => void>();
  let running = false;
  return {
    id: options.id ?? "static-list",
    label: options.label ?? "Static phrase list",
    async start() {
      running = true;
      callbacks.forEach((cb) => {
        cb(list);
      });
    },
    stop() {
      running = false;
    },
    onPhrases(callback) {
      callbacks.add(callback);
      if (running) callback(list);
      return () => {
        callbacks.delete(callback);
      };
    },
  };
}

/** The bridge the ARTEX Display preload exposes (see apps/display/src/preload.ts). */
interface ArtexTextSourceBridge {
  getPhrases(): Promise<readonly string[] | null>;
}

/**
 * Adapter over the ARTEX Display personal-text bridge. Fetches the
 * display's configured phrase list once per `start()` (each piece start
 * picks up admin-window edits). Emits nothing when the bridge is absent
 * (plain browser) or no personal text is configured — consumers keep
 * their own authored phrases.
 */
export function createDisplayTextSource(): TextSourceAdapter {
  const callbacks = new Set<(phrases: readonly string[]) => void>();
  let latest: readonly string[] | null = null;
  return {
    id: "artex-display",
    label: "Display personal text",
    async start() {
      const bridge = (globalThis as { artexTextSource?: ArtexTextSourceBridge }).artexTextSource;
      if (!bridge) return;
      const phrases = await bridge.getPhrases();
      if (!phrases || phrases.length === 0) return;
      latest = phrases;
      callbacks.forEach((cb) => {
        cb(phrases);
      });
    },
    stop() {
      latest = null;
    },
    onPhrases(callback) {
      callbacks.add(callback);
      if (latest) callback(latest);
      return () => {
        callbacks.delete(callback);
      };
    },
  };
}

/**
 * A GhostWordSource fed by a TextSourceAdapter, with an explicit lifecycle.
 * Call `start()` before handing it to the engine; `stop()` on teardown.
 */
export interface GhostTextSourceWordSource extends GhostWordSource {
  start(): Promise<void>;
  stop(): void;
}

/**
 * Lift a TextSourceAdapter into a word source. Cycles the latest phrase
 * list in order; a refresh restarts the cycle. Until the adapter delivers
 * anything (or if it never does), `next()` returns `fallback` so the piece
 * keeps breathing with its own authored words.
 */
export function createTextSourceWordSource(
  adapter: TextSourceAdapter,
  fallback = "listen",
): GhostTextSourceWordSource {
  let phrases: readonly string[] = [];
  let cursor = 0;
  let unsubscribe: (() => void) | null = null;
  return {
    id: `text-source:${adapter.id}`,
    label: adapter.label,
    async start() {
      unsubscribe ??= adapter.onPhrases((next) => {
        phrases = next.map(sanitizePhrase).filter((p) => p.length > 0);
        cursor = 0;
      });
      await adapter.start();
    },
    stop() {
      unsubscribe?.();
      unsubscribe = null;
      adapter.stop();
    },
    next() {
      if (phrases.length === 0) return fallback;
      const phrase = phrases[cursor % phrases.length];
      cursor += 1;
      return phrase;
    },
  };
}

/**
 * Extension definition for the reference static adapter, registrable via
 * `extensionHost.registerTextSource()`.
 */
export const staticTextSourceExtension: TextSourceAdapterDefinition = {
  id: "ghost-font-static-text",
  kind: "text-source",
  label: "Static phrase list",
  adapterKey: "static-list",
  capabilities: ["text-source:register"],
};
