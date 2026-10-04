---
owner: bruno
status: canonical
scope: packages/artex-experiments/
---

# AGENTS.md — artex-experiments

Local directives for the experiments sandbox. The root `AGENTS.md` still applies. This file adds rules specific to unstable R&D tracks.

## Purpose of this package

Sandbox tracks for experience prototypes that are not yet ready to live in the stable package contract. Examples currently in flight: V3 raymarched shader, Living Grass, Illy, Form/Release.

## Hard rules

- **Do not import from `artex-core`, `apps/creator`, or `.services/`.** Experiments live in the open layer.
- **Every experiment exposes the recipe authoring contract.** Guided panel (bounded sliders) + raw JSON editor. Same recipe structure serves Random Variation and AI Suggested Behaviour.
- **Artist approval is required before any generated or mutated recipe is persisted.** No auto-persist.
- **No AI inference inside the render loop.** Generative steps run async and stage results before the next frame uses them.
- **Three.js is acceptable here.** It is not yet first-class in the stable contract; experiments are the staging ground.

## Recipe schema — required extensions

When adding a new experience type to this directory, the recipe must expose:

- `mutationTransitionPolicy` — how mutated parameters transition (e.g., snap, lerp, decay).
- `interpretationBoundaries` — per-field artist-defined ranges. Random Variation and AI suggestions must stay inside.
- `compoundRendererHint` — present if the experience needs more than one renderer concurrently (e.g., Three.js + ParticleFlowRenderer crossfade for Form/Release).
- `gestureBindings` — map of gesture events to state-machine triggers.

If your experiment cannot conform to these, raise it before merging — do not silently omit fields.

## Renderer selection

- Default: 2D WebGL shader compositor.
- Three.js: scene-driven experiences that are structurally volumetric (Illy, Form/Release).
- WebGPU: do not introduce. Deferred at the platform level.

The renderer is selected by a hint in the experiment's package config, not by ad-hoc imports.

## Build sequence (current)

1. V3 recipe migration.
2. Schema extension PR (the four fields above).
3. Living Grass.
4. Illy and Form/Release — only after Three.js is promoted to first-class post-Milan.

If your work would jump this sequence, raise it explicitly.

## Things that do not belong here

- Production runtime code. That belongs in the runtime player surface when it exists.
- Curator-program logic. That belongs under `docs/programs/` and platform services.
- Hardware-coupled code. Hardware decisions are pre-finalization; do not couple experiments to a specific device.

## When in doubt

Read the root `AGENTS.md` decision filter and refuse changes that fail it. Surface ambiguity to Bruno rather than guess.
