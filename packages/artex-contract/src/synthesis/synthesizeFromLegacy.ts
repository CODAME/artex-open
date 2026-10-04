/**
 * Synthesize a V3 piece config from a legacy V1 / V2 project blob.
 *
 * Pure function. Used by:
 *   - Studio's load-time synthesis when an artist opens a pre-V3 piece
 *     (the editor sees the V3 recipe immediately).
 *   - C.2.f's opt-in conversion flow (artist clicks "Convert to V3";
 *     the synthesizer runs and the artist visually accepts/rejects).
 *
 * Phase C plan §Q2 puts the synthesizer in `@artex/contract` because
 * it's a pure data transformation against the V3 contract. No
 * creator-app deps; tests run in node, importable by future tooling.
 *
 * Production reality (post-2026-05-03 audit): every piece on disk is
 * V1 format. The "v2-shader" discriminator label is historical — what
 * it actually means is "the legacy shader-based piece format we've
 * always had." `synthesizeFromV2Shader` operates on the V1 envelope.
 *
 * Input shape:
 *   - **Envelope** (preferred — used by `audit_corpus_blobs.mjs` and
 *     C.2.f): `{ artwork: <config.json>, projectData: <project.json> }`.
 *     The artwork blob carries `rendererMode` / `template` /
 *     `artistTemplate` / `shader_modules` / `interactions`. The
 *     projectData blob carries `shader.builtinShaderId` /
 *     `shader.shaderParams` / etc.
 *   - **Single blob** (legacy / forward-compat): a flat object that's
 *     either a V1 ConfigJson or a V2 single-blob shape. Treated as
 *     `artwork` only; projectData is null.
 */
import type { PieceConfig } from "../v3/types";
import { synthesizeFromV2Shader } from "./synthesizeFromV2Shader";
import {
  synthesizeFromPlugin,
  synthesizeFromV2Html,
  synthesizeFromV2P5,
  synthesizeFromV2Three,
} from "./synthesizeFromV2NonShader";

export type LegacyKind = "v3" | "v2-shader" | "v2-p5" | "v2-html" | "v2-three" | "plugin";

export interface SynthesisWarning {
  /** Machine-readable warning code, e.g. "unknown_v1_module". */
  code: string;
  /** Human-readable message — surfaced verbatim in the C.2.f banner. */
  message: string;
  /** Optional config-path hint, e.g. "artwork.shader_modules[].id=feedback". */
  field?: string;
  /** Optional V3 block id the warning attaches to. */
  blockId?: string;
}

export interface SynthesisResult {
  /** The synthesized V3 config. */
  config: PieceConfig;
  /** Non-blocking warnings the editor can surface as a banner. */
  warnings: SynthesisWarning[];
  /** What kind of legacy piece was detected. */
  kind: LegacyKind;
}

/**
 * Envelope shape carrying the two V1 ZIP files the synthesizer reads.
 * `null` means the file was missing from the ZIP. Either or both may
 * be absent — the synthesizer handles each case gracefully.
 */
export interface LegacyPackageEnvelope {
  /** Parsed `config.json` (V1 root) or `config/artwork.json` (V2 nested). */
  artwork?: unknown;
  /** Parsed `project.json` (V1 root) or `config/project.json` (V2 nested). */
  projectData?: unknown;
}

/** Inputs the synthesizer accepts. The function detects whether `input`
 *  is an explicit `LegacyPackageEnvelope` (has `artwork` / `projectData`
 *  keys) or a flat single blob (treated as `artwork` only). The
 *  declared type is `unknown` because both shapes are runtime-narrowed
 *  in `normalizeEnvelope`. */
export type LegacyPackageInput = unknown;

/**
 * Discriminator: detect what shape of legacy piece the input is.
 *
 * v3 wins when both V3 and legacy fields are populated — the V3 recipe
 * is canonical; legacy fields are debris from before save-as-V3.
 *
 * The discriminator inspects whichever blob carries the relevant
 * field. `pieceConfigV3` can live on either projectData or artwork
 * depending on package version.
 *
 * Total over the discriminator union. Unknown shapes default to
 * `"v2-shader"` — the historical default + the entire current corpus.
 */
export function detectLegacyKind(input: LegacyPackageInput): LegacyKind {
  const { artwork, projectData } = normalizeEnvelope(input);

  if (hasObject(projectData, "pieceConfigV3") || hasObject(artwork, "pieceConfigV3")) {
    return "v3";
  }

  const rendererMode = readString(artwork, "rendererMode") ?? readString(projectData, "rendererMode");
  if (rendererMode === "p5js") return "v2-p5";
  if (rendererMode === "html") return "v2-html";

  const runtimeArt = readObject(artwork, "runtime");
  const runtimeProj = readObject(projectData, "runtime");
  if (runtimeArt?.renderer === "three-experimental" || runtimeProj?.renderer === "three-experimental") {
    return "v2-three";
  }

  if (hasObject(artwork, "touchDesigner") || hasObject(projectData, "touchDesigner")) {
    return "plugin";
  }

  return "v2-shader";
}

/**
 * Synthesize a V3 piece config. Pure — no I/O, no DOM, no network.
 * Throws nothing; warnings collect issues for the C.2.f banner.
 */
export function synthesizeFromLegacy(input: LegacyPackageInput): SynthesisResult {
  const envelope = normalizeEnvelope(input);
  const kind = detectLegacyKind(input);

  switch (kind) {
    case "v3":
      return {
        kind,
        config: extractExistingV3Config(envelope),
        warnings: [],
      };

    case "v2-shader":
      return { kind, ...synthesizeFromV2Shader(envelope) };

    case "v2-p5":
      // Stub branches still expect the artwork-shaped blob (legacy
      // single-blob shape). They were written before the envelope
      // refactor; callers that need them in C.2.b will pass the
      // artwork through directly.
      return { kind, ...synthesizeFromV2P5(envelope.artwork) };

    case "v2-html":
      return { kind, ...synthesizeFromV2Html(envelope.artwork) };

    case "v2-three":
      return { kind, ...synthesizeFromV2Three(envelope.artwork) };

    case "plugin":
      return { kind, ...synthesizeFromPlugin(envelope.artwork) };

    default: {
      const exhaustiveCheck: never = kind;
      throw new Error(`Unhandled legacy kind: ${String(exhaustiveCheck)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a normalized `{ artwork, projectData }` pair. Detects whether
 *  input is the explicit envelope shape or a legacy single-blob shape. */
export function normalizeEnvelope(input: LegacyPackageInput): { artwork: unknown; projectData: unknown } {
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    if ("artwork" in obj || "projectData" in obj) {
      return { artwork: obj.artwork ?? null, projectData: obj.projectData ?? null };
    }
  }
  // Legacy single-blob: the input IS the artwork (most synthesizer
  // fields read from artwork-shape ConfigJson).
  return { artwork: input, projectData: null };
}

function extractExistingV3Config(envelope: { artwork: unknown; projectData: unknown }): PieceConfig {
  const fromProject = readObject(envelope.projectData, "pieceConfigV3");
  if (fromProject) return fromProject as unknown as PieceConfig;
  const fromArtwork = readObject(envelope.artwork, "pieceConfigV3");
  if (fromArtwork) return fromArtwork as unknown as PieceConfig;
  // Shouldn't reach here if detectLegacyKind returned "v3"; defensive.
  throw new Error("synthesizeFromLegacy: kind=v3 but no pieceConfigV3 found");
}

function readString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const v = (value as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

function readObject(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const v = (value as Record<string, unknown>)[key];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function hasObject(value: unknown, key: string): boolean {
  return readObject(value, key) !== null;
}
