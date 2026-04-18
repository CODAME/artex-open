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

/**
 * Which WebGL / GLSL-ES version the output should target.
 *  - `webgl1` (default): GLSL ES 1.0. Uses `texture2D()` and `gl_FragColor`.
 *  - `webgl2`:           GLSL ES 3.0. Emits `#version 300 es`, declares an
 *                        `out vec4 artexFragColor;`, and rewrites
 *                        `texture2D(` → `texture(` and `gl_FragColor` →
 *                        `artexFragColor`.
 */
export type ShaderTargetVersion = "webgl1" | "webgl2";

export interface ConvertShaderOptions {
  /** Source format. When "auto", the converter inspects the GLSL to guess. */
  format?: ShaderSourceFormat | "auto";
  /** Add `precision highp float;` if missing. Default true. */
  addPrecision?: boolean;
  /** Auto-declare referenced ARTEX uniforms that are missing. Default true. */
  declareUniforms?: boolean;
  /** Replace `texture()` with `texture2D()` for GLSL ES 1.0. Default true. */
  fixTextureCalls?: boolean;
  /** Target WebGL/GLSL-ES version. Default "webgl1". */
  targetVersion?: ShaderTargetVersion;
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
  /** Target WebGL/GLSL-ES version that was applied. */
  targetVersion: ShaderTargetVersion;
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

  const fragColorRe = new RegExp(`\\b${fragColorVar}\\b`, "g");
  converted = converted.replace(fragColorRe, "gl_FragColor");

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
  const declared = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = UNIFORM_DECL_RE.exec(source)) !== null) {
    declared.add(m[1]);
  }

  const toAdd: string[] = [];
  for (const u of ARTEX_UNIFORMS) {
    if (!declared.has(u.name) && UNIFORM_USE_RE(u.name).test(source)) {
      toAdd.push(`uniform ${u.type} ${u.name};`);
    }
  }

  if (toAdd.length === 0) return { source, added: [] };

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
// WebGL2 (GLSL ES 3.0) pass
// ---------------------------------------------------------------------------

const WEBGL2_OUT_VAR = "artexFragColor";

/**
 * Transform a GLSL ES 1.0 fragment shader into GLSL ES 3.0 form:
 *  - Prepend `#version 300 es` and a precision declaration.
 *  - Declare an `out vec4 artexFragColor;` at the top.
 *  - Rewrite `texture2D(` → `texture(`.
 *  - Rewrite `gl_FragColor` → `artexFragColor`.
 *  - Rewrite `varying` → `in` (fragment stage).
 */
const toWebGL2 = (source: string): string => {
  let result = source;
  // Drop any existing `#version ...` line so we can re-prepend a clean one.
  result = result.replace(/^#version[^\n]*\n?/, "");

  // Ensure we have a fragment-stage precision declaration.
  const hasPrecision = /precision\s+(lowp|mediump|highp)\s+float/.test(result);
  const precisionLine = hasPrecision ? "" : "precision highp float;\n";

  result = result.replace(/\btexture2D\s*\(/g, "texture(");
  result = result.replace(/\bgl_FragColor\b/g, WEBGL2_OUT_VAR);
  // `varying` in a fragment shader becomes `in` in ES 3.0.
  result = result.replace(/(^|\s)varying\s+/g, "$1in ");

  const header =
    `#version 300 es\n${precisionLine}out vec4 ${WEBGL2_OUT_VAR};\n\n`;
  return header + result;
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
    targetVersion = "webgl1",
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

  // 2. texture() → texture2D() (only for WebGL1 target)
  if (fixTextureCalls && targetVersion === "webgl1") {
    glsl = fixTexture(glsl);
  }

  // 3. Precision header (not needed for WebGL2 path — toWebGL2 adds its own)
  if (addPrecision && targetVersion === "webgl1") {
    glsl = ensurePrecision(glsl);
  }

  // 4. Auto-declare missing ARTEX uniforms
  let addedUniforms: string[] = [];
  if (declareUniforms) {
    const declResult = autoDeclareUniforms(glsl);
    glsl = declResult.source;
    addedUniforms = declResult.added;
  }

  // 5. Optional WebGL2 retarget
  if (targetVersion === "webgl2") {
    glsl = toWebGL2(glsl);
  }

  return { glsl, detectedFormat, warnings, addedUniforms, targetVersion };
};
