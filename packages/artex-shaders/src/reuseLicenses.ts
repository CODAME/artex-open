/**
 * Reuse licenses — the code-shaped license vocabulary ARTEX offers on anything
 * an artist publishes for other artists to fork: shared shaders, and (since
 * templates gained an author) catalog templates.
 *
 * Two license taxonomies exist on purpose and are not interchangeable:
 *   - THIS one — MIT / Apache 2.0 / BSD 3-Clause / CC0 — covers work that is
 *     *source*: a shader, a sketch, a template recipe. Reuse means running and
 *     modifying code.
 *   - `AssetLicense` in `@artex/contract/assetSharing` — all-rights-reserved /
 *     CC BY-NC / CC BY — covers work that is *media*: an image, a video, an
 *     audio bed. Reuse means redistribution, and MIT would be a category error.
 * Pick by what the record holds, never by which import is closer to hand.
 *
 * It lives in `@artex/shaders` rather than `@artex/contract` because it is
 * dependency-free and this is where it already was; moving it would cost the
 * shaders package a workspace dependency and a lockfile regen for no
 * functional gain. `@artex/core` already depends on `@artex/shaders`, so
 * `LibraryItem` can type its `licenseId` against `ReuseLicenseId` directly.
 *
 * `sharedShaderLicenses.ts` re-exports every name here under its original
 * shader-specific spelling, so no existing importer had to change.
 */

export type ReuseLicenseId = "mit" | "apache-2.0" | "bsd-3-clause" | "cc0-1.0";

export interface ReuseLicenseDefinition {
  id: ReuseLicenseId;
  label: string;
  summary: string;
  recommended?: boolean;
}

export const REUSE_LICENSES: ReuseLicenseDefinition[] = [
  {
    id: "mit",
    label: "MIT",
    summary: "Permissive software license. Reuse and modification allowed with attribution and license notice.",
    recommended: true,
  },
  {
    id: "apache-2.0",
    label: "Apache 2.0",
    summary: "Permissive software license with attribution requirements and an explicit patent grant.",
  },
  {
    id: "bsd-3-clause",
    label: "BSD 3-Clause",
    summary: "Permissive software license with notice retention and no-endorsement language.",
  },
  {
    id: "cc0-1.0",
    label: "CC0 1.0",
    summary: "Public-domain-style dedication. Others can reuse the work without attribution.",
  },
];

const LICENSE_BY_ID = new Map(REUSE_LICENSES.map((license) => [license.id, license]));

export const isReuseLicenseId = (value: string | null | undefined): value is ReuseLicenseId =>
  typeof value === "string" && LICENSE_BY_ID.has(value as ReuseLicenseId);

export const getReuseLicense = (
  value: string | null | undefined,
): ReuseLicenseDefinition | null => {
  if (!value || !isReuseLicenseId(value)) return null;
  return LICENSE_BY_ID.get(value) ?? null;
};
