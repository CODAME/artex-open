import type { ReuseLicenseId } from "./reuseLicenses";

/**
 * Who each built-in shader belongs to, and under what terms it may be reused.
 *
 * Every shader that ships in this package used to arrive with an id, a label,
 * a description and nothing else, so `/admin/shaders` and the Studio picker
 * both presented forty-odd files as undifferentiated platform furniture. They
 * are not. Several are ports of third-party Shadertoy and GLSL Sandbox work,
 * several more are named after the artist whose motion piece they were
 * converted from, and a handful are genuinely ARTEX's. Attribution for all of
 * it lived in GLSL comments, in six different ad-hoc spellings, and for most
 * files not at all — which is to say it existed for a reader of the source and
 * for nobody else.
 *
 * This is the same move templates made (`content/templateAuthorship.ts`, and
 * `LibraryItem.ownerDisplayName` / `ownerArtistSlug` / `licenseId`): a credit
 * with a name, a link and a license, carried in the record rather than in a
 * comment. `ownerArtistSlug` is a slug and not a Firestore uid for the reason
 * stated there — these records ship in the client bundle, which has no
 * business carrying one, and the slug is the half a reader can act on.
 *
 * ## The rule this file follows
 *
 * **A missing credit is recorded as missing.** Where the source proves an
 * author, that author is named. Where it does not, `ownerDisplayName` is null
 * and the row reads "Attribution needed" — it is never quietly defaulted to
 * ARTEX. Defaulting to the platform is the exact defect this file exists to
 * repair, and it would be undetectable afterwards. The same applies to terms:
 * `licenseId` is null unless a license is actually stated somewhere, because
 * inventing a grant nobody made is worse than showing none (the reasoning
 * `utils/templateAttribution.ts` records for the absent-author case).
 *
 * So `null` here means "nobody has told us", not "public domain" and not
 * "ARTEX's". `attributionNote` carries whatever the file itself said, verbatim
 * enough to act on, so the admin row explains its own gap and someone can
 * close it without reopening the GLSL.
 *
 * ## Filling a gap
 *
 * Add the author and the license to the entry below. `rightsConfirmed` is the
 * assertion that we hold the right to publish the shader for reuse under the
 * stated license; it stays false until a person has actually checked, and a
 * true value with a null `licenseId` is meaningless and rejected by the test.
 */
export interface BuiltinShaderAuthorship {
  /** The person or organisation the shader is credited to. Null = not recorded. */
  ownerDisplayName: string | null;
  /** ARTEX artist slug, when the author has a profile here. Links to /people/<slug>. */
  ownerArtistSlug: string | null;
  /** Reuse terms. Null = no license stated anywhere; NOT a permissive default. */
  licenseId: ReuseLicenseId | null;
  /** Where the work came from, when the source records it. */
  sourceUrl: string | null;
  /** What the source file says about its own origin. Shown on the admin row. */
  attributionNote: string | null;
  /** Someone confirmed we may publish this for reuse under `licenseId`. */
  rightsConfirmed: boolean;
}

/**
 * The shape of a shader ARTEX itself wrote. Apache-2.0 is this package's own
 * declared license (`package.json`), so it is a grant the repo owner actually
 * made rather than one chosen here.
 *
 * `ownerArtistSlug` is null on purpose: the platform is not an artist, and a
 * credit that links to an artist page ARTEX does not have would be a dead end.
 */
const ARTEX_SHADER_AUTHOR = {
  ownerDisplayName: "ARTEX",
  ownerArtistSlug: null,
  licenseId: "apache-2.0",
  rightsConfirmed: true,
} as const satisfies Omit<BuiltinShaderAuthorship, "sourceUrl" | "attributionNote">;

/** An author is named but nobody has stated terms. The common unfinished case. */
const authoredBy = (
  ownerDisplayName: string,
  extra: Partial<BuiltinShaderAuthorship> = {},
): BuiltinShaderAuthorship => ({
  ownerDisplayName,
  ownerArtistSlug: null,
  licenseId: null,
  sourceUrl: null,
  attributionNote: null,
  rightsConfirmed: false,
  ...extra,
});

/**
 * Nobody is recorded. `attributionNote` is what the file offered instead, and
 * `sourceUrl` is kept where the file names an origin without naming a person:
 * a Shadertoy link is the only thread back to whoever should be credited, so
 * dropping it would make the gap harder to close than it already is.
 */
const unattributed = (
  attributionNote: string | null = null,
  sourceUrl: string | null = null,
): BuiltinShaderAuthorship => ({
  ownerDisplayName: null,
  ownerArtistSlug: null,
  licenseId: null,
  sourceUrl,
  attributionNote,
  rightsConfirmed: false,
});

/** ARTEX's own work, under this package's Apache-2.0 declaration. */
const byArtex = (attributionNote: string | null = null): BuiltinShaderAuthorship => ({
  ...ARTEX_SHADER_AUTHOR,
  sourceUrl: null,
  attributionNote,
});

/**
 * Keyed by the shader id `builtinShaderLibrary.ts` derives from the filename.
 *
 * The creator app mirrors most of these files under `apps/creator/src/shaders/`
 * and unions the two catalogs by id (`pages/evolution/shaderLibraryDefs.ts`),
 * so this map covers the union — a shader present in only one of the two sets
 * still has exactly one credit, and there is no second copy to drift.
 */
export const BUILTIN_SHADER_AUTHORSHIP: Record<string, BuiltinShaderAuthorship> = {
  // --- Third-party ports, license stated at the source -----------------------
  "particula-artex": {
    ownerDisplayName: "Humprt Pum",
    ownerArtistSlug: null,
    licenseId: "mit",
    sourceUrl: "https://github.com/Humprt/particula",
    attributionNote: "Shader port of Particula. MIT (c) 2025 Humprt Pum.",
    rightsConfirmed: true,
  },
  "sonic-lens-dual-lens-artex": {
    ownerDisplayName: "Srix",
    ownerArtistSlug: null,
    licenseId: "apache-2.0",
    sourceUrl: "https://github.com/srix/sonic-lens",
    attributionNote: "Sonic Lens, ported to ARTEX uniform conventions. Apache-2.0.",
    rightsConfirmed: true,
  },

  // --- Third-party ports, author known, no license stated anywhere -----------
  // These name a person but grant nothing. Shadertoy's default terms are
  // CC BY-NC-SA 3.0, which is not in the code-shaped taxonomy this package
  // offers and is not a reuse license we can restate on the author's behalf,
  // so the license stays null until each author is asked.
  "moon-surface-ii-artex": authoredBy("Nikos Papadopoulos", {
    sourceUrl: "https://www.shadertoy.com/user/4rknova",
    attributionNote: "Based on Nikos Papadopoulos (4rknova, 2015), rewritten for ARTEX compositing.",
  }),
  "matrix-op-artex": authoredBy("coyote", {
    sourceUrl: "https://www.shadertoy.com/view/ltfGzS",
    attributionNote: "Based on coyote's shader, rewritten for ARTEX compositing.",
  }),
  "sixteen-segment-display-v4-artex": authoredBy("I.G.P.", {
    sourceUrl: "https://glslsandbox.com/e#28623",
    attributionNote: "Based on I.G.P., rewritten for ARTEX compositing.",
  }),
  "kirby-jump-artex": unattributed(
    "Ported from Shadertoy; the source file records the URL but never names its author.",
    "https://www.shadertoy.com/view/lt2fD3",
  ),
  "bumped-sinusoidal-warp-artex": unattributed(
    "Derived from Fabrice's \"Plop 2\", itself a simplification of Fantomas's \"Plop\". "
    + "The retained header is written in the first person but never signs itself.",
  ),
  "station-17-artex": unattributed(
    "Its worley-sphere noise cites a Shadertoy shader as \"the same principle\": a technique "
    + "reference, not a port. The rest of the file is unsigned, and \"STATION 17\" is a title "
    + "rather than a signature.",
    "https://www.shadertoy.com/view/t32yzd",
  ),

  // --- Named for the artist whose work they were converted from --------------
  // The four "Motion 01" files are video-converted motion shaders and the five
  // Kesson files are image-distortion studies. In both cases the filename is
  // the only record of who made the work, and no file states terms. Credited
  // by name; reuse stays closed until each artist states a license.
  "alcrego-motion-01-artex": authoredBy("Alcrego", {
    attributionNote: "Video-converted motion shader. Credited from the filename; no license stated in the source.",
  }),
  "florigenix-motion-01-artex": authoredBy("Florigenix", {
    attributionNote: "Video-converted motion shader. Credited from the filename; no license stated in the source.",
  }),
  "maxdrekker-motion-01-artex": authoredBy("Maxdrekker", {
    attributionNote: "Video-converted motion shader. Credited from the filename; no license stated in the source.",
  }),
  "rafaelamascaro-motion-01-artex": authoredBy("Rafaela Mascaro", {
    attributionNote: "Video-converted motion shader. Credited from the filename; no license stated in the source.",
  }),
  "kesson-fbm-image-distortion-artex": authoredBy("Kesson", {
    attributionNote: "Credited from the filename; no license stated in the source.",
  }),
  "kesson-image-extrusion-1-artex": authoredBy("Kesson", {
    attributionNote: "Raymarched heightfield image extrusion. Credited from the filename; no license stated in the source.",
  }),
  "kesson-image-extrusion-2-artex": authoredBy("Kesson", {
    attributionNote: "Raymarched heightfield image extrusion. Credited from the filename; no license stated in the source.",
  }),
  "kesson-image-extrusion-3-artex": authoredBy("Kesson", {
    attributionNote: "Raymarched heightfield image extrusion. Credited from the filename; no license stated in the source.",
  }),
  "kesson-kifs-fractal-artex": authoredBy("Kesson", {
    attributionNote: "Credited from the filename; no license stated in the source.",
  }),
  "kesson-voyage": authoredBy("Kesson", {
    attributionNote: "Gyroid tunnel warper, rewritten for ARTEX compositing. Credited from the filename; no license stated in the source.",
  }),

  // --- ARTEX's own ----------------------------------------------------------
  // Either the file says so outright, or the shader exists to serve a piece of
  // this platform (an experience's own field, a compositor diagnostic, a
  // pipeline stage) and has no life outside it.
  "flower-sdf-artex": byArtex("Header states Apache-2.0 — ARTEX."),
  "reeded-glass-portrait-artex": byArtex("Header states Apache-2.0 — ARTEX."),
  "artex-living-field": byArtex("The ARTEX Living Field experience's own shader."),
  "primitive-intelligence-study-artex": byArtex("The Primitive Intelligence experience's own shader."),
  "world-signals-test-field": byArtex("A V3 shaderStack compositor diagnostic."),
  "echo-artex": byArtex("Pipeline shader for the artex.frame-buffer adapter; launched as an experience type."),
  "identity-echo-artex": byArtex("The Identity Echo experience's own shader: the camera shows through a face-shaped mask over the artwork. Moved out of the presets panel in #3913."),
  "phone-chromatic-warp-artex": byArtex("Written as a trigger shader for the \"holding a phone\" gesture."),
  "phone-glitch-split-artex": byArtex("Written as a trigger shader for the \"holding a phone\" gesture."),

  // --- Author not recorded --------------------------------------------------
  // Procedural pieces written from a visual reference. The code reads as
  // original and the note is what the file offered, but "reads as original" is
  // not evidence of who wrote it, so none of these claim an author.
  "anemone-dustfield-artex": unattributed("Source header cites a media reference id only."),
  "cobalt-petal-plume-artex": unattributed("Inspired by a luminous blue floral plume with particulate spray."),
  "comic-wall-mosaic-artex": unattributed("Inspired by a pinned, hand-drawn comic board on a textured wall."),
  "filament-column-artex": unattributed("Source header cites a video reference only."),
  "ghost-flora-column-artex": unattributed("Source header cites a media reference id only."),
  "gif-tile-dancer-grid-artex": unattributed("GIF-inspired tiled dancer wall."),
  "golden-electric-spiral-artex": unattributed("Rewritten for ARTEX compositing; the source it was rewritten from is not named."),
  "golden-porous-rift-artex": unattributed("Inspired by a molten, porous golden cavern."),
  "lavender-poppy-veils-artex": unattributed("Source header cites a media reference id only."),
  "lupine-apparition-artex": unattributed("Source header cites a media reference id only."),
  "masterpiece-mesh-artex": unattributed("Uses uploaded media as a single moving artwork inside the filament body."),
  "modbod-normal-iridescent-artex": unattributed(
    "Inspired by modbod3d-gifgen: MeshNormalMaterial mapped onto a spinning body. "
    + "\"ModBod\" names the subject, not a signed author.",
  ),
  "neon-botanical-filaments-artex": unattributed("Inspired by translucent wireframe floral references."),
  "pastel-wave-trails-artex": unattributed("p5-style layered gradient wave ribbons translated into a single-pass shader."),
  "reactive-compute-splat-bloom-artex": unattributed("Inspired by suspended liquid curl references."),
  "verdant-synapse-web-artex": unattributed("Inspired by glowing green membrane strands and synaptic nodes."),
};

/**
 * What a credit is still missing, if anything.
 *
 * Three states rather than a boolean because the two incomplete ones need
 * different work from different people: `unattributed` needs someone to
 * establish who made it, `license-missing` needs that named author to state
 * terms. Collapsing them would hide which of the two a row is waiting on.
 */
export type BuiltinShaderAttributionStatus = "complete" | "license-missing" | "unattributed";

export const getBuiltinShaderAttributionStatus = (
  authorship: Pick<BuiltinShaderAuthorship, "ownerDisplayName" | "licenseId"> | null | undefined,
): BuiltinShaderAttributionStatus => {
  if (!authorship?.ownerDisplayName?.trim()) return "unattributed";
  return authorship.licenseId ? "complete" : "license-missing";
};

/**
 * Whether the shader may be offered for reuse — forked, or restated under a
 * license elsewhere. Requires a named author, stated terms, AND a person
 * having confirmed we hold the right to publish it that way. A shader that
 * fails this is still perfectly usable inside ARTEX; what it cannot do is
 * travel out under terms nobody granted.
 */
export const isBuiltinShaderReusable = (
  authorship: Pick<BuiltinShaderAuthorship, "ownerDisplayName" | "licenseId" | "rightsConfirmed"> | null | undefined,
): boolean => Boolean(
  authorship?.ownerDisplayName?.trim() && authorship.licenseId && authorship.rightsConfirmed,
);

/**
 * The label each reuse license renders as.
 *
 * A local map rather than a `getReuseLicense()` call on the sibling module,
 * and the reason is chunking rather than taste. `apps/creator/src/utils/
 * templateCredit` is pinned to the catalog's cover-art chunk and imports the
 * license table, so that group owns `reuseLicenses` along with 42KB of inline
 * cover SVG. A value import here would put that chunk in the closure of every
 * surface rendering a credit: measured at ~37KB brotli on 19 routes that show
 * no license at all, on a fleet whose tightest route had 292 bytes of headroom.
 *
 * Duplication guarded rather than avoided, the same way `capabilities.ts` and
 * `capabilities.mjs` are: the test beside this file asserts the map covers
 * `REUSE_LICENSES` exactly, key for key and label for label, so it cannot
 * drift. A type-only import of `ReuseLicenseId` is free and stays.
 */
export const BUILTIN_SHADER_LICENSE_LABELS: Record<ReuseLicenseId, string> = {
  mit: "MIT",
  "apache-2.0": "Apache 2.0",
  "bsd-3-clause": "BSD 3-Clause",
  "cc0-1.0": "CC0 1.0",
};

/** The label for a shader's stated terms, or null when none are stated. */
export const getBuiltinShaderLicenseLabel = (
  licenseId: ReuseLicenseId | null | undefined,
): string | null => (licenseId ? BUILTIN_SHADER_LICENSE_LABELS[licenseId] : null);

/** The credit for a shader id. Unknown ids read as unattributed, never as ARTEX's. */
export const getBuiltinShaderAuthorship = (shaderId: string): BuiltinShaderAuthorship =>
  BUILTIN_SHADER_AUTHORSHIP[shaderId] ?? unattributed();
