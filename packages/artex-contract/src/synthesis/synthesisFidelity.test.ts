/**
 * Synthesizer fidelity tests against real production fixtures.
 *
 * Each fixture in `fixtures/legacy/*.json` carries a V1 envelope
 * (`{ artwork, projectData }`) extracted from a published piece by
 * `scripts/extract_v1_fixtures.mjs`. The tests assert that for every
 * fixture:
 *
 *   1. `synthesizeFromLegacy` produces a result whose `kind`
 *      matches the fixture's declared kind (typically `v2-shader`
 *      for the V1 corpus).
 *   2. The synthesized V3 config validates via `validatePieceConfig`
 *      with no errors.
 *   3. No critical warning codes are present (e.g. `missing_p5_source`
 *      / `missing_plugin_manifest` should never appear on a real
 *      production piece).
 *
 * `default_flow_synthesis` is **not** critical — it's expected for
 * the 70% of pieces with no shader and `artistTemplate: "static"`.
 *
 * The pixel-rendering fidelity check (legacy vs V3 visual diff) is
 * scoped separately — see the C.2.c PR description.
 *
 * Fixtures live at `fixtures/legacy/*.json`. To populate, run:
 *   node scripts/extract_v1_fixtures.mjs --project-id=<gcp-project> --commit
 *
 * With no fixtures present the suite passes (zero cases) but emits a
 * console hint so the gap is visible.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectLegacyKind, synthesizeFromLegacy } from "./synthesizeFromLegacy";
import { validatePieceConfig } from "../v3/validation";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "fixtures", "legacy");

/** Warning codes that should never appear on a real production piece.
 *  If any do, the synthesizer is silently dropping data the artist
 *  expected to keep. */
const CRITICAL_WARNING_CODES = new Set<string>([
  "missing_p5_source",
  "missing_html_source",
  "missing_plugin_manifest",
]);

interface LegacyFixture {
  slug: string;
  sourcePieceId?: string;
  sourceCollection?: string;
  kind: string;
  /** New shape (post-2026-05-03 ZIP-aware extractor). */
  envelope?: { artwork?: unknown; projectData?: unknown };
  /** Legacy shape — kept for backward compat with any older fixtures. */
  projectData?: unknown;
}

function listFixtureFiles(): string[] {
  try {
    if (!statSync(FIXTURES_DIR).isDirectory()) return [];
  } catch {
    return [];
  }
  return readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(FIXTURES_DIR, name))
    .sort();
}

function loadFixture(filepath: string): LegacyFixture {
  const raw = readFileSync(filepath, "utf8");
  return JSON.parse(raw) as LegacyFixture;
}

/** Reads the synthesizer's input from a fixture, supporting both the
 *  envelope shape (preferred) and the legacy single-blob shape. */
function fixtureInput(fixture: LegacyFixture): unknown {
  if (fixture.envelope) return fixture.envelope;
  return fixture.projectData;
}

/** Reads the expected title from whichever blob carries it. */
function expectedTitle(fixture: LegacyFixture): string {
  const artworkTitle = readString(fixture.envelope?.artwork, "title");
  if (artworkTitle && artworkTitle.length > 0) return artworkTitle;
  const projectTitle = readString(fixture.envelope?.projectData ?? fixture.projectData, "title");
  if (projectTitle && projectTitle.length > 0) return projectTitle;
  return "Untitled";
}

function readString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const v = (value as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

const fixtureFiles = listFixtureFiles();

describe("synthesizer fidelity (against committed fixtures)", () => {
  if (fixtureFiles.length === 0) {
    it("(no fixtures present — run scripts/extract_v1_fixtures.mjs)", () => {
      console.warn(
        `[synthesis fidelity] no fixtures found at ${path.relative(process.cwd(), FIXTURES_DIR)}.\n` +
          `  Run: node scripts/extract_v1_fixtures.mjs --project-id=<gcp-project> --commit`,
      );
      expect(true).toBe(true);
    });
    return;
  }

  for (const filepath of fixtureFiles) {
    const filename = path.basename(filepath);
    describe(filename, () => {
      const fixture = loadFixture(filepath);
      const input = fixtureInput(fixture);

      it("synthesizes without throwing", () => {
        expect(() => { synthesizeFromLegacy(input); }).not.toThrow();
      });

      it("dispatches to the fixture's declared kind", () => {
        const detected = detectLegacyKind(input);
        expect(detected).toBe(fixture.kind);
      });

      it("produces a V3 config that validates cleanly", () => {
        const result = synthesizeFromLegacy(input);
        expect(() => { validatePieceConfig(result.config); }).not.toThrow();
      });

      it("does not emit critical warnings", () => {
        const result = synthesizeFromLegacy(input);
        const critical = result.warnings.filter((w) => CRITICAL_WARNING_CODES.has(w.code));
        if (critical.length > 0) {
          console.error(
            `[${filename}] critical synthesis warnings:\n` +
              critical.map((w) => `  - ${w.code}: ${w.message}`).join("\n"),
          );
        }
        expect(critical).toEqual([]);
      });

      it("preserves the piece title", () => {
        const result = synthesizeFromLegacy(input);
        expect(result.config.title).toBe(expectedTitle(fixture));
      });
    });
  }
});
