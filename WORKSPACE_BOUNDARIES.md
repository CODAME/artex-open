# ARTEX Workspace Boundaries

This workspace is organized to support collaboration without opening private platform internals prematurely.

## Shared/Open Candidate Packages

- `packages/artex-contract`
- `packages/artex-shaders`
- `packages/artex-extensions`
- `packages/artex-experiments`

These packages should not import from `packages/artex-core`, `apps/creator`, or `.services/`.

## Private/Internal Packages

- `packages/artex-core`
- `.services/`

These contain platform-private and revenue-adjacent surfaces.

## Creator App

`apps/creator` may consume the workspace packages, but it should not import package source files through relative paths. The app should use package exports or local compatibility shims only.

During this transition, `apps/creator/src/shaders` remains a compatibility mirror of `packages/artex-shaders/src/shaders` so existing raw shader imports continue to work. Use `npm run sync:shader-assets` after changing shared shader assets.
