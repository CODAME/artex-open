// packages/artex-contract/src/unifiedAssets.ts
//
// Phase 1 of the unified asset model. See
// docs/proposals/unified-asset-import-and-sharing.md.
//
// These types are NOT re-exported from ./index because the names
// `AssetVisibility` and `AssetType` collide with the legacy media-only
// taxonomy in ./assetSharing.ts. Consumers that want the unified
// taxonomy must import from "@artex/contract/unifiedAssets" directly.
// Phase 3 (media parity) migrates the legacy types into this module.

export type AssetVisibility = "private" | "shared" | "published";

export type AssetStatus = "active" | "archived" | "hidden";

export type AssetLicenseId =
  | "mit"
  | "apache-2.0"
  | "bsd-3-clause"
  | "cc0-1.0"
  | "cc-by-4.0"
  | "cc-by-sa-4.0"
  | "cc-by-nc-4.0"
  | "cc-by-nc-sa-4.0"
  | "all-rights-reserved";

export type UnifiedAssetType = "shader" | "code" | "scene" | "media" | "project";

export type AssetCollaboratorRole = "owner" | "editor" | "viewer";

export type AssetCollaboratorStatus = "pending" | "accepted" | "declined";

export interface AssetCollaborator {
  userId: string | null;
  email: string;
  normalizedEmail: string | null;
  displayName: string | null;
  artistName: string | null;
  role: AssetCollaboratorRole;
  contributionTags: string[];
  status: AssetCollaboratorStatus;
  invitedAt: string;
  acceptedAt?: string | null;
  invitedByUserId: string;
}

export interface AssetRecordBase {
  id: string;
  ownerUserId: string;
  ownerDisplayName: string;
  ownerArtistName?: string | null;

  title: string;
  summary?: string;
  description?: string;
  tags: string[];
  coverDataUrl?: string | null;

  visibility: AssetVisibility;
  status: AssetStatus;
  licenseId: AssetLicenseId | null;
  rightsConfirmed: boolean;

  collaborators: AssetCollaborator[];
  acceptedCollaboratorUserIds: string[];
  editorUserIds: string[];
  pendingInviteEmails: string[];

  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
  unpublishedAt?: string | null;

  forkedFromAssetId?: string | null;
  forkedFromAssetType?: UnifiedAssetType | null;
  forkedFromOwnerUserId?: string | null;

  revision: number;
  lastEditedByUserId: string;
  lastEditedByDisplayName: string;
}

export interface AssetLicenseDefinition {
  id: AssetLicenseId;
  label: string;
  summary: string;
  url: string;
}

export const UNIFIED_ASSET_LICENSES: AssetLicenseDefinition[] = [
  {
    id: "mit",
    label: "MIT",
    summary: "Permissive. Reuse and modification allowed with attribution and license notice.",
    url: "https://opensource.org/license/mit",
  },
  {
    id: "apache-2.0",
    label: "Apache 2.0",
    summary: "Permissive with explicit patent grant.",
    url: "https://www.apache.org/licenses/LICENSE-2.0",
  },
  {
    id: "bsd-3-clause",
    label: "BSD 3-Clause",
    summary: "Permissive with notice retention and no-endorsement clause.",
    url: "https://opensource.org/license/bsd-3-clause",
  },
  {
    id: "cc0-1.0",
    label: "CC0 1.0",
    summary: "Public-domain-style dedication. No attribution required.",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  {
    id: "cc-by-4.0",
    label: "CC BY 4.0",
    summary: "Reuse and commercial use allowed with attribution.",
    url: "https://creativecommons.org/licenses/by/4.0/",
  },
  {
    id: "cc-by-sa-4.0",
    label: "CC BY-SA 4.0",
    summary: "Reuse allowed; derivatives must share-alike.",
    url: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  {
    id: "cc-by-nc-4.0",
    label: "CC BY-NC 4.0",
    summary: "Reuse allowed with attribution. No commercial use.",
    url: "https://creativecommons.org/licenses/by-nc/4.0/",
  },
  {
    id: "cc-by-nc-sa-4.0",
    label: "CC BY-NC-SA 4.0",
    summary: "Non-commercial reuse with attribution; derivatives must share-alike.",
    url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  },
  {
    id: "all-rights-reserved",
    label: "All rights reserved",
    summary: "Viewable but not reusable without explicit permission.",
    url: "",
  },
];

const LICENSE_BY_ID = new Map<AssetLicenseId, AssetLicenseDefinition>(
  UNIFIED_ASSET_LICENSES.map((license) => [license.id, license]),
);

export const getUnifiedAssetLicense = (
  id: AssetLicenseId | null | undefined,
): AssetLicenseDefinition | null => (id ? (LICENSE_BY_ID.get(id) ?? null) : null);

export const isValidUnifiedAssetLicenseId = (
  value: unknown,
): value is AssetLicenseId =>
  typeof value === "string" && LICENSE_BY_ID.has(value as AssetLicenseId);

// Per-type license allowlists. The import dialog populates its license
// dropdown from these so each asset type only shows legally-relevant options.
export const LICENSE_ALLOWLIST_BY_ASSET_TYPE: Record<UnifiedAssetType, AssetLicenseId[]> = {
  shader: ["mit", "apache-2.0", "bsd-3-clause", "cc0-1.0"],
  code: ["mit", "apache-2.0", "bsd-3-clause", "cc0-1.0"],
  scene: ["cc0-1.0", "cc-by-4.0", "cc-by-sa-4.0", "all-rights-reserved"],
  media: [
    "cc0-1.0",
    "cc-by-4.0",
    "cc-by-nc-4.0",
    "cc-by-sa-4.0",
    "cc-by-nc-sa-4.0",
    "all-rights-reserved",
  ],
  project: ["cc-by-4.0", "cc-by-nc-4.0", "cc-by-sa-4.0", "all-rights-reserved"],
};

export const DEFAULT_LICENSE_BY_ASSET_TYPE: Record<UnifiedAssetType, AssetLicenseId> = {
  shader: "mit",
  code: "mit",
  scene: "cc-by-sa-4.0",
  media: "all-rights-reserved",
  project: "all-rights-reserved",
};

export const isLicenseAllowedForAssetType = (
  assetType: UnifiedAssetType,
  licenseId: AssetLicenseId,
): boolean => LICENSE_ALLOWLIST_BY_ASSET_TYPE[assetType].includes(licenseId);

// Payload submitted by AssetImportDialog. The record on the wire extends
// AssetRecordBase + type-specific fields; this payload captures only what
// the dialog itself collects before the save path fills in ownership,
// timestamps, and computed fields.
export interface AssetImportPayloadBase {
  assetType: UnifiedAssetType;
  title: string;
  summary: string;
  description?: string;
  tags: string[];
  visibility: AssetVisibility;
  licenseId: AssetLicenseId | null;
  rightsConfirmed: boolean;
  coverDataUrl?: string | null;
}

export interface ShaderAssetImportPayload extends AssetImportPayloadBase {
  assetType: "shader";
  source: string;
  filename: string | null;
}

export type AssetImportPayload = ShaderAssetImportPayload;

export const DEFAULT_VISIBILITY_FOR_ASSET_TYPE: Record<UnifiedAssetType, AssetVisibility> = {
  shader: "private",
  code: "private",
  scene: "private",
  media: "private",
  project: "private",
};
