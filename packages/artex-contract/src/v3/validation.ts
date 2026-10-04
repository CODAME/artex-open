/**
 * V3 Piece Config Validation — validates serialized piece configs
 * before they reach the runtime.
 */

import type { RendererHint } from "../types";
import { MAX_FRAME_BUFFER_CAPTURES, RENDERER_SUBSYSTEMS } from "./types";
import type {
  BehaviourModelConfig,
  ContextInputsConfig,
  EvolutionKeyframe,
  EvolutionRuleConfig,
  FlowFieldSimConfig,
  FractureBlockConfig,
  FrameBufferAdapterConfig,
  GestureBindingConfig,
  HtmlBlockConfig,
  InterpretationBoundary,
  MutationPolicy,
  ParticleEmitterConfig,
  ParticleRecipeConfig,
  PersonalityState,
  PieceConfig,
  PluginBlockConfig,
  RendererRequirements,
  SceneRecipeConfig,
  ShaderParamBinding,
  ShaderPassConfig,
  ShaderStackConfig,
  SketchBlockConfig,
  Block,
  WorldSignalsRecipeConfig,
} from "./types";

export class PieceConfigError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PieceConfigError";
    this.code = code;
  }
}

const isFinite01 = (v: number): boolean => Number.isFinite(v) && v >= 0 && v <= 1;

// ---------------------------------------------------------------------------
// Renderer requirements
// ---------------------------------------------------------------------------

// Derived from the union's own array, never restated. Keeping a second copy
// here is what let `p5js` and `webgpu-scene` typecheck and then throw
// `invalid_renderer`, which silently stopped a published WebGPU scene from
// rendering at all (#3622 — the full chain is on RENDERER_SUBSYSTEMS).
const VALID_SUBSYSTEMS: ReadonlySet<string> = new Set(RENDERER_SUBSYSTEMS);

export function validateRendererRequirements(r: RendererRequirements): void {
  if (!VALID_SUBSYSTEMS.has(r.primary)) {
    throw new PieceConfigError("invalid_renderer", `Unknown primary subsystem "${r.primary}".`);
  }
  for (const s of r.secondary ?? []) {
    if (!VALID_SUBSYSTEMS.has(s)) {
      throw new PieceConfigError("invalid_renderer", `Unknown secondary subsystem "${s}".`);
    }
  }
  if (r.secondary?.includes(r.primary)) {
    throw new PieceConfigError("invalid_renderer", `Primary subsystem "${r.primary}" should not repeat in secondary.`);
  }
}

// ---------------------------------------------------------------------------
// Shader stack
// ---------------------------------------------------------------------------

export function validateShaderStack(stack: ShaderStackConfig): void {
  if (stack.passes.length === 0) {
    throw new PieceConfigError("invalid_shader_stack", "Shader stack must have at least one pass.");
  }
  const ids = new Set<string>();
  for (const pass of stack.passes) {
    validateShaderPass(pass, ids);
  }
  if (stack.resolutionScale !== undefined && (stack.resolutionScale <= 0 || stack.resolutionScale > 4)) {
    throw new PieceConfigError("invalid_shader_stack", "resolutionScale must be between 0 (exclusive) and 4.");
  }
  if (stack.bindings) validateShaderParamBindings(stack.bindings);
}

// ---------------------------------------------------------------------------
// Shader param bindings (COD-61)
// ---------------------------------------------------------------------------

export function validateShaderParamBindings(bindings: ShaderParamBinding[]): void {
  const ids = new Set<string>();
  for (const binding of bindings) {
    validateShaderParamBinding(binding, ids);
  }
}

function validateShaderParamBinding(binding: ShaderParamBinding, seenIds: Set<string>): void {
  if (!binding.id.trim()) {
    throw new PieceConfigError("invalid_shader_binding", "Shader param binding must have a non-empty id.");
  }
  if (seenIds.has(binding.id)) {
    throw new PieceConfigError("invalid_shader_binding", `Duplicate shader param binding id "${binding.id}".`);
  }
  seenIds.add(binding.id);

  if (!binding.uniform.trim()) {
    throw new PieceConfigError("invalid_shader_binding", `Binding "${binding.id}" must target a non-empty uniform name.`);
  }

  if (!Number.isFinite(binding.ceiling) || binding.ceiling <= 0) {
    throw new PieceConfigError("invalid_shader_binding", `Binding "${binding.id}" ceiling must be a positive finite number.`);
  }

  // Floor may be negative: signals like time.sunriseOffset range over [-1, 1],
  // so a binding mapping that range needs floor = -1. The only constraints are
  // that it is finite and below the ceiling (the executor normalises over
  // [floor, ceiling]).
  const floor = binding.floor ?? 0;
  if (!Number.isFinite(floor)) {
    throw new PieceConfigError("invalid_shader_binding", `Binding "${binding.id}" floor must be a finite number.`);
  }
  if (floor >= binding.ceiling) {
    throw new PieceConfigError("invalid_shader_binding", `Binding "${binding.id}" floor must be less than ceiling.`);
  }

  if (binding.outputRange !== undefined) {
    const [outMin, outMax] = binding.outputRange;
    if (!Number.isFinite(outMin) || !Number.isFinite(outMax) || outMin >= outMax) {
      throw new PieceConfigError("invalid_shader_binding", `Binding "${binding.id}" outputRange min must be less than max.`);
    }
  }

  if (binding.smoothing !== undefined && (binding.smoothing < 0 || binding.smoothing > 1)) {
    throw new PieceConfigError("invalid_shader_binding", `Binding "${binding.id}" smoothing must be 0–1.`);
  }
}

function validateShaderPass(pass: ShaderPassConfig, seenIds: Set<string>): void {
  if (!pass.id.trim()) {
    throw new PieceConfigError("invalid_shader_pass", "Shader pass must have a non-empty id.");
  }
  if (seenIds.has(pass.id)) {
    throw new PieceConfigError("invalid_shader_pass", `Duplicate shader pass id "${pass.id}".`);
  }
  seenIds.add(pass.id);
  if (!pass.shaderId.trim()) {
    throw new PieceConfigError("invalid_shader_pass", `Pass "${pass.id}" must reference a shader.`);
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
    throw new PieceConfigError("invalid_evolution_rule", "Evolution rule must target a parameter.");
  }
  if (!Number.isFinite(rule.cycleDurationHours) || rule.cycleDurationHours <= 0) {
    throw new PieceConfigError("invalid_evolution_rule", `Rule for "${rule.param}" must have a positive cycle duration.`);
  }
  if (rule.keyframes.length < 2) {
    throw new PieceConfigError("invalid_evolution_rule", `Rule for "${rule.param}" needs at least 2 keyframes.`);
  }
  validateKeyframeOrder(rule.keyframes, rule.param);
}

function validateKeyframeOrder(keyframes: EvolutionKeyframe[], param: string): void {
  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    if (typeof kf.at !== "number" || !Number.isFinite(kf.at) || kf.at < 0 || kf.at > 1) {
      throw new PieceConfigError("invalid_evolution_rule", `Keyframe position must be 0–1 for "${param}".`);
    }
    if (typeof kf.value !== "number" || !Number.isFinite(kf.value)) {
      throw new PieceConfigError("invalid_evolution_rule", `Keyframe value must be a finite number for "${param}".`);
    }
    if (i > 0 && kf.at <= keyframes[i - 1].at) {
      throw new PieceConfigError("invalid_evolution_rule", `Keyframes must be in ascending order for "${param}".`);
    }
  }
}

// ---------------------------------------------------------------------------
// Mutation policy
// ---------------------------------------------------------------------------

export function validateMutationPolicy(policy: MutationPolicy): void {
  if (policy.minTransitionMs < 0) {
    throw new PieceConfigError("invalid_mutation_policy", "minTransitionMs must be non-negative.");
  }
  for (const [param, delta] of Object.entries(policy.maxDelta)) {
    if (delta < 0) {
      throw new PieceConfigError("invalid_mutation_policy", `maxDelta for "${param}" must be non-negative.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Behaviour model
// ---------------------------------------------------------------------------

export function validateBehaviourModel(model: BehaviourModelConfig): void {
  if (model.states.length === 0) {
    throw new PieceConfigError("invalid_behaviour", "Behaviour model must define at least one state.");
  }
  const stateIds = new Set(model.states.map((s) => s.id));
  if (!stateIds.has(model.fallbackStateId)) {
    throw new PieceConfigError("invalid_behaviour", `Fallback state "${model.fallbackStateId}" is not declared.`);
  }
  if (model.personality) {
    validatePersonalityState(model.personality.restingState);
    if (model.personality.decayRate < 0 || model.personality.decayRate > 1) {
      throw new PieceConfigError("invalid_behaviour", "Personality decayRate must be 0–1.");
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
      throw new PieceConfigError("invalid_behaviour", `Personality dimension "${key}" must be 0–1.`);
    }
  }
}

function validateInterpretationBoundary(boundary: InterpretationBoundary): void {
  if (boundary.minConfidence !== undefined && !isFinite01(boundary.minConfidence)) {
    throw new PieceConfigError("invalid_boundary", `minConfidence must be 0–1 for signal "${boundary.signal}".`);
  }
  if (boundary.valueFloor !== undefined && boundary.valueCeiling !== undefined) {
    if (boundary.valueFloor > boundary.valueCeiling) {
      throw new PieceConfigError("invalid_boundary", `valueFloor exceeds valueCeiling for signal "${boundary.signal}".`);
    }
  }
  if (boundary.sustainMs !== undefined && boundary.sustainMs < 0) {
    throw new PieceConfigError("invalid_boundary", `sustainMs must be non-negative for signal "${boundary.signal}".`);
  }
}

// ---------------------------------------------------------------------------
// Scene recipe
// ---------------------------------------------------------------------------

export function validateSceneRecipe(recipe: SceneRecipeConfig): void {
  const lightIds = new Set<string>();
  for (const light of recipe.lights) {
    if (!light.id.trim()) {
      throw new PieceConfigError("invalid_scene_recipe", "Light must have a non-empty id.");
    }
    if (lightIds.has(light.id)) {
      throw new PieceConfigError("invalid_scene_recipe", `Duplicate light id "${light.id}".`);
    }
    lightIds.add(light.id);
  }
  const meshIds = new Set<string>();
  for (const mesh of recipe.meshes) {
    if (!mesh.id.trim()) {
      throw new PieceConfigError("invalid_scene_recipe", "Mesh must have a non-empty id.");
    }
    if (meshIds.has(mesh.id)) {
      throw new PieceConfigError("invalid_scene_recipe", `Duplicate mesh id "${mesh.id}".`);
    }
    meshIds.add(mesh.id);

    // Geometry references must carry enough to resolve at runtime.
    const geometry = mesh.geometry;
    if (geometry.kind === "asset" && !geometry.assetId?.trim() && !geometry.url?.trim()) {
      throw new PieceConfigError(
        "invalid_scene_recipe",
        `Mesh "${mesh.id}" uses asset geometry but has neither an assetId nor a url.`,
      );
    }
    if (geometry.kind === "procedural" && !geometry.generator?.trim()) {
      throw new PieceConfigError(
        "invalid_scene_recipe",
        `Mesh "${mesh.id}" uses procedural geometry but has no generator id.`,
      );
    }
  }

  // Scene param bindings (COD-124): same numeric envelope as shader bindings,
  // plus each target must reference a mesh declared above.
  const bindingIds = new Set<string>();
  for (const binding of recipe.bindings ?? []) {
    if (!binding.id.trim()) {
      throw new PieceConfigError("invalid_scene_recipe", "Scene param binding must have a non-empty id.");
    }
    if (bindingIds.has(binding.id)) {
      throw new PieceConfigError("invalid_scene_recipe", `Duplicate scene param binding id "${binding.id}".`);
    }
    bindingIds.add(binding.id);

    if (!binding.target.meshId.trim() || !meshIds.has(binding.target.meshId)) {
      throw new PieceConfigError(
        "invalid_scene_recipe",
        `Scene binding "${binding.id}" targets unknown mesh "${binding.target.meshId}".`,
      );
    }
    if (!Number.isFinite(binding.ceiling) || binding.ceiling <= 0) {
      throw new PieceConfigError("invalid_scene_recipe", `Scene binding "${binding.id}" ceiling must be a positive finite number.`);
    }
    const floor = binding.floor ?? 0;
    if (!Number.isFinite(floor)) {
      throw new PieceConfigError("invalid_scene_recipe", `Scene binding "${binding.id}" floor must be a finite number.`);
    }
    if (floor >= binding.ceiling) {
      throw new PieceConfigError("invalid_scene_recipe", `Scene binding "${binding.id}" floor must be less than ceiling.`);
    }
    if (binding.outputRange !== undefined) {
      const [outMin, outMax] = binding.outputRange;
      if (!Number.isFinite(outMin) || !Number.isFinite(outMax) || outMin === outMax) {
        throw new PieceConfigError("invalid_scene_recipe", `Scene binding "${binding.id}" outputRange min and max must be finite and differ.`);
      }
    }
    if (binding.smoothing !== undefined && (binding.smoothing < 0 || binding.smoothing > 1)) {
      throw new PieceConfigError("invalid_scene_recipe", `Scene binding "${binding.id}" smoothing must be 0–1.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Particle recipe
// ---------------------------------------------------------------------------

export function validateParticleRecipe(recipe: ParticleRecipeConfig): void {
  if (recipe.maxParticles <= 0) {
    throw new PieceConfigError("invalid_particle_recipe", "maxParticles must be positive.");
  }
  // Flow-field mode seeds particles from a source asset, not emitters — so an
  // empty emitter list is valid here. Outside flow-field mode the CPU sim needs
  // at least one emitter to produce anything.
  if (recipe.flowField) {
    validateFlowFieldSim(recipe.flowField);
  } else if (recipe.emitters.length === 0) {
    throw new PieceConfigError("invalid_particle_recipe", "Particle recipe must have at least one emitter.");
  }
  const emitterIds = new Set<string>();
  for (const emitter of recipe.emitters) {
    validateParticleEmitter(emitter, emitterIds);
  }
}

function validateFlowFieldSim(sim: FlowFieldSimConfig): void {
  // An empty sourceAssetId is allowed (the block is mid-authoring and simply
  // renders nothing), mirroring how a scene block tolerates zero meshes. The
  // numeric params, however, must stay in their valid ranges.
  if (sim.influence < 0 || sim.influence > 1) {
    throw new PieceConfigError("invalid_particle_recipe", "Flow-field influence must be within 0..1.");
  }
  if (sim.strength < 0) {
    throw new PieceConfigError("invalid_particle_recipe", "Flow-field strength must be non-negative.");
  }
  if (sim.frequency <= 0) {
    throw new PieceConfigError("invalid_particle_recipe", "Flow-field frequency must be positive.");
  }
  if (sim.pointSize <= 0) {
    throw new PieceConfigError("invalid_particle_recipe", "Flow-field pointSize must be positive.");
  }
  if (sim.decay <= 0) {
    throw new PieceConfigError("invalid_particle_recipe", "Flow-field decay must be positive.");
  }
}

function validateParticleEmitter(emitter: ParticleEmitterConfig, seenIds: Set<string>): void {
  if (!emitter.id.trim()) {
    throw new PieceConfigError("invalid_particle_emitter", "Emitter must have a non-empty id.");
  }
  if (seenIds.has(emitter.id)) {
    throw new PieceConfigError("invalid_particle_emitter", `Duplicate emitter id "${emitter.id}".`);
  }
  seenIds.add(emitter.id);
  if (emitter.shape === "mesh-vertex" && !emitter.meshId?.trim()) {
    throw new PieceConfigError("invalid_particle_emitter", `Emitter "${emitter.id}" uses mesh-vertex shape but has no meshId.`);
  }
  if (emitter.rate < 0) {
    throw new PieceConfigError("invalid_particle_emitter", `Emitter "${emitter.id}" rate must be non-negative.`);
  }
  if (emitter.lifetime.min < 0 || emitter.lifetime.max < emitter.lifetime.min) {
    throw new PieceConfigError("invalid_particle_emitter", `Emitter "${emitter.id}" has invalid lifetime range.`);
  }
}

// ---------------------------------------------------------------------------
// Gesture bindings
// ---------------------------------------------------------------------------

export function validateGestureBindings(bindings: GestureBindingConfig[]): void {
  const ids = new Set<string>();
  for (const binding of bindings) {
    if (!binding.id.trim()) {
      throw new PieceConfigError("invalid_gesture_binding", "Gesture binding must have a non-empty id.");
    }
    if (ids.has(binding.id)) {
      throw new PieceConfigError("invalid_gesture_binding", `Duplicate gesture binding id "${binding.id}".`);
    }
    ids.add(binding.id);
    const [inMin, inMax] = binding.mapping.inputRange;
    if (inMin >= inMax) {
      throw new PieceConfigError("invalid_gesture_binding", `Binding "${binding.id}" inputRange min must be less than max.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Sketch block (C.3.1)
// ---------------------------------------------------------------------------

export function validateSketchBlock(config: SketchBlockConfig): void {
  switch (config.source.kind) {
    case "inline":
      if (!config.source.code.trim()) {
        throw new PieceConfigError("invalid_sketch_block", "Inline sketch source must have non-empty code.");
      }
      break;
    case "asset":
      if (!config.source.assetId.trim()) {
        throw new PieceConfigError("invalid_sketch_block", "Asset sketch source must reference a non-empty assetId.");
      }
      break;
    default: {
      const exhaustiveCheck: never = config.source;
      throw new PieceConfigError(
        "invalid_sketch_block",
        `Unknown sketch source kind: ${(exhaustiveCheck as { kind: string }).kind}`,
      );
    }
  }
  for (const [name, spec] of Object.entries(config.exposedParams ?? {})) {
    if (!Number.isFinite(spec.default)) {
      throw new PieceConfigError("invalid_sketch_block", `Sketch param "${name}" default must be a finite number.`);
    }
    if (spec.range) {
      const [min, max] = spec.range;
      if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
        throw new PieceConfigError("invalid_sketch_block", `Sketch param "${name}" range min must be less than max.`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// HTML block (C.3.1)
// ---------------------------------------------------------------------------

/**
 * A url-source html block embeds a third-party page in an iframe on every
 * surface that plays the piece (Studio preview, runtime, Displays). Restrict
 * saved URLs to https so a piece can never point players at a plaintext or
 * non-web scheme (javascript:, file:, data:), and reject embedded
 * credentials. Plain http is allowed for loopback hosts only, so an artist
 * can develop an embed page locally before it is hosted.
 */
function assertEmbeddableHtmlUrl(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new PieceConfigError("invalid_html_block", "URL HTML source must be a valid absolute URL.");
  }
  const isLoopback =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopback)) {
    throw new PieceConfigError(
      "invalid_html_block",
      "URL HTML source must use https (plain http is allowed for localhost only).",
    );
  }
  if (parsed.username || parsed.password) {
    throw new PieceConfigError("invalid_html_block", "URL HTML source must not embed credentials.");
  }
}

export function validateHtmlBlock(config: HtmlBlockConfig): void {
  switch (config.source.kind) {
    case "url":
      if (!config.source.url.trim()) {
        throw new PieceConfigError("invalid_html_block", "URL HTML source must have a non-empty url.");
      }
      assertEmbeddableHtmlUrl(config.source.url.trim());
      break;
    case "inline":
      if (!config.source.html.trim()) {
        throw new PieceConfigError("invalid_html_block", "Inline HTML source must have non-empty html.");
      }
      break;
    default: {
      const exhaustiveCheck: never = config.source;
      throw new PieceConfigError(
        "invalid_html_block",
        `Unknown HTML source kind: ${(exhaustiveCheck as { kind: string }).kind}`,
      );
    }
  }
  if (config.signalPostMessage) {
    if (!config.signalPostMessage.eventName.trim()) {
      throw new PieceConfigError("invalid_html_block", "signalPostMessage.eventName must be non-empty.");
    }
    for (const origin of config.signalPostMessage.targetOrigin ?? []) {
      if (origin.includes("*")) {
        throw new PieceConfigError(
          "invalid_html_block",
          `signalPostMessage.targetOrigin "${origin}" must be a concrete origin (no wildcards).`,
        );
      }
      // postMessage throws a runtime SyntaxError on an unparseable targetOrigin,
      // which would surface inside the 10 Hz forwarding loop; catch it at save time.
      try {
        new URL(origin);
      } catch {
        throw new PieceConfigError(
          "invalid_html_block",
          `signalPostMessage.targetOrigin "${origin}" must be a valid origin URL.`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Plugin block (C.3.1; minimal — real schema deferred to plugin contract survey)
// ---------------------------------------------------------------------------

export function validatePluginBlock(config: PluginBlockConfig): void {
  if (!config.pluginId.trim()) {
    throw new PieceConfigError("invalid_plugin_block", "Plugin block must reference a non-empty pluginId.");
  }
}

// ---------------------------------------------------------------------------
// Fracture block (mesh fracturing capability)
// ---------------------------------------------------------------------------

export function validateFractureBlock(config: FractureBlockConfig): void {
  // Structural shape is guaranteed by the discriminated-union type + the
  // pre-parse in parseEditedBlock; validate only semantic constraints the
  // type system cannot express (ranges, finiteness, conditionally-required
  // fields) — mirroring the other per-block validators above.
  if (config.geometry.kind === "asset" && !config.geometry.assetId?.trim()) {
    throw new PieceConfigError("invalid_fracture_block", 'Fracture geometry of kind "asset" must reference a non-empty assetId.');
  }
  if (!Number.isInteger(config.fragmentCount) || config.fragmentCount < 1) {
    throw new PieceConfigError("invalid_fracture_block", "Fracture block fragmentCount must be an integer >= 1.");
  }
  if (!Number.isInteger(config.maxFragments) || config.maxFragments < 1) {
    throw new PieceConfigError("invalid_fracture_block", "Fracture block maxFragments must be an integer >= 1.");
  }
  if (!Number.isFinite(config.seed)) {
    throw new PieceConfigError("invalid_fracture_block", "Fracture block seed must be a finite number.");
  }

  const trigger = config.trigger;
  if (!Number.isFinite(trigger.threshold)) {
    throw new PieceConfigError("invalid_fracture_block", "Fracture trigger.threshold must be a finite number.");
  }
  if (trigger.source !== "manual" && !trigger.key?.trim()) {
    throw new PieceConfigError("invalid_fracture_block", `Fracture trigger of source "${trigger.source}" must have a non-empty key.`);
  }

  const dispersal = config.dispersal;
  if (!Number.isFinite(dispersal.speed) || dispersal.speed < 0) {
    throw new PieceConfigError("invalid_fracture_block", "Fracture dispersal.speed must be a finite number >= 0.");
  }
  if (!Number.isFinite(dispersal.lifetimeMs) || dispersal.lifetimeMs <= 0) {
    throw new PieceConfigError("invalid_fracture_block", "Fracture dispersal.lifetimeMs must be a finite number > 0.");
  }
}

// ---------------------------------------------------------------------------
// Composition (C.3.1) — discriminated union dispatch
// ---------------------------------------------------------------------------

/**
 * Validates an ordered composition array. Each block must have a unique,
 * non-empty id; per-kind validators check the wrapped config.
 */
export function validateComposition(blocks: Block[]): void {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (!block.id.trim()) {
      throw new PieceConfigError("invalid_block", "Composition block must have a non-empty id.");
    }
    if (ids.has(block.id)) {
      throw new PieceConfigError("invalid_block", `Duplicate composition block id "${block.id}".`);
    }
    ids.add(block.id);
    if (block.enabled !== undefined && typeof block.enabled !== "boolean") {
      throw new PieceConfigError(
        "invalid_block",
        `Composition block "${block.id}" has a non-boolean \`enabled\`.`,
      );
    }
    validateBlockByKind(block);
  }
}

function validateBlockByKind(block: Block): void {
  switch (block.kind) {
    case "shader-stack":
      validateShaderStack(block.config);
      return;
    case "scene":
      validateSceneRecipe(block.config);
      return;
    case "particle":
      validateParticleRecipe(block.config);
      return;
    case "sketch":
      validateSketchBlock(block.config);
      return;
    case "html":
      validateHtmlBlock(block.config);
      return;
    case "plugin":
      validatePluginBlock(block.config);
      return;
    case "fracture":
      validateFractureBlock(block.config);
      return;
    default: {
      const exhaustiveCheck: never = block;
      throw new PieceConfigError(
        "invalid_block",
        `Unknown composition block kind: ${(exhaustiveCheck as { kind: string }).kind}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// World Signals recipe config
// ---------------------------------------------------------------------------

export function validateWorldSignalsRecipe(config: WorldSignalsRecipeConfig): void {
  if (config.location) {
    const { lat, lon } = config.location;
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new PieceConfigError("invalid_world_signals", "World Signals location lat must be between -90 and 90.");
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      throw new PieceConfigError("invalid_world_signals", "World Signals location lon must be between -180 and 180.");
    }
  }
  if (config.overrides) {
    for (const [key, value] of Object.entries(config.overrides)) {
      if (!key.trim()) {
        throw new PieceConfigError("invalid_world_signals", "World Signals override key must be non-empty.");
      }
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new PieceConfigError("invalid_world_signals", `World Signals override "${key}" must be a finite number or a string.`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Top-level PieceConfig validation
// ---------------------------------------------------------------------------

export function validatePieceConfig(config: PieceConfig): void {
  if (config.version !== 3) {
    throw new PieceConfigError("unsupported_version", `Expected piece config version 3, received ${String(config.version)}.`);
  }
  if (!config.id.trim() || !config.title.trim()) {
    throw new PieceConfigError("invalid_piece", "Piece id and title are required.");
  }
  validateRendererRequirements(config.renderer);
  if (config.composition) validateComposition(config.composition);
  if (config.shaderStack) validateShaderStack(config.shaderStack);
  if (config.evolutionRules) validateEvolutionRules(config.evolutionRules);
  if (config.mutationPolicy) validateMutationPolicy(config.mutationPolicy);
  if (config.behaviour) validateBehaviourModel(config.behaviour);
  if (config.sceneRecipe) validateSceneRecipe(config.sceneRecipe);
  if (config.particleRecipe) validateParticleRecipe(config.particleRecipe);
  if (config.gestureBindings) validateGestureBindings(config.gestureBindings);
  if (config.contextInputs) validateContextInputs(config.contextInputs);
  if (config.worldSignals) validateWorldSignalsRecipe(config.worldSignals);
}

// ---------------------------------------------------------------------------
// Context Input Adapters
// ---------------------------------------------------------------------------

const VALID_OSCILLATOR_WAVES = new Set(["sine", "sawtooth", "square", "none"]);

function validateFrameBufferAdapter(adapter: FrameBufferAdapterConfig): void {
  if (adapter.bufferDepthSeconds !== undefined) {
    if (!Number.isFinite(adapter.bufferDepthSeconds) || adapter.bufferDepthSeconds < 1 || adapter.bufferDepthSeconds > 10) {
      throw new PieceConfigError("invalid_context_input", "artex.frame-buffer bufferDepthSeconds must be 1–10.");
    }
  }
  if (adapter.fps !== undefined) {
    if (!Number.isFinite(adapter.fps) || adapter.fps < 1 || adapter.fps > 60) {
      throw new PieceConfigError("invalid_context_input", "artex.frame-buffer fps must be 1–60.");
    }
  }
  if (adapter.oscillatorWave !== undefined && !VALID_OSCILLATOR_WAVES.has(adapter.oscillatorWave)) {
    throw new PieceConfigError("invalid_context_input", `artex.frame-buffer oscillatorWave must be one of: ${[...VALID_OSCILLATOR_WAVES].join(", ")}.`);
  }
  if (adapter.oscillatorRateHz !== undefined) {
    if (!Number.isFinite(adapter.oscillatorRateHz) || adapter.oscillatorRateHz < 0.05 || adapter.oscillatorRateHz > 2) {
      throw new PieceConfigError("invalid_context_input", "artex.frame-buffer oscillatorRateHz must be 0.05–2.0.");
    }
  }
  if (adapter.repeaterCount !== undefined) {
    if (!Number.isInteger(adapter.repeaterCount) || adapter.repeaterCount < 1 || adapter.repeaterCount > 12) {
      throw new PieceConfigError("invalid_context_input", "artex.frame-buffer repeaterCount must be an integer 1–12.");
    }
  }
  if (adapter.readOffset !== undefined) {
    if (!Number.isFinite(adapter.readOffset) || adapter.readOffset < 0 || adapter.readOffset > 1) {
      throw new PieceConfigError("invalid_context_input", "artex.frame-buffer readOffset must be 0–1.");
    }
  }
  if (adapter.captureCount !== undefined) {
    if (!Number.isInteger(adapter.captureCount) || adapter.captureCount < 1 || adapter.captureCount > MAX_FRAME_BUFFER_CAPTURES) {
      throw new PieceConfigError("invalid_context_input", `artex.frame-buffer captureCount must be an integer 1–${MAX_FRAME_BUFFER_CAPTURES}.`);
    }
  }
  if (adapter.blend !== undefined) {
    if (!Number.isFinite(adapter.blend) || adapter.blend < 0 || adapter.blend > 1) {
      throw new PieceConfigError("invalid_context_input", "artex.frame-buffer blend must be 0–1.");
    }
  }
  if (adapter.attractLoop !== undefined) {
    // Validate against runtime shape (configs arrive from JSON/Firestore), so
    // read through an unknown view rather than the declared types.
    const a = adapter.attractLoop as {
      enabled?: unknown; idleSeconds?: unknown; wave?: unknown; rateHz?: unknown;
    };
    if (typeof a.enabled !== "boolean") {
      throw new PieceConfigError("invalid_context_input", "artex.frame-buffer attractLoop.enabled must be a boolean.");
    }
    if (typeof a.idleSeconds !== "number" || !Number.isFinite(a.idleSeconds) || a.idleSeconds < 10 || a.idleSeconds > 1800) {
      throw new PieceConfigError("invalid_context_input", "artex.frame-buffer attractLoop.idleSeconds must be 10–1800.");
    }
    if (typeof a.wave !== "string" || !VALID_OSCILLATOR_WAVES.has(a.wave)) {
      throw new PieceConfigError("invalid_context_input", `artex.frame-buffer attractLoop.wave must be one of: ${[...VALID_OSCILLATOR_WAVES].join(", ")}.`);
    }
    if (typeof a.rateHz !== "number" || !Number.isFinite(a.rateHz) || a.rateHz < 0.05 || a.rateHz > 2) {
      throw new PieceConfigError("invalid_context_input", "artex.frame-buffer attractLoop.rateHz must be 0.05–2.0.");
    }
  }
}

export function validateContextInputs(inputs: ContextInputsConfig): void {
  if (!Array.isArray(inputs.adapters)) {
    throw new PieceConfigError("invalid_context_input", "contextInputs.adapters must be an array.");
  }
  for (const adapter of inputs.adapters) {
    if (adapter.id !== "artex.frame-buffer") {
      throw new PieceConfigError("invalid_context_input", `Unknown context input adapter id: "${adapter.id}".`);
    }
    validateFrameBufferAdapter(adapter);
  }
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
