// packages/artex-contract/src/assetSharing.ts
// ARTEX asset sharing — v1 types and helpers

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/**
 * Canonical visibility values (Phase 3+).
 *
 * - "private"   — only the owner can see/use this asset
 * - "shared"    — visible to accepted collaborators (Phase 4)
 * - "published" — visible to all active users; reusability is determined by
 *                 the asset's `license` field:
 *                   all_rights_reserved → view-only ("showcase")
 *                   cc_by_nc_4_0 / cc_by_4_0 → remixable
 *
 * Legacy values "public_showcase" and "public_reusable" are preserved as
 * aliases — they are still accepted on read and normalised to "published" by
 * `normalizeAssetVisibility`. New writes must use the canonical values.
 */
export type AssetVisibility =
  | "private"
  | "shared"
  | "published"
  // Legacy aliases (pre-Phase-3) — accepted on read, not written
  | "public_showcase"
  | "public_reusable";

/** Canonical values only — suitable for new writes. */
export type CanonicalAssetVisibility = "private" | "shared" | "published";

/**
 * Normalises legacy visibility values to canonical ones.
 * - "public_showcase" → "published"  (ARR license implies view-only)
 * - "public_reusable" → "published"  (CC license implies remixable)
 * All other values pass through unchanged.
 */
export const normalizeAssetVisibility = (v: string | null | undefined): CanonicalAssetVisibility => {
  if (v === "public_showcase" || v === "public_reusable") return "published";
  if (v === "shared") return "shared";
  if (v === "published") return "published";
  return "private";
};

export type AssetLicense =
  | "all_rights_reserved"  // published, view-only (was: public_showcase default)
  | "cc_by_nc_4_0"         // CC BY-NC: credit required, no commercial use
  | "cc_by_4_0";           // CC BY: credit required, commercial use allowed

export type AssetType = "image" | "video" | "audio" | "shader" | "media_pack" | "model" | "scene" | "code";

// ---------------------------------------------------------------------------
// Per-asset sharing settings (stored inside ConfigJson.assetSharing)
// ---------------------------------------------------------------------------

export interface AssetSharingSettings {
  /** How visible the asset is outside the owner's account. Default: "private". */
  visibility: AssetVisibility;
  /**
   * License under which the asset is offered.
   * null                → visibility is "private"
   * "all_rights_reserved" → published, view-only
   * "cc_by_nc_4_0" | "cc_by_4_0" → published and remixable
   */
  license: AssetLicense | null;
  /**
   * Creator has confirmed they hold the rights to share this asset.
   * Must be true before any public visibility is persisted.
   */
  rightsConfirmed: boolean;
  /** Human-readable title for the asset (used in attribution). */
  title?: string;
  /** Platform asset ID, set after the asset has been published. */
  publishedAssetId?: string | null;
  /** ID of the source asset this was remixed from, if applicable. */
  sourceAssetId?: string | null;
}

// ---------------------------------------------------------------------------
// License catalogue
// ---------------------------------------------------------------------------

export interface AssetLicenseDefinition {
  id: AssetLicense;
  label: string;
  /** One-line summary shown in the UI selector. */
  summary: string;
  /** Short label for the info panel badge. */
  badgeLabel: string;
  /** Canonical URL for the license text. Empty for all_rights_reserved. */
  url: string;
}

export const ASSET_LICENSES: AssetLicenseDefinition[] = [
  {
    id: "all_rights_reserved",
    label: "All rights reserved",
    summary: "Others can view this asset but cannot reuse or remix it.",
    badgeLabel: "© All rights reserved",
    url: "",
  },
  {
    id: "cc_by_nc_4_0",
    label: "CC BY-NC 4.0",
    summary: "Others can use and remix with credit. No commercial use.",
    badgeLabel: "CC BY-NC 4.0",
    url: "https://creativecommons.org/licenses/by-nc/4.0/",
  },
  {
    id: "cc_by_4_0",
    label: "CC BY 4.0",
    summary: "Others can use and remix with credit, including commercial use.",
    badgeLabel: "CC BY 4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
  },
];

export const ASSET_LICENSE_MAP = new Map(
  ASSET_LICENSES.map((license) => [license.id, license]),
);

export const getAssetLicense = (
  id: AssetLicense | null | undefined,
): AssetLicenseDefinition | null =>
  id ? (ASSET_LICENSE_MAP.get(id) ?? null) : null;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_ASSET_SHARING_SETTINGS: AssetSharingSettings = {
  visibility: "private",
  license: null,
  rightsConfirmed: false,
};

// ---------------------------------------------------------------------------
// Derivation helpers
// ---------------------------------------------------------------------------

/**
 * Given a new visibility, return the implied license.
 * "published" with an existing CC choice preserves that choice.
 * "published" with no prior CC choice defaults to all_rights_reserved (view-only).
 * Handles legacy "public_showcase" / "public_reusable" for backward compat.
 */
export const deriveImpliedLicense = (
  visibility: AssetVisibility,
  currentLicense: AssetLicense | null,
): AssetLicense | null => {
  if (visibility === "private") return null;
  if (visibility === "public_showcase") return "all_rights_reserved";
  if (visibility === "public_reusable") {
    // Keep CC choice if already set, else default to cc_by_nc_4_0
    if (currentLicense === "cc_by_nc_4_0" || currentLicense === "cc_by_4_0") return currentLicense;
    return "cc_by_nc_4_0";
  }
  // "published" or "shared": keep existing license if present, else all_rights_reserved
  if (currentLicense) return currentLicense;
  return "all_rights_reserved";
};

/** True when the asset is visible to users other than the owner. */
export const isPublicAsset = (settings: AssetSharingSettings): boolean =>
  normalizeAssetVisibility(settings.visibility) !== "private";

/** True when the settings represent a remixable asset (CC license). */
export const isReusableAsset = (settings: AssetSharingSettings): boolean => {
  const v = normalizeAssetVisibility(settings.visibility);
  if (v === "private") return false;
  return settings.license === "cc_by_nc_4_0" || settings.license === "cc_by_4_0";
};

/** True when the settings are valid for saving as public. */
export const canPublishAsset = (settings: AssetSharingSettings): boolean =>
  normalizeAssetVisibility(settings.visibility) !== "private" && settings.rightsConfirmed;

// ---------------------------------------------------------------------------
// Phase 6 — License compatibility matrix
// ---------------------------------------------------------------------------

/**
 * Whether a project with `projectLicense` can legally embed an asset with
 * `assetLicense` and publish the result.
 *
 * Rules:
 *  - null project license (private/unpublished) → always compatible
 *  - "all_rights_reserved" project → always compatible (output is view-only;
 *    the project does not claim to CC-relicense the embedded assets)
 *  - "cc_by_nc_4_0" project → asset must allow non-commercial derivatives
 *    (cc_by_nc_4_0 or cc_by_4_0)
 *  - "cc_by_4_0" project → asset must allow commercial derivatives (cc_by_4_0)
 */
export const checkLicenseCompatibility = (
  projectLicense: string | null | undefined,
  assetLicense: string | null | undefined,
): boolean => {
  if (!projectLicense || projectLicense === "all_rights_reserved") return true;
  if (projectLicense === "cc_by_nc_4_0") {
    return assetLicense === "cc_by_nc_4_0" || assetLicense === "cc_by_4_0";
  }
  if (projectLicense === "cc_by_4_0") {
    return assetLicense === "cc_by_4_0";
  }
  // Unknown license → conservative: allow
  return true;
};

/**
 * Human-readable reason why a project license and asset license are
 * incompatible. Returns null when compatible.
 */
export const getLicenseIncompatibilityReason = (
  projectLicense: string | null | undefined,
  assetLicense: string | null | undefined,
): string | null => {
  if (checkLicenseCompatibility(projectLicense, assetLicense)) return null;
  if (projectLicense === "cc_by_nc_4_0") {
    return "This project uses a CC BY-NC license but the asset does not allow remixing. Remove the asset or switch to a compatible license.";
  }
  if (projectLicense === "cc_by_4_0") {
    return "This project uses a CC BY license (commercial use) but the asset does not allow commercial derivatives. Remove the asset or switch to a compatible license.";
  }
  return "License conflict between project and asset.";
};
