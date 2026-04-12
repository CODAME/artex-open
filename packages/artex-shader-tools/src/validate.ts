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

  for (const u of ARTEX_UNIFORMS) {
    if (declared.has(u.name)) continue;
    // Check if used in non-comment, non-string context
    const useRe = new RegExp(`\\b${u.name}\\b`);
    // Strip single-line comments for usage check
    const stripped = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
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

// ---------------------------------------------------------------------------
// Capability detection (matches builtinShaderLibrary.ts logic)
// ---------------------------------------------------------------------------

const detectCapabilities = (source: string): DetectedCapabilities => {
  const lower = source.toLowerCase();
  const has = (tokens: string[]) => tokens.some((t) => lower.includes(t.toLowerCase()));
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
  ];

  const valid = !diagnostics.some((d) => d.severity === "error");
  const capabilities = detectCapabilities(source);

  return { valid, diagnostics, capabilities };
};
