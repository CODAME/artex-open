# Ghost Font (Sandbox)

> **Promoted:** the production version lives at `packages/artex-plugin-ghost-font`
> (WebGPU composition-block plugin, in the Experiences library). This sandbox
> remains the Canvas 2D behaviour playground; new production work goes there.

**Track:** `renderer-r-and-d`
**Stability:** `unstable` (exploration)

Particle typography that behaves like a haunting: a short phrase materialises
out of drifting dust, holds just long enough to be read, then dissolves and
gives way to the next phrase. The visual is deliberately secondary here — the
experiment is about **where the words come from** and how live signals shape
their legibility.

## What it does

Two pieces:

- `ghostFontEngine.ts` — rasterises a phrase offscreen, samples the glyph
  coverage into normalised target points, and drives a particle field through
  an assemble → hold → dissolve cycle on a visible Canvas 2D surface.
  Particles are recycled between phrases, so words morph into each other.
  A deterministic per-phrase PRNG means the same word always haunts the same
  way.
- `wordSources.ts` — pluggable `GhostWordSource` implementations, one per
  interaction idea:

| Source | Idea |
|---|---|
| `createPhraseSource` | The visitor types a word or phrase; the piece speaks it back. Input is sanitised and capped. |
| `createEmotionWordSource` | An emotion (picked by the visitor, or classified upstream) selects a curated word pool; the piece cycles through it. |
| `createAdviceWordSource` | The piece speaks for itself: short aphorisms about keeping your own mind in the age of AI (`own-mind`) or about getting sharper (`sharpen`). |
| `createSecretMessageSource` | A fixed hidden message. Its `reveal(frame)` follows the `proximity` signal — from afar the piece is abstract dust; the words only resolve when someone steps close. |
| `createTextSourceWordSource` | Wraps any `TextSourceAdapter` (`@artex/extensions`) into a word source — the owner-supplied-phrases path from docs/personal-text-sources-proposal.md. Reference adapters here: `createStaticTextSource` (fixed list) and `createDisplayTextSource` (reads the phrase list configured in the ARTEX Display admin window via `window.artexTextSource`). |

Live signals enter through `GhostFontEngine.pushFrame(frame)` using the same
`MediaInputFrame` shape the sensing adapters emit: `audioLevel` adds shimmer,
`proximity` drives reveal for `GhostRevealSource` sources.

## Usage

```typescript
import {
  GhostFontEngine,
  createSecretMessageSource,
} from "@artex/experiments";

const canvas = document.querySelector("canvas")!;
const source = createSecretMessageSource("you were always the artist");
const engine = new GhostFontEngine(canvas, { source });
engine.start();

// Wire any MediaInputAdapter (proximity, audio) into the engine:
adapter.onFrame((frame) => engine.pushFrame(frame));
```

Swap sources live with `engine.setSource(...)` — the current word dissolves
and the new source takes over.

## Why it exists

To test whether "visitor-supplied language" is a viable interaction primitive
for living art: what people type, how curated pools compare to free input,
and whether proximity-gated legibility (the secret message) lands emotionally.
If it does, the promotion path is:

1. Word sources → a signal/binding source usable from the Studio recipe
   (V3 contract addition, gated behind review).
2. The particle pass → a WebGPU implementation in `@artex/render-core`
   (the Canvas 2D renderer here is a prototype only; production live
   rendering is Electron + WebGPU per docs/runtime-target-and-rendering.md).

## Open questions

- Free-text input in public installations needs a moderation stance
  (profanity, harassment) before promotion — curated pools sidestep this,
  free phrase input does not.
- Emotion input UX: explicit picker vs. camera/audio-derived classification
  (the latter pulls in the `local-ai` track).
- Multi-line layout for longer phrases; current sampler is single-line.
