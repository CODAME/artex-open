// Identity Echo — recipe shape for face-diffusion player experiences.
//
// Returned by `POST /suggest-identity-recipe` (artex-ai Gemma) and accepted as
// an optional override on a published ARTEX package. The recipe describes how
// the visitor's face is composited into the artwork. The face is never shown
// directly — it becomes the medium.

export type IdentityEchoMode = "face" | "eyes" | "aura";

export interface IdentityRecipe {
  /** Composite mode driving the GLSL mask shape. */
  mode: IdentityEchoMode;
  /** Maximum number of faces tracked simultaneously (default 1). */
  maxFaces: number;
  /**
   * 0..1 — how literal the face is in the artwork.
   * 0 = fully abstract (only presence affects the artwork);
   * 1 = explicit face-shaped window. Most experiences sit in 0.3..0.7.
   */
  recognizability: number;
  /** 0..1 — Gaussian blur applied to the face signal before compositing. */
  blur: number;
  /** 0..1 — additive glow around the face shape. */
  glow: number;
  /** 0..1 — film grain mixed over the composite for tactile feel. */
  grain: number;
}

export const DEFAULT_IDENTITY_RECIPE: IdentityRecipe = {
  mode: "face",
  maxFaces: 1,
  recognizability: 0.55,
  blur: 0.35,
  glow: 0.4,
  grain: 0.15,
};

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

const VALID_MODES: ReadonlySet<IdentityEchoMode> = new Set(["face", "eyes", "aura"]);

/** Parses an unknown payload into a valid IdentityRecipe, falling back to defaults for missing/invalid fields. */
export function parseIdentityRecipe(input: unknown): IdentityRecipe {
  if (!input || typeof input !== "object") return { ...DEFAULT_IDENTITY_RECIPE };
  const raw = input as Partial<IdentityRecipe>;
  const mode: IdentityEchoMode = raw.mode && VALID_MODES.has(raw.mode) ? raw.mode : DEFAULT_IDENTITY_RECIPE.mode;
  const maxFacesRaw = typeof raw.maxFaces === "number" && Number.isFinite(raw.maxFaces) ? Math.floor(raw.maxFaces) : DEFAULT_IDENTITY_RECIPE.maxFaces;
  const maxFaces = Math.max(1, Math.min(8, maxFacesRaw));
  const recognizability = typeof raw.recognizability === "number" ? clamp01(raw.recognizability) : DEFAULT_IDENTITY_RECIPE.recognizability;
  const blur = typeof raw.blur === "number" ? clamp01(raw.blur) : DEFAULT_IDENTITY_RECIPE.blur;
  const glow = typeof raw.glow === "number" ? clamp01(raw.glow) : DEFAULT_IDENTITY_RECIPE.glow;
  const grain = typeof raw.grain === "number" ? clamp01(raw.grain) : DEFAULT_IDENTITY_RECIPE.grain;
  return { mode, maxFaces, recognizability, blur, glow, grain };
}
