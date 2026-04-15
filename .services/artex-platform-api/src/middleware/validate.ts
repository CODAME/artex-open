/**
 * Request validation middleware using the @artex/contract validators.
 *
 * Wraps contract-level validation (validateConfigJson, normalizeProjectPackageData)
 * into Express middleware that returns proper 400/422 responses.
 */

import type { Request, Response, NextFunction } from "express";
import {
  validateConfigJson,
  normalizeProjectPackageData,
  PackageContractError,
} from "@artex/contract";
import type { ConfigJson } from "@artex/contract";

/**
 * Validates that req.body is a valid ConfigJson.
 * Returns 400 for malformed JSON, 422 for contract violations.
 */
export const validateConfig = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const config = req.body as ConfigJson;

    if (!config || typeof config !== "object") {
      res.status(400).json({
        code: "invalid_body",
        message: "Request body must be a JSON object.",
      });
      return;
    }

    validateConfigJson(config);
    next();
  } catch (err) {
    if (err instanceof PackageContractError) {
      res.status(422).json({
        code: err.code,
        message: err.message,
      });
      return;
    }
    res.status(400).json({
      code: "validation_error",
      message: err instanceof Error ? err.message : "Validation failed.",
    });
  }
};

/**
 * Validates and normalizes req.body as ProjectPackageData.
 * Attaches the normalized version to req.body.
 */
export const validatePackageData = (req: Request, res: Response, next: NextFunction): void => {
  const normalized = normalizeProjectPackageData(req.body);

  if (!normalized) {
    res.status(422).json({
      code: "invalid_package_data",
      message: "Request body is not valid ProjectPackageData.",
    });
    return;
  }

  // Replace body with normalized version
  req.body = normalized;
  next();
};

/**
 * Validates a partial config for PATCH operations.
 * Merges the patch with an existing config and validates the result.
 */
export const validateConfigPatch = (existingConfigGetter: (projectId: string) => ConfigJson | null) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const projectId = req.params.projectId;
    if (!projectId) {
      res.status(400).json({ code: "missing_project_id", message: "Project ID is required." });
      return;
    }

    const existing = existingConfigGetter(projectId);
    if (!existing) {
      res.status(404).json({ code: "project_not_found", message: "Project not found." });
      return;
    }

    try {
      // JSON Merge Patch: shallow merge top-level, deep merge nested objects
      const merged = deepMergePatch(existing, req.body) as ConfigJson;
      validateConfigJson(merged);

      // Attach merged result for the handler
      (req as any)._mergedConfig = merged;
      next();
    } catch (err) {
      if (err instanceof PackageContractError) {
        res.status(422).json({ code: err.code, message: err.message });
        return;
      }
      res.status(400).json({
        code: "validation_error",
        message: err instanceof Error ? err.message : "Patch validation failed.",
      });
    }
  };
};

/**
 * RFC 7396 JSON Merge Patch implementation.
 */
export function deepMergePatch(target: any, patch: any): any {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
    return patch;
  }

  const result = { ...target };

  for (const key of Object.keys(patch)) {
    if (patch[key] === null) {
      delete result[key];
    } else if (
      typeof patch[key] === "object"
      && !Array.isArray(patch[key])
      && typeof result[key] === "object"
      && !Array.isArray(result[key])
    ) {
      result[key] = deepMergePatch(result[key], patch[key]);
    } else {
      result[key] = patch[key];
    }
  }

  return result;
}
