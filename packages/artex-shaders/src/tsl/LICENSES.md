# TSL helper provenance

The TSL graphs and helpers in this directory are **original, clean-room
reimplementations**. They are authored from mathematical formulas and
public-domain algorithm descriptions, not ported from any licensed shader
library. In particular they do **not** copy from LYGIA (Prosperity license,
non-commercial — reference-only per `docs/plans/gpu-rendering-platform-plan.md`).

| Helper | Origin | License of the idea |
|---|---|---|
| `hash21` / `hash22` (`helpers/noise.ts`) | "Hash without Sine" technique popularised by Dave Hoskins | CC0 / public domain |
| `valueNoise2D`, `fbm` (`helpers/noise.ts`) | Textbook bilinear value noise + summed-octave fBm | Public domain (standard technique) |
| `cosinePalette` (`helpers/color.ts`) | Cosine gradient `a + b·cos(2π(c·t + d))` | Mathematical formula (Inigo Quilez articles describe the math) |

`graphs/motionGrid.ts` is an original grid-displacement graph (frame
differencing per cell, hashed per-cell shift and slit-scan stretch). It was
prompted by a TouchDesigner piece by Ivan Puñal García (@unavisionagradable)
seen only as a video; no project file or code from it was used.

The sample graphs (`graphs/*.ts`) are visually inspired by the open WebGPU/TSL
demo space (e.g. `github.com/klevron/test-webgpu`) but share no source code with
it. The klevron repository ships under no license; nothing here is derived from
its code.
