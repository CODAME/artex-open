/**
 * Convert shaders from Shadertoy, GLSL Sandbox, or raw GLSL into
 * ARTEX-compatible fragment shaders.
 */

import {
  ARTEX_UNIFORMS,
  SHADERTOY_MAIN_RE,
  SHADERTOY_UNIFORM_MAP,
  GLSL_SANDBOX_UNIFORM_MAP,
} from "./uniforms.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ShaderSourceFormat = "shadertoy" | "glsl-sandbox" | "raw";

export interface ConvertShaderOptions {
  /** Source format. When "auto", the converter inspects the GLSL to guess. */
  format?: ShaderSourceFormat | "auto";
  /** Add `precision highp float;` if missing. Default true. */
  addPrecision?: boolean;
  /** Auto-declare referenced ARTEX uniforms that are missing. Default true. */
  declareUniforms?: boolean;
  /** Replace `texture()` with `texture2D()` for GLSL ES 1.0. Default true. */
  fixTextureCalls?: boolean;
}

export interface ConvertShaderResult {
  /** The converted GLSL source. */
  glsl: string;
  /** The source format that was detected or specified. */
  detectedFormat: ShaderSourceFormat;
  /** Warnings produced during conversion. */
  warnings: string[];
  /** Uniforms that were auto-declared. */
  addedUniforms: string[];
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

const detectFormat = (source: string): ShaderSourceFormat => {
  if (SHADERTOY_MAIN_RE.test(source)) return "shadertoy";
  if (/uniform\s+float\s+time\b/.test(source) && /uniform\s+vec2\s+resolution\b/.test(source)) return "glsl-sandbox";
  return "raw";
};

// ---------------------------------------------------------------------------
// Conversion passes
// ---------------------------------------------------------------------------

const ensurePrecision = (source: string): string => {
  if (/precision\s+(lowp|mediump|highp)\s+float/.test(source)) return source;
  return `precision highp float;\n\n${source}`;
};

const rewriteShadertoyMain = (source: string): { source: string; warnings: string[] } => {
  const match = source.match(SHADERTOY_MAIN_RE);
  if (!match) return { source, warnings: [] };

  const fragColorVar = match[1];
  const fragCoordVar = match[2];

  let converted = source.replace(SHADERTOY_MAIN_RE, "void main()");

  // Replace the user's fragColor variable with gl_FragColor
  const fragColorRe = new RegExp(`\\b${fragColorVar}\\b`, "g");
  converted = converted.replace(fragColorRe, "gl_FragColor");

  // Replace the user's fragCoord variable with gl_FragCoord.xy
  const fragCoordRe = new RegExp(`\\b${fragCoordVar}\\b`, "g");
  converted = converted.replace(fragCoordRe, "gl_FragCoord.xy");

  return { source: converted, warnings: [] };
};

const remapUniforms = (source: string, map: Record<string, string>): { source: string; warnings: string[] } => {
  const warnings: string[] = [];
  let result = source;

  for (const [foreign, artex] of Object.entries(map)) {
    const re = new RegExp(`\\b${foreign}\\b`, "g");
    if (re.test(result)) {
      // Handle iResolution vec3→vec2 narrowing
      if (foreign === "iResolution") {
        result = result.replace(/\biResolution\.xy\b/g, "uResolution");
        result = result.replace(/\biResolution\b/g, "uResolution");
        if (/uResolution\.z/.test(result)) {
          warnings.push("iResolution.z (pixel aspect ratio) has no ARTEX equivalent — defaulting to 1.0");
          result = result.replace(/uResolution\.z/g, "1.0");
        }
      } else {
        result = result.replace(re, artex);
      }
    }
  }

  return { source: result, warnings };
};

const fixTexture = (source: string): string =>
  source.replace(/\btexture\s*\(/g, "texture2D(");

const UNIFORM_DECL_RE = /uniform\s+\w+\s+(\w+)\s*;/g;
const UNIFORM_USE_RE = (name: string) => new RegExp(`\\b${name}\\b`);

const autoDeclareUniforms = (source: string): { source: string; added: string[] } => {
  // Collect already-declared uniforms
  const declared = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = UNIFORM_DECL_RE.exec(source)) !== null) {
    declared.add(m[1]);
  }

  // Find ARTEX uniforms used but not declared
  const toAdd: string[] = [];
  for (const u of ARTEX_UNIFORMS) {
    if (!declared.has(u.name) && UNIFORM_USE_RE(u.name).test(source)) {
      toAdd.push(`uniform ${u.type} ${u.name};`);
    }
  }

  if (toAdd.length === 0) return { source, added: [] };

  // Insert after precision or at top
  const precisionMatch = source.match(/precision\s+\w+\s+float\s*;\n*/);
  if (precisionMatch) {
    const insertPos = (precisionMatch.index ?? 0) + precisionMatch[0].length;
    const before = source.slice(0, insertPos);
    const after = source.slice(insertPos);
    return {
      source: `${before}\n// ARTEX uniforms (auto-declared)\n${toAdd.join("\n")}\n\n${after}`,
      added: toAdd,
    };
  }

  return {
    source: `// ARTEX uniforms (auto-declared)\n${toAdd.join("\n")}\n\n${source}`,
    added: toAdd,
  };
};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export const convertShader = (
  source: string,
  options: ConvertShaderOptions = {},
): ConvertShaderResult => {
  const {
    format = "auto",
    addPrecision = true,
    declareUniforms = true,
    fixTextureCalls = true,
  } = options;

  const detectedFormat = format === "auto" ? detectFormat(source) : format;
  const warnings: string[] = [];
  let glsl = source;

  // 1. Format-specific rewrites
  if (detectedFormat === "shadertoy") {
    const mainResult = rewriteShadertoyMain(glsl);
    glsl = mainResult.source;
    warnings.push(...mainResult.warnings);

    const uniformResult = remapUniforms(glsl, SHADERTOY_UNIFORM_MAP);
    glsl = uniformResult.source;
    warnings.push(...uniformResult.warnings);
  } else if (detectedFormat === "glsl-sandbox") {
    const uniformResult = remapUniforms(glsl, GLSL_SANDBOX_UNIFORM_MAP);
    glsl = uniformResult.source;
    warnings.push(...uniformResult.warnings);
  }

  // 2. texture() → texture2D()
  if (fixTextureCalls) {
    glsl = fixTexture(glsl);
  }

  // 3. Precision header
  if (addPrecision) {
    glsl = ensurePrecision(glsl);
  }

  // 4. Auto-declare missing ARTEX uniforms
  let addedUniforms: string[] = [];
  if (declareUniforms) {
    const declResult = autoDeclareUniforms(glsl);
    glsl = declResult.source;
    addedUniforms = declResult.added;
  }

  return { glsl, detectedFormat, warnings, addedUniforms };
};
