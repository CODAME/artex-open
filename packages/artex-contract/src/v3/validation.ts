/**
 * V3 Piece Config Validation — validates serialized piece configs
 * before they reach the runtime.
 */

import type { RendererHint } from "../types";
import type {
  BehaviourModelConfig,
  EvolutionKeyframe,
  EvolutionRuleConfig,
  GestureBindingConfig,
  InterpretationBoundary,
  MutationPolicy,
  ParticleEmitterConfig,
  ParticleRecipeConfig,
  PersonalityState,
  PieceConfigV3,
  RendererRequirements,
  SceneRecipeConfig,
  ShaderPassConfig,
  ShaderStackConfig,
} from "./types";

export class PieceConfigV3Error extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PieceConfigV3Error";
    this.code = code;
  }
}

const isFinite01 = (v: number): boolean => Number.isFinite(v) && v >= 0 && v <= 1;

// ---------------------------------------------------------------------------
// Renderer requirements
// ---------------------------------------------------------------------------

const VALID_SUBSYSTEMS = new Set(["shader", "three-scene", "particle", "audio-reactive"]);

export function validateRendererRequirements(r: RendererRequirements): void {
  if (!VALID_SUBSYSTEMS.has(r.primary)) {
    throw new PieceConfigV3Error("invalid_renderer", `Unknown primary subsystem "${r.primary}".`);
  }
  for (const s of r.secondary ?? []) {
    if (!VALID_SUBSYSTEMS.has(s)) {
      throw new PieceConfigV3Error("invalid_renderer", `Unknown secondary subsystem "${s}".`);
    }
  }
  if (r.secondary?.includes(r.primary)) {
    throw new PieceConfigV3Error("invalid_renderer", `Primary subsystem "${r.primary}" should not repeat in secondary.`);
  }
}

// ---------------------------------------------------------------------------
// Shader stack
// ---------------------------------------------------------------------------

export function validateShaderStack(stack: ShaderStackConfig): void {
  if (stack.passes.length === 0) {
    throw new PieceConfigV3Error("invalid_shader_stack", "Shader stack must have at least one pass.");
  }
  const ids = new Set<string>();
  for (const pass of stack.passes) {
    validateShaderPass(pass, ids);
  }
  if (stack.resolutionScale !== undefined && (stack.resolutionScale <= 0 || stack.resolutionScale > 4)) {
    throw new PieceConfigV3Error("invalid_shader_stack", "resolutionScale must be between 0 (exclusive) and 4.");
  }
}

function validateShaderPass(pass: ShaderPassConfig, seenIds: Set<string>): void {
  if (!pass.id.trim()) {
    throw new PieceConfigV3Error("invalid_shader_pass", "Shader pass must have a non-empty id.");
  }
  if (seenIds.has(pass.id)) {
    throw new PieceConfigV3Error("invalid_shader_pass", `Duplicate shader pass id "${pass.id}".`);
  }
  seenIds.add(pass.id);
  if (!pass.shaderId.trim()) {
    throw new PieceConfigV3Error("invalid_shader_pass", `Pass "${pass.id}" must reference a shader.`);
  }
}

// ---------------------------------------------------------------------------
// Evolution rules
// ---------------------------------------------------------------------------

export function validateEvolutionRules(rules: EvolutionRuleConfig[]): void {
  for (const rule of rules) {
    validateEvolutionRule(rule);
  }
}

function validateEvolutionRule(rule: EvolutionRuleConfig): void {
  if (!rule.param.trim()) {
    throw new PieceConfigV3Error("invalid_evolution_rule", "Evolution rule must target a parameter.");
  }
  if (!Number.isFinite(rule.cycleDurationHours) || rule.cycleDurationHours <= 0) {
    throw new PieceConfigV3Error("invalid_evolution_rule", `Rule for "${rule.param}" must have a positive cycle duration.`);
  }
  if (rule.keyframes.length < 2) {
    throw new PieceConfigV3Error("invalid_evolution_rule", `Rule for "${rule.param}" needs at least 2 keyframes.`);
  }
  validateKeyframeOrder(rule.keyframes, rule.param);
}

function validateKeyframeOrder(keyframes: EvolutionKeyframe[], param: string): void {
  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    if (typeof kf.at !== "number" || !Number.isFinite(kf.at) || kf.at < 0 || kf.at > 1) {
      throw new PieceConfigV3Error("invalid_evolution_rule", `Keyframe position must be 0–1 for "${param}".`);
    }
    if (typeof kf.value !== "number" || !Number.isFinite(kf.value)) {
      throw new PieceConfigV3Error("invalid_evolution_rule", `Keyframe value must be a finite number for "${param}".`);
    }
    if (i > 0 && kf.at <= keyframes[i - 1].at) {
      throw new PieceConfigV3Error("invalid_evolution_rule", `Keyframes must be in ascending order for "${param}".`);
    }
  }
}

// ---------------------------------------------------------------------------
// Mutation policy
// ---------------------------------------------------------------------------

export function validateMutationPolicy(policy: MutationPolicy): void {
  if (policy.minTransitionMs < 0) {
    throw new PieceConfigV3Error("invalid_mutation_policy", "minTransitionMs must be non-negative.");
  }
  for (const [param, delta] of Object.entries(policy.maxDelta)) {
    if (delta < 0) {
      throw new PieceConfigV3Error("invalid_mutation_policy", `maxDelta for "${param}" must be non-negative.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Behaviour model
// ---------------------------------------------------------------------------

export function validateBehaviourModel(model: BehaviourModelConfig): void {
  if (model.states.length === 0) {
    throw new PieceConfigV3Error("invalid_behaviour", "Behaviour model must define at least one state.");
  }
  const stateIds = new Set(model.states.map((s) => s.id));
  if (!stateIds.has(model.fallbackStateId)) {
    throw new PieceConfigV3Error("invalid_behaviour", `Fallback state "${model.fallbackStateId}" is not declared.`);
  }
  if (model.personality) {
    validatePersonalityState(model.personality.restingState);
    if (model.personality.decayRate < 0 || model.personality.decayRate > 1) {
      throw new PieceConfigV3Error("invalid_behaviour", "Personality decayRate must be 0–1.");
    }
  }
  if (model.boundaries) {
    for (const boundary of model.boundaries) {
      validateInterpretationBoundary(boundary);
    }
  }
}

function validatePersonalityState(state: PersonalityState): void {
  for (const [key, value] of Object.entries(state)) {
    if (typeof value !== "number" || !isFinite01(value)) {
      throw new PieceConfigV3Error("invalid_behaviour", `Personality dimension "${key}" must be 0–1.`);
    }
  }
}

function validateInterpretationBoundary(boundary: InterpretationBoundary): void {
  if (boundary.minConfidence !== undefined && !isFinite01(boundary.minConfidence)) {
    throw new PieceConfigV3Error("invalid_boundary", `minConfidence must be 0–1 for signal "${boundary.signal}".`);
  }
  if (boundary.valueFloor !== undefined && boundary.valueCeiling !== undefined) {
    if (boundary.valueFloor > boundary.valueCeiling) {
      throw new PieceConfigV3Error("invalid_boundary", `valueFloor exceeds valueCeiling for signal "${boundary.signal}".`);
    }
  }
  if (boundary.sustainMs !== undefined && boundary.sustainMs < 0) {
    throw new PieceConfigV3Error("invalid_boundary", `sustainMs must be non-negative for signal "${boundary.signal}".`);
  }
}

// ---------------------------------------------------------------------------
// Scene recipe
// ---------------------------------------------------------------------------

export function validateSceneRecipe(recipe: SceneRecipeConfig): void {
  const lightIds = new Set<string>();
  for (const light of recipe.lights) {
    if (!light.id.trim()) {
      throw new PieceConfigV3Error("invalid_scene_recipe", "Light must have a non-empty id.");
    }
    if (lightIds.has(light.id)) {
      throw new PieceConfigV3Error("invalid_scene_recipe", `Duplicate light id "${light.id}".`);
    }
    lightIds.add(light.id);
  }
  const meshIds = new Set<string>();
  for (const mesh of recipe.meshes) {
    if (!mesh.id.trim()) {
      throw new PieceConfigV3Error("invalid_scene_recipe", "Mesh must have a non-empty id.");
    }
    if (meshIds.has(mesh.id)) {
      throw new PieceConfigV3Error("invalid_scene_recipe", `Duplicate mesh id "${mesh.id}".`);
    }
    meshIds.add(mesh.id);
  }
}

// ---------------------------------------------------------------------------
// Particle recipe
// ---------------------------------------------------------------------------

export function validateParticleRecipe(recipe: ParticleRecipeConfig): void {
  if (recipe.maxParticles <= 0) {
    throw new PieceConfigV3Error("invalid_particle_recipe", "maxParticles must be positive.");
  }
  if (recipe.emitters.length === 0) {
    throw new PieceConfigV3Error("invalid_particle_recipe", "Particle recipe must have at least one emitter.");
  }
  const emitterIds = new Set<string>();
  for (const emitter of recipe.emitters) {
    validateParticleEmitter(emitter, emitterIds);
  }
}

function validateParticleEmitter(emitter: ParticleEmitterConfig, seenIds: Set<string>): void {
  if (!emitter.id.trim()) {
    throw new PieceConfigV3Error("invalid_particle_emitter", "Emitter must have a non-empty id.");
  }
  if (seenIds.has(emitter.id)) {
    throw new PieceConfigV3Error("invalid_particle_emitter", `Duplicate emitter id "${emitter.id}".`);
  }
  seenIds.add(emitter.id);
  if (emitter.shape === "mesh-vertex" && !emitter.meshId?.trim()) {
    throw new PieceConfigV3Error("invalid_particle_emitter", `Emitter "${emitter.id}" uses mesh-vertex shape but has no meshId.`);
  }
  if (emitter.rate < 0) {
    throw new PieceConfigV3Error("invalid_particle_emitter", `Emitter "${emitter.id}" rate must be non-negative.`);
  }
  if (emitter.lifetime.min < 0 || emitter.lifetime.max < emitter.lifetime.min) {
    throw new PieceConfigV3Error("invalid_particle_emitter", `Emitter "${emitter.id}" has invalid lifetime range.`);
  }
}

// ---------------------------------------------------------------------------
// Gesture bindings
// ---------------------------------------------------------------------------

export function validateGestureBindings(bindings: GestureBindingConfig[]): void {
  const ids = new Set<string>();
  for (const binding of bindings) {
    if (!binding.id.trim()) {
      throw new PieceConfigV3Error("invalid_gesture_binding", "Gesture binding must have a non-empty id.");
    }
    if (ids.has(binding.id)) {
      throw new PieceConfigV3Error("invalid_gesture_binding", `Duplicate gesture binding id "${binding.id}".`);
    }
    ids.add(binding.id);
    const [inMin, inMax] = binding.mapping.inputRange;
    if (inMin >= inMax) {
      throw new PieceConfigV3Error("invalid_gesture_binding", `Binding "${binding.id}" inputRange min must be less than max.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Top-level PieceConfigV3 validation
// ---------------------------------------------------------------------------

export function validatePieceConfigV3(config: PieceConfigV3): void {
  if (config.version !== 3) {
    throw new PieceConfigV3Error("unsupported_version", `Expected piece config version 3, received ${String(config.version)}.`);
  }
  if (!config.id.trim() || !config.title.trim()) {
    throw new PieceConfigV3Error("invalid_piece", "Piece id and title are required.");
  }
  validateRendererRequirements(config.renderer);
  if (config.shaderStack) validateShaderStack(config.shaderStack);
  if (config.evolutionRules) validateEvolutionRules(config.evolutionRules);
  if (config.mutationPolicy) validateMutationPolicy(config.mutationPolicy);
  if (config.behaviour) validateBehaviourModel(config.behaviour);
  if (config.sceneRecipe) validateSceneRecipe(config.sceneRecipe);
  if (config.particleRecipe) validateParticleRecipe(config.particleRecipe);
  if (config.gestureBindings) validateGestureBindings(config.gestureBindings);
}

// ---------------------------------------------------------------------------
// RendererRequirements → RendererHint bridge
// ---------------------------------------------------------------------------

const SUBSYSTEM_TO_HINT: Record<string, RendererHint> = {
  shader: "shader",
  "three-scene": "threejs",
  particle: "particle",
};

/** Maps V3 RendererRequirements to a V1/V2 RendererHint for the render-core layer. */
export function rendererRequirementsToHint(req: RendererRequirements): RendererHint {
  const all = new Set<string>([req.primary, ...(req.secondary ?? [])]);
  if (all.has("three-scene") && all.has("particle")) return "threejs+particle";
  return SUBSYSTEM_TO_HINT[req.primary] ?? "auto";
}
