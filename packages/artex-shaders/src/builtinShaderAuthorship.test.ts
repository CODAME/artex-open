import { describe, expect, it } from "vitest";
import { BUILTIN_SHADER_REGISTRY } from "./builtinShaderLibrary";
import {
  BUILTIN_SHADER_AUTHORSHIP,
  getBuiltinShaderAttributionStatus,
  getBuiltinShaderAuthorship,
  getBuiltinShaderLicenseLabel,
  isBuiltinShaderReusable,
  BUILTIN_SHADER_LICENSE_LABELS,
} from "./builtinShaderAuthorship";
import { isReuseLicenseId, REUSE_LICENSES } from "./reuseLicenses";

describe("builtinShaderAuthorship", () => {
  it("carries a credit for every registered shader", () => {
    // The guard that keeps this file honest as shaders are added. A new .glsl
    // dropped into ./shaders with no entry here would otherwise ship with the
    // blank credit the whole registry exists to stop, and nothing else would
    // notice.
    const missing = BUILTIN_SHADER_REGISTRY
      .filter((shader) => !(shader.id in BUILTIN_SHADER_AUTHORSHIP))
      .map((shader) => `${shader.id} (${shader.filename})`);

    expect(missing, "add an entry to BUILTIN_SHADER_AUTHORSHIP for each of these").toEqual([]);
  });

  it("states a license only where it also names an author", () => {
    // A license with nobody attached grants on behalf of a person we have not
    // identified, which is the worse half of the defect this registry repairs.
    for (const [id, authorship] of Object.entries(BUILTIN_SHADER_AUTHORSHIP)) {
      if (!authorship.licenseId) continue;
      expect(authorship.ownerDisplayName?.trim(), `${id} states a license but names no author`)
        .toBeTruthy();
    }
  });

  it("uses only ids from the reuse-license taxonomy", () => {
    for (const [id, authorship] of Object.entries(BUILTIN_SHADER_AUTHORSHIP)) {
      if (!authorship.licenseId) continue;
      expect(isReuseLicenseId(authorship.licenseId), `${id} has an unknown license id`).toBe(true);
    }
  });

  it("never confirms rights without stated terms to confirm them under", () => {
    for (const [id, authorship] of Object.entries(BUILTIN_SHADER_AUTHORSHIP)) {
      if (!authorship.rightsConfirmed) continue;
      expect(authorship.licenseId, `${id} confirms rights but states no license`).toBeTruthy();
    }
  });

  it("links an artist slug only where it also names that artist", () => {
    for (const [id, authorship] of Object.entries(BUILTIN_SHADER_AUTHORSHIP)) {
      if (!authorship.ownerArtistSlug) continue;
      expect(authorship.ownerDisplayName?.trim(), `${id} links a slug but names no author`)
        .toBeTruthy();
    }
  });

  it("explains every gap it records", () => {
    // An incomplete credit with no note is a dead end for whoever picks it up:
    // they have to reopen the GLSL to learn what was already known.
    for (const [id, authorship] of Object.entries(BUILTIN_SHADER_AUTHORSHIP)) {
      if (getBuiltinShaderAttributionStatus(authorship) === "complete") continue;
      expect(authorship.attributionNote?.trim(), `${id} is incomplete but says nothing about why`)
        .toBeTruthy();
    }
  });

  it("reads an unknown shader id as unattributed, never as ARTEX's", () => {
    const unknown = getBuiltinShaderAuthorship("no-such-shader");

    expect(unknown.ownerDisplayName).toBeNull();
    expect(unknown.licenseId).toBeNull();
    expect(unknown.rightsConfirmed).toBe(false);
    expect(getBuiltinShaderAttributionStatus(unknown)).toBe("unattributed");
    expect(isBuiltinShaderReusable(unknown)).toBe(false);
  });

  it("separates a missing author from a missing license", () => {
    expect(getBuiltinShaderAttributionStatus({ ownerDisplayName: null, licenseId: null }))
      .toBe("unattributed");
    expect(getBuiltinShaderAttributionStatus({ ownerDisplayName: "  ", licenseId: "mit" }))
      .toBe("unattributed");
    expect(getBuiltinShaderAttributionStatus({ ownerDisplayName: "Kesson", licenseId: null }))
      .toBe("license-missing");
    expect(getBuiltinShaderAttributionStatus({ ownerDisplayName: "Srix", licenseId: "apache-2.0" }))
      .toBe("complete");
  });

  it("withholds reuse until an author, a license, and a confirmation all exist", () => {
    expect(isBuiltinShaderReusable({
      ownerDisplayName: "Alcrego", licenseId: null, rightsConfirmed: false,
    })).toBe(false);
    expect(isBuiltinShaderReusable({
      ownerDisplayName: "Alcrego", licenseId: "mit", rightsConfirmed: false,
    })).toBe(false);
    expect(isBuiltinShaderReusable({
      ownerDisplayName: null, licenseId: "mit", rightsConfirmed: true,
    })).toBe(false);
    expect(isBuiltinShaderReusable({
      ownerDisplayName: "Humprt Pum", licenseId: "mit", rightsConfirmed: true,
    })).toBe(true);
  });

  it("labels every license the taxonomy defines, and none it does not", () => {
    // The map exists to keep the license table out of this chunk's closure
    // (see its comment). That is only safe while it stays in step, so this is
    // the half of the trade that has to hold: same keys, same labels, both
    // directions, checked against the real table at test time where importing
    // it costs nothing.
    expect(Object.keys(BUILTIN_SHADER_LICENSE_LABELS).sort())
      .toEqual(REUSE_LICENSES.map((license) => license.id).sort());

    for (const license of REUSE_LICENSES) {
      expect(BUILTIN_SHADER_LICENSE_LABELS[license.id], `label for ${license.id}`)
        .toBe(license.label);
    }
  });

  it("reads an unstated license as no label, never as a permissive default", () => {
    expect(getBuiltinShaderLicenseLabel(null)).toBeNull();
    expect(getBuiltinShaderLicenseLabel(undefined)).toBeNull();
    expect(getBuiltinShaderLicenseLabel("mit")).toBe("MIT");
  });

  it("keeps the credit OFF the library item, and reachable by id", () => {
    // The separation is load-bearing, not stylistic: this registry is what an
    // artwork route resolves a shader's source from, so a credit field on the
    // item put attribution prose into 19 playback closures that render none of
    // it (~1.2KB brotli each). Assert both halves — the field is absent, and
    // the lookup still answers.
    const particula = BUILTIN_SHADER_REGISTRY.find((shader) => shader.id === "particula-artex");
    expect(particula).toBeDefined();
    expect(particula).not.toHaveProperty("authorship");

    const credit = getBuiltinShaderAuthorship("particula-artex");
    expect(credit.ownerDisplayName).toBe("Humprt Pum");
    expect(credit.licenseId).toBe("mit");
    expect(credit.sourceUrl).toBe("https://github.com/Humprt/particula");
  });

  it("does not credit ARTEX for the shaders named after the artist who made them", () => {
    // The defect that started this: filenames name people, the catalog named
    // the platform. Pin the named ones so a future bulk edit cannot quietly
    // sweep them back under ARTEX.
    const artistNamed: Record<string, string> = {
      "alcrego-motion-01-artex": "Alcrego",
      "florigenix-motion-01-artex": "Florigenix",
      "maxdrekker-motion-01-artex": "Maxdrekker",
      "rafaelamascaro-motion-01-artex": "Rafaela Mascaro",
      "kesson-voyage": "Kesson",
      "kesson-kifs-fractal-artex": "Kesson",
    };

    for (const [id, expectedOwner] of Object.entries(artistNamed)) {
      expect(getBuiltinShaderAuthorship(id).ownerDisplayName, id).toBe(expectedOwner);
    }
  });
});
