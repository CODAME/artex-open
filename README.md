# ARTEX Open Layer

This repository contains the open-layer packages of [ARTEX](https://artex.art) —
a creator tool for composing artist-authored interactive experiences.

> **North star:** Everything serves living art.

## Packages

| Package | Description | License |
|---|---|---|
| [`@artex/contract`](./packages/artex-contract/) | Stable package/runtime contract — `ConfigJson`, `StateJson`, `ProjectPackageData` | Apache 2.0 |
| [`@artex/shaders`](./packages/artex-shaders/) | GLSL fragment shader library for ARTEX Studio | Apache 2.0 |
| [`@artex/extensions`](./packages/artex-extensions/) | Extension host API — register shaders, media inputs, and sandbox modules | Apache 2.0 |
| [`@artex/experiments`](./packages/artex-experiments/) | R&D sandbox tracks for Three.js, TouchDesigner bridge, and more | Apache 2.0 |

The packages are synced automatically from the ARTEX monorepo; changes made
directly here are overwritten by the next sync.

## Contributing

- **Add a shader:** [SHADER_GUIDE.md](./packages/artex-shaders/SHADER_GUIDE.md)
- **Add a sandbox:** [EXPERIMENTS_GUIDE.md](./packages/artex-experiments/EXPERIMENTS_GUIDE.md)
- **Extension proposals:** use the 🔌 Extension Proposal issue template

All contributions are Apache 2.0. You keep rights to your work.
DCO sign-off required on all commits (`git commit -s`).

## Dev Setup

Needs Node 22 and npm 11 or newer (`npx npm@11 install` if your Node ships npm 10).

```bash
npm install
npm test
```

## License

Apache License 2.0 — see package-level `LICENSE` files.
Copyright 2026 CODAME ART + TECH.
