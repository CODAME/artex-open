/**
 * Validate GLSL source for ARTEX compatibility.
 *
 * This performs static analysis (no GPU needed) to catch common issues
 * before a shader reaches the runtime.
 */

import { ARTEX_UNIFORMS, isArtexUniform } from "./uniforms.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface ShaderDiagnostic {
  severity: DiagnosticSeverity;
  message: string;
  /** 1-based line number, if applicable. */
  line?: number;
}

export interface ValidateShaderResult {
  valid: boolean;
  diagnostics: ShaderDiagnostic[];
  /** Capabilities detected from uniform usage. */
  capabilities: DetectedCapabilities;
}

export interface DetectedCapabilities {
  usesAudio: boolean;
  usesCamera: boolean;
  usesProximity: boolean;
  usesChannels: boolean;
  usesFlow: boolean;
  usesStates: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const lines = (source: string): string[] => source.split("\n");

const findLine = (source: string, pattern: RegExp): number | undefined => {
  const idx = lines(source).findIndex((l) => pattern.test(l));
  return idx >= 0 ? idx + 1 : undefined;
};

/**
 * Strip single-line (`//`) and block (`/* * /`) comments without changing
 * line numbers, so regex scans run on executable GLSL only.
 */
export const stripComments = (source: string): string => {
  // Replace block comments with whitespace that preserves newline count.
  const noBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    return match.replace(/[^\n]/g, " ");
  });
  // Strip line comments (keep the trailing newline).
  return noBlocks.replace(/\/\/[^\n]*/g, "");
};

const UNIFORM_DECL_RE = /uniform\s+(\w+)\s+(\w+)\s*;/g;

const collectDeclaredUniforms = (source: string): Map<string, string> => {
  const map = new Map<string, string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(UNIFORM_DECL_RE.source, "g");
  while ((m = re.exec(source)) !== null) {
    map.set(m[2], m[1]);
  }
  return map;
};

// ---------------------------------------------------------------------------
// Validation checks
// ---------------------------------------------------------------------------

const checkEntryPoint = (source: string): ShaderDiagnostic[] => {
  if (/void\s+main\s*\(/.test(source)) return [];
  return [{
    severity: "error",
    message: "Missing `void main()` entry point.",
    line: findLine(source, /void\s+mainImage/),
  }];
};

const checkFragColor = (source: string): ShaderDiagnostic[] => {
  if (/gl_FragColor\s*=/.test(source)) return [];
  return [{
    severity: "error",
    message: "Shader never assigns to `gl_FragColor`. Output will be undefined.",
  }];
};

const checkPrecision = (source: string): ShaderDiagnostic[] => {
  if (/precision\s+(lowp|mediump|highp)\s+float/.test(source)) return [];
  return [{
    severity: "warning",
    message: "Missing `precision` declaration. Consider adding `precision highp float;` at the top.",
    line: 1,
  }];
};

const checkShadertoyRemnants = (source: string): ShaderDiagnostic[] => {
  const diags: ShaderDiagnostic[] = [];
  const remnants = [
    { pattern: /\biTime\b/, name: "iTime", replacement: "uTime" },
    { pattern: /\biResolution\b/, name: "iResolution", replacement: "uResolution" },
    { pattern: /\biGlobalTime\b/, name: "iGlobalTime", replacement: "uTime" },
    { pattern: /\bmainImage\s*\(/, name: "mainImage()", replacement: "void main()" },
  ];
  for (const r of remnants) {
    if (r.pattern.test(source)) {
      diags.push({
        severity: "warning",
        message: `Found Shadertoy-style \`${r.name}\` — use \`${r.replacement}\` for ARTEX.`,
        line: findLine(source, r.pattern),
      });
    }
  }
  return diags;
};

const checkUniformTypes = (source: string): ShaderDiagnostic[] => {
  const declared = collectDeclaredUniforms(source);
  const diags: ShaderDiagnostic[] = [];

  for (const [name, declaredType] of declared) {
    if (!isArtexUniform(name)) continue;
    const expected = ARTEX_UNIFORMS.find((u) => u.name === name);
    if (expected && expected.type !== declaredType) {
      diags.push({
        severity: "error",
        message: `Uniform \`${name}\` declared as \`${declaredType}\` but ARTEX expects \`${expected.type}\`.`,
        line: findLine(source, new RegExp(`uniform\\s+${declaredType}\\s+${name}`)),
      });
    }
  }

  return diags;
};

const checkUsedButUndeclared = (source: string): ShaderDiagnostic[] => {
  const declared = collectDeclaredUniforms(source);
  const diags: ShaderDiagnostic[] = [];
  const stripped = stripComments(source);

  for (const u of ARTEX_UNIFORMS) {
    if (declared.has(u.name)) continue;
    const useRe = new RegExp(`\\b${u.name}\\b`);
    if (useRe.test(stripped)) {
      diags.push({
        severity: "warning",
        message: `Uniform \`${u.name}\` is used but not declared. Add: \`uniform ${u.type} ${u.name};\``,
        line: findLine(source, useRe),
      });
    }
  }

  return diags;
};

/**
 * Warn if the shader divides by `uResolution` without first clamping it to a
 * non-zero minimum. A zero canvas (e.g. before the first resize) otherwise
 * produces NaN/Inf UVs that poison every texture lookup.
 *
 * Accepted patterns (any one of these silences the check):
 *   - `max(uResolution, vec2(1.0))`
 *   - `artex_safeResolution()`
 *   - `max(uResolution.xy, vec2(1.0))`
 */
const checkResolutionGuard = (source: string): ShaderDiagnostic[] => {
  const stripped = stripComments(source);
  const dividesByResolution = /\/\s*uResolution\b/.test(stripped);
  if (!dividesByResolution) return [];

  const hasGuard =
    /\bmax\s*\(\s*uResolution(\.x?y?)?\s*,/.test(stripped) ||
    /\bartex_safeResolution\s*\(/.test(stripped);
  if (hasGuard) return [];

  return [{
    severity: "warning",
    message:
      "Dividing by `uResolution` without a zero-guard. Use " +
      "`vec2 res = max(uResolution, vec2(1.0));` (or `artex_safeResolution()`) " +
      "and divide by `res` to avoid NaN/Inf on a 0×0 canvas.",
    line: findLine(source, /\/\s*uResolution\b/),
  }];
};

const FUNCTION_SIG_RE = /\b(?:[a-zA-Z_][\w]*\s+){1,3}([a-zA-Z_]\w*)\s*\([^)]*\)\s*\{/g;

/**
 * Warn when a function body contains more than `UNIFORM_IF_LIMIT` sequential
 * `if`/`else if` branches whose condition reads a uniform (identifier starting
 * with a lowercase `u` followed by an uppercase letter, e.g. `uStateCount`).
 *
 * Tile-based mobile GPUs serialise divergent branching on uniforms, so deep
 * chains cause noticeable perf cliffs on the low tier.
 */
const UNIFORM_IF_LIMIT = 3;

const checkDeepBranching = (source: string): ShaderDiagnostic[] => {
  const stripped = stripComments(source);
  const diags: ShaderDiagnostic[] = [];
  const seen = new Set<string>();

  const re = new RegExp(FUNCTION_SIG_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    const fnName = m[1];
    if (fnName === "if" || fnName === "while" || fnName === "for" || fnName === "return") continue;
    if (seen.has(fnName)) continue;
    seen.add(fnName);

    const bodyStart = m.index + m[0].length;
    let depth = 1;
    let i = bodyStart;
    while (i < stripped.length && depth > 0) {
      const ch = stripped[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    if (depth !== 0) continue;
    const body = stripped.slice(bodyStart, i - 1);

    const uniformIfCount = (body.match(/\bif\s*\(\s*u[A-Z]\w*/g) ?? []).length;
    if (uniformIfCount > UNIFORM_IF_LIMIT) {
      diags.push({
        severity: "info",
        message:
          `Function \`${fnName}\` branches on uniforms ${uniformIfCount} times ` +
          `(>${UNIFORM_IF_LIMIT}). On tile-based mobile GPUs this can serialise ` +
          "and hurt fill-rate. Consider a lookup-table, `step()`/`mix()`, or a " +
          "small helper indexed by a single uniform.",
        line: findLine(source, new RegExp(`\\b${fnName}\\s*\\(`)),
      });
    }
  }

  return diags;
};

// ---------------------------------------------------------------------------
// Capability detection (matches builtinShaderLibrary.ts logic)
// ---------------------------------------------------------------------------

const detectCapabilities = (source: string): DetectedCapabilities => {
  const stripped = stripComments(source).toLowerCase();
  const has = (tokens: string[]) => tokens.some((t) => stripped.includes(t.toLowerCase()));
  return {
    usesAudio:    has(["uAudioLevel", "uBassLevel"]),
    usesCamera:   has(["uCameraLevel"]),
    usesProximity: has(["uProximity"]),
    usesChannels: has(["iChannel0", "iChannel1", "iChannel2", "iChannel3", "uMask", "uState1", "uState2"]),
    usesFlow:     has(["uFlowEnabled", "uFlowIntensity", "uFlowSpeed", "uFlowScale"]),
    usesStates:   has(["uUseStateBlending", "uStateA", "uStateB", "uStateC", "uStateD"]),
  };
};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export const validateShader = (source: string): ValidateShaderResult => {
  const diagnostics: ShaderDiagnostic[] = [
    ...checkEntryPoint(source),
    ...checkFragColor(source),
    ...checkPrecision(source),
    ...checkShadertoyRemnants(source),
    ...checkUniformTypes(source),
    ...checkUsedButUndeclared(source),
    ...checkResolutionGuard(source),
    ...checkDeepBranching(source),
  ];

  const valid = !diagnostics.some((d) => d.severity === "error");
  const capabilities = detectCapabilities(source);

  return { valid, diagnostics, capabilities };
};
