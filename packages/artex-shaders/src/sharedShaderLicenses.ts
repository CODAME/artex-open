export type SharedShaderLicenseId = "mit" | "apache-2.0" | "bsd-3-clause" | "cc0-1.0";

export interface SharedShaderLicenseDefinition {
  id: SharedShaderLicenseId;
  label: string;
  summary: string;
  recommended?: boolean;
}

export const SHARED_SHADER_LICENSES: SharedShaderLicenseDefinition[] = [
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
    summary: "Public-domain-style dedication. Others can reuse the shader without attribution.",
  },
];

const LICENSE_BY_ID = new Map(SHARED_SHADER_LICENSES.map((license) => [license.id, license]));

export const isShareableShaderLicenseId = (value: string | null | undefined): value is SharedShaderLicenseId =>
  typeof value === "string" && LICENSE_BY_ID.has(value as SharedShaderLicenseId);

export const getSharedShaderLicense = (
  value: string | null | undefined,
): SharedShaderLicenseDefinition | null => {
  if (!value || !isShareableShaderLicenseId(value)) return null;
  return LICENSE_BY_ID.get(value) ?? null;
};
