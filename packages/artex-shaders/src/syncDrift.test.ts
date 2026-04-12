/**
 * Sync-drift detection tests.
 *
 * Catches metadata / shader file mismatches that can occur when syncing
 * between the ARTEX monorepo and artex-open.
 */

import { describe, expect, it } from "vitest";
import { BUILTIN_SHADER_LIBRARY_ITEMS } from "./builtinShaderLibrary.ts";

/**
 * Extract the slug-generation logic (mirrors builtinShaderLibrary.ts).
 * This lets us verify that metadata keys and file-generated IDs stay in sync.
 */
const toShaderSlug = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const stripExtension = (filename: string): string =>
  filename.replace(/\.(glsl|frag)$/i, "");

describe("sync-drift — metadata ↔ file integrity", () => {
  it("every shader ID matches its filename after slug normalisation", () => {
    for (const shader of BUILTIN_SHADER_LIBRARY_ITEMS) {
      const expectedId = toShaderSlug(stripExtension(shader.filename));
      expect(
        shader.id,
        `shader "${shader.filename}" produced id "${shader.id}" but expected "${expectedId}"`,
      ).toBe(expectedId);
    }
  });

  it("no two shader files produce the same slug", () => {
    const slugMap = new Map<string, string>();
    for (const shader of BUILTIN_SHADER_LIBRARY_ITEMS) {
      const existing = slugMap.get(shader.id);
      if (existing) {
        throw new Error(
          `Slug collision: "${shader.filename}" and "${existing}" both produce id "${shader.id}"`,
        );
      }
      slugMap.set(shader.id, shader.filename);
    }
  });

  it("library items are sorted alphabetically by label", () => {
    for (let i = 1; i < BUILTIN_SHADER_LIBRARY_ITEMS.length; i++) {
      const prev = BUILTIN_SHADER_LIBRARY_ITEMS[i - 1].label;
      const curr = BUILTIN_SHADER_LIBRARY_ITEMS[i].label;
      expect(
        prev.localeCompare(curr, undefined, { sensitivity: "base" }),
        `"${prev}" should sort before "${curr}"`,
      ).toBeLessThanOrEqual(0);
    }
  });

  it("no shader has a default fallback description (indicates missing metadata)", () => {
    for (const shader of BUILTIN_SHADER_LIBRARY_ITEMS) {
      // The fallback pattern from builtinShaderLibrary.ts
      const isFallback = shader.description.startsWith("Built-in shader loaded from packages/");
      // Motion shaders get a different default — that's acceptable
      const isMotionDefault = shader.description === "Video-converted motion shader with seeded palette and rhythm.";

      if (isFallback && !isMotionDefault) {
        throw new Error(
          `Shader "${shader.id}" is using the fallback description — add metadata in builtinShaderLibrary.ts`,
        );
      }
    }
  });
});
