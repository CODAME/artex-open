# Changelog

All notable changes to the ARTEX **open layer** packages are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> The private platform (creator app, rendering engine, Cloud Run API) has its own
> release cycle. This file covers only the packages intended for external collaboration:
> `@artex/contract`, `@artex/shaders`, `@artex/extensions`, `@artex/experiments`.

---

## [Unreleased]

### Added
- **`@artex/extensions`** — `MediaInputFrame` and `MediaInputAdapter` interfaces:
  live signal data contract for pluggable input adapters (audio, camera, proximity).
- **`@artex/extensions`** — `SandboxModule` interface for R&D experiment entry-points.
- **`@artex/extensions`** — exported `ExtensionHost` type alias so consumers can
  import the type without creating circular dependency chains.
- **`apps/creator`** — `ExtensionContext.tsx`: singleton `ExtensionHost` wired into
  the React provider tree; built-in shaders now seeded through the extension API.
  Exposes `useExtensionHost()` and `useShaderExtensions()` hooks.
- **`packages/artex-experiments`** — sandbox folder structure with
  `three-renderer` and `touchdesigner-bridge` stubs.
- **All open packages** — `LICENSE` (Apache 2.0) files added to
  `artex-contract`, `artex-shaders`, `artex-extensions`, `artex-experiments`.
- **`.github/`** — PR template and issue templates for shader contributions,
  extension proposals, and bug reports.
- **`packages/artex-shaders`** — `SHADER_GUIDE.md`: contributor guide covering
  ARTEX GLSL uniform conventions, naming, metadata, and local testing.
- **`packages/artex-experiments`** — `EXPERIMENTS_GUIDE.md`: contributor guide
  for sandbox R&D tracks.
- **Root** — `CHANGELOG.md` (this file).
- **Phase 3** — `changeset` configuration for versioned npm publishing of open packages.

---

## [0.0.0] — 2026-03-22 (Internal Baseline)

Initial monorepo structure with private creator app and open package skeletons.
Not yet published to npm.

### Packages
- `@artex/contract` 0.0.0 — `ConfigJson`, `StateJson`, package read/write contract.
- `@artex/shaders` 0.0.0 — 37 built-in GLSL shaders, `builtinShaderLibrary` registry.
- `@artex/extensions` 0.0.0 — `createExtensionHost()` with shader/media/sandbox registration.
- `@artex/experiments` 0.0.0 — stable experiment-track enum stub.
