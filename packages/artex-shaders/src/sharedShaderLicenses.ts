/**
 * Shader-flavoured spelling of the shared reuse-license registry.
 *
 * The definitions moved to `./reuseLicenses` when catalog templates gained an
 * author and a license and needed the same four options: one list, two names,
 * no second copy to drift. Every name below is an alias of its neutral
 * counterpart, kept because the `./shared-licenses` export path and its
 * importers (the creator's `data/sharedShaderLicenses.ts`, the shader import
 * dialog, `SharedShaderRecord.licenseId`) all predate the generalisation.
 *
 * New code should import from `./reuseLicenses` (`@artex/shaders/reuse-licenses`).
 */
export {
  REUSE_LICENSES,
  REUSE_LICENSES as SHARED_SHADER_LICENSES,
  getReuseLicense,
  getReuseLicense as getSharedShaderLicense,
  isReuseLicenseId,
  isReuseLicenseId as isShareableShaderLicenseId,
} from "./reuseLicenses";

export type {
  ReuseLicenseId,
  ReuseLicenseId as SharedShaderLicenseId,
  ReuseLicenseDefinition,
  ReuseLicenseDefinition as SharedShaderLicenseDefinition,
} from "./reuseLicenses";
