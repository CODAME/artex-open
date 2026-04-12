/**
 * Workspace boundary checker for artex-open.
 *
 * Ensures open-layer packages never import from private ARTEX code
 * (artex-core, apps/creator, .services) or from each other in
 * forbidden directions.
 *
 * Adapted from the ARTEX monorepo boundary checker.
 */

import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();

const importPattern = /\b(?:import|export)\s[^"'`]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

const RULES = [
  {
    scope: "packages/artex-contract/src",
    forbiddenPackagePrefixes: ["@artex/core", "@artex/creator", "@artex/shaders", "@artex/experiments", "@artex/shader-tools"],
    forbiddenResolvedPrefixes: ["packages/artex-core", "apps/creator", ".services"],
  },
  {
    scope: "packages/artex-shaders/src",
    forbiddenPackagePrefixes: ["@artex/core", "@artex/creator", "@artex/experiments", "@artex/shader-tools"],
    forbiddenResolvedPrefixes: ["packages/artex-core", "apps/creator", ".services"],
  },
  {
    scope: "packages/artex-extensions/src",
    forbiddenPackagePrefixes: ["@artex/core", "@artex/creator", "@artex/shaders", "@artex/experiments", "@artex/shader-tools"],
    forbiddenResolvedPrefixes: ["packages/artex-core", "apps/creator", ".services"],
  },
  {
    scope: "packages/artex-experiments/src",
    forbiddenPackagePrefixes: ["@artex/core", "@artex/creator"],
    forbiddenResolvedPrefixes: ["packages/artex-core", "apps/creator", ".services"],
  },
  {
    scope: "packages/artex-shader-tools/src",
    forbiddenPackagePrefixes: ["@artex/core", "@artex/creator"],
    forbiddenResolvedPrefixes: ["packages/artex-core", "apps/creator", ".services"],
  },
];

const SOURCE_FILE_PATTERN = /\.(ts|tsx)$/i;

const collectFiles = async (rootDir) => {
  let entries;
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;

    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
      continue;
    }

    if (SOURCE_FILE_PATTERN.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
};

const normalizeRelative = (targetPath) => path.relative(repoRoot, targetPath).replaceAll(path.sep, "/");

const readImports = (sourceText) => {
  const imports = [];
  let match;
  while ((match = importPattern.exec(sourceText)) !== null) {
    const specifier = match[1] ?? match[2];
    if (specifier) imports.push(specifier);
  }
  return imports;
};

const isForbiddenPackageImport = (specifier, forbiddenPackagePrefixes) => (
  forbiddenPackagePrefixes.some((prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`))
);

const resolvesIntoForbiddenPrefix = (filePath, specifier, forbiddenResolvedPrefixes, scopeRoot) => {
  if (!specifier.startsWith(".")) return null;

  const resolvedPath = path.resolve(path.dirname(filePath), specifier);
  const relativeResolvedPath = normalizeRelative(resolvedPath);
  const relativeScopeRoot = normalizeRelative(path.resolve(repoRoot, scopeRoot));

  if (!relativeResolvedPath.startsWith(relativeScopeRoot)) {
    return forbiddenResolvedPrefixes.find((prefix) => relativeResolvedPath.startsWith(prefix)) ?? "outside-scope";
  }

  return forbiddenResolvedPrefixes.find((prefix) => relativeResolvedPath.startsWith(prefix)) ?? null;
};

const main = async () => {
  const violations = [];

  for (const rule of RULES) {
    const scopePath = path.resolve(repoRoot, rule.scope);
    const files = await collectFiles(scopePath);

    for (const filePath of files) {
      // Skip test files for boundary checking
      if (filePath.endsWith(".test.ts") || filePath.endsWith(".spec.ts")) continue;

      const sourceText = await fs.readFile(filePath, "utf8");
      const imports = readImports(sourceText);

      for (const specifier of imports) {
        if (isForbiddenPackageImport(specifier, rule.forbiddenPackagePrefixes)) {
          violations.push(`${normalizeRelative(filePath)} imports forbidden package ${specifier}`);
          continue;
        }

        const forbiddenPrefix = resolvesIntoForbiddenPrefix(
          filePath, specifier, rule.forbiddenResolvedPrefixes, rule.scope,
        );

        if (forbiddenPrefix) {
          violations.push(
            `${normalizeRelative(filePath)} imports ${specifier}, which resolves into forbidden boundary ${forbiddenPrefix}`,
          );
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error("Workspace boundary violations detected:");
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Workspace boundaries look clean.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
