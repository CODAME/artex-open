# Contributing to ARTEX

ARTEX is currently in an invited-core-dev collaboration stage.

## Principles

- Open the edges, protect the core.
- Everything should serve living art.
- If a refactor does not improve artist capability, reliability, or velocity, it should be questioned.

## Repository Boundaries

- `apps/creator`: the product-facing creator application.
- `packages/artex-contract`: shared package/runtime contract. This is the first stable public seam.
- `packages/artex-shaders`: shared shader templates, examples, and reusable shader metadata.
- `packages/artex-extensions`: capability-scoped extension registration surfaces.
- `packages/artex-experiments`: sandbox tracks for unstable R&D.
- `packages/artex-core`: private core surface. Treat it as internal-only.
- `.services/`: server-side platform/admin systems. Treat them as internal-only.

Do not bypass package boundaries by importing source files across package roots. Run `npm run check:boundaries` before opening a PR.

## Contribution Model

- Shared layers are licensed under Apache 2.0.
- Contributors keep rights to their work and contribute it under the package license.
- ARTEX can use, modify, and evolve accepted contributions within the shared layers.
- Normal shared-layer work does not require a CLA or NDA.

## DCO Sign-off

Every commit that is intended for review should be signed off with the Developer Certificate of Origin:

```bash
git commit -s
```

The sign-off certifies that you have the right to submit the change under the applicable project license.
