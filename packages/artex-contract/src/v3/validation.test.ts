import { describe, expect, it } from "vitest";
import type {
  BehaviourModelConfig,
  EvolutionRuleConfig,
  GestureBindingConfig,
  MutationPolicy,
  ParticleRecipeConfig,
  PieceConfigV3,
  SceneRecipeConfig,
  ShaderStackConfig,
} from "./types";
import {
  rendererRequirementsToHint,
  validateBehaviourModel,
  validateEvolutionRules,
  validateGestureBindings,
  validateMutationPolicy,
  validateParticleRecipe,
  validatePieceConfigV3,
  validateRendererRequirements,
  validateSceneRecipe,
  validateShaderStack,
} from "./validation";

// ---------------------------------------------------------------------------
// Helpers — minimal valid configs for each use case
// ---------------------------------------------------------------------------

const webglShaderConfig: PieceConfigV3 = {
  version: 3,
  id: "flow-study",
  title: "Flow Study",
  renderer: { primary: "shader" },
  shaderStack: {
    passes: [
      { id: "distortion", shaderId: "flow-distortion", params: { intensity: 0.8, speed: 0.5 } },
      { id: "color", shaderId: "color-grade", params: { warmth: 0.3 }, blendMode: "overlay" },
    ],
    resolutionScale: 1.0,
  },
};

const livingGrassConfig: PieceConfigV3 = {
  version: 3,
  id: "living-grass",
  title: "Living Grass",
  renderer: { primary: "three-scene", secondary: ["shader"] },
  evolutionRules: [
    {
      param: "wind.strength",
      anchor: "calendar",
      cycleDurationHours: 24,
      repeat: true,
      keyframes: [
        { at: 0, value: 0.1 },
        { at: 0.5, value: 0.8 },
        { at: 1, value: 0.1 },
      ],
    },
  ],
  mutationPolicy: {
    maxDelta: { "palette.base": 30, "wind.strength": 0.3 },
    minTransitionMs: 2000,
    lockedParams: ["fieldRadius"],
  },
};

const illyConfig: PieceConfigV3 = {
  version: 3,
  id: "illy-pi",
  title: "Illy: Primitive Intelligence",
  renderer: { primary: "three-scene" },
  behaviour: {
    triggers: [
      {
        id: "voice-awakens",
        when: [{ signal: "sound_level", operator: "gte", value: 0.4 }],
        debounceMs: 200,
        then: [{ type: "enter_state", stateId: "awake" }],
      },
    ],
    states: [
      { id: "dormant", label: "Dormant", initial: true },
      { id: "awake", label: "Awake" },
      { id: "expressive", label: "Expressive" },
    ],
    personality: {
      preset: "threshold",
      restingState: {
        arousal: 0.1,
        coherence: 0.8,
        intimacy: 0.0,
        tension: 0.05,
        novelty: 0.0,
        attention: 0.0,
        memoryResidue: 0.0,
      },
      decayRate: 0.3,
      sensitivity: { arousal: 1.5, intimacy: 0.8 },
    },
    boundaries: [
      { signal: "sound_level", valueFloor: 0.05, minConfidence: 0.6 },
      { signal: "gesture", minConfidence: 0.8, sustainMs: 300 },
      { signal: "presence", suppressedBy: [] },
    ],
    fallbackStateId: "dormant",
  },
};

const formReleaseConfig: PieceConfigV3 = {
  version: 3,
  id: "form-release",
  title: "Form / Release",
  renderer: { primary: "three-scene", secondary: ["particle"], minGpuTier: "medium" },
  sceneRecipe: {
    environment: { kind: "color", color: 0x000000 },
    lights: [
      { id: "key", kind: "directional", color: 0xffffff, intensity: 1.2, position: [5, 10, 5], castShadow: true },
      { id: "fill", kind: "ambient", color: 0x333355, intensity: 0.4 },
    ],
    meshes: [
      {
        id: "body",
        geometry: { kind: "asset", assetId: "human-form-glb" },
        materialId: "emissive-skin",
        position: [0, 0, 0],
        particleEmitter: true,
      },
    ],
    fog: { near: 5, far: 50, color: 0x000000 },
  },
  particleRecipe: {
    emitters: [
      {
        id: "vertex-burst",
        shape: "mesh-vertex",
        meshId: "body",
        rate: 200,
        lifetime: { min: 1.5, max: 4.0 },
        velocity: { direction: [0, 1, 0], spread: 0.8, speed: { min: 0.2, max: 1.5 } },
        size: { start: 0.03, end: 0.0 },
        opacity: { start: 1.0, end: 0.0 },
        color: { start: 0xffffff, end: 0x4466ff },
        blendMode: "additive",
        forces: [
          { kind: "gravity", strength: -0.3, direction: [0, 1, 0] },
          { kind: "turbulence", strength: 0.5, frequency: 2.0 },
        ],
      },
    ],
    globalForces: [
      { kind: "drag", strength: 0.1 },
    ],
    maxParticles: 50000,
  },
  gestureBindings: [
    {
      id: "palm-emission",
      signal: "gesture",
      gestureLabel: "open_palm",
      targetParam: "emitters[0].rate",
      mapping: { inputRange: [0, 1], outputRange: [50, 500], curve: "ease-out" },
      minConfidence: 0.7,
      smoothing: 0.3,
    },
    {
      id: "proximity-turbulence",
      signal: "proximity",
      targetParam: "globalForces[0].strength",
      mapping: { inputRange: [0, 1], outputRange: [0.05, 0.8], curve: "linear" },
      smoothing: 0.5,
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Use Case 1: WebGL Shader — shaderStack + parameters", () => {
  it("validates a complete shader stack config", () => {
    expect(() => validatePieceConfigV3(webglShaderConfig)).not.toThrow();
  });

  it("rejects an empty shader stack", () => {
    expect(() => validateShaderStack({ passes: [] })).toThrow("at least one pass");
  });

  it("rejects duplicate pass IDs", () => {
    expect(() => validateShaderStack({
      passes: [
        { id: "a", shaderId: "s1", params: {} },
        { id: "a", shaderId: "s2", params: {} },
      ],
    })).toThrow('Duplicate shader pass id "a"');
  });

  it("rejects blank shader reference", () => {
    expect(() => validateShaderStack({
      passes: [{ id: "p1", shaderId: "  ", params: {} }],
    })).toThrow("must reference a shader");
  });

  it("rejects out-of-range resolutionScale", () => {
    expect(() => validateShaderStack({
      passes: [{ id: "p1", shaderId: "s1", params: {} }],
      resolutionScale: 5.0,
    })).toThrow("resolutionScale");
  });

  it("accepts multiple passes with distinct IDs and params", () => {
    expect(() => validateShaderStack({
      passes: [
        { id: "flow", shaderId: "flow-distortion", params: { intensity: 0.8 } },
        { id: "feedback", shaderId: "feedback-loop", params: { amount: 0.3, decay: 0.95 } },
        { id: "grade", shaderId: "color-grade", params: { warmth: 0.5 }, enabled: false },
      ],
      globalParams: { time: 0, resolution: 1920 },
    })).not.toThrow();
  });
});

describe("Use Case 2: Living Grass — parameters + evolutionRules + mutationPolicy", () => {
  it("validates a complete Living Grass config", () => {
    expect(() => validatePieceConfigV3(livingGrassConfig)).not.toThrow();
  });

  it("rejects evolution rule with zero cycle duration", () => {
    expect(() => validateEvolutionRules([
      { param: "wind.strength", anchor: "calendar", cycleDurationHours: 0, repeat: true, keyframes: [{ at: 0, value: 0 }, { at: 1, value: 1 }] },
    ])).toThrow("positive cycle duration");
  });

  it("rejects evolution rule with less than 2 keyframes", () => {
    expect(() => validateEvolutionRules([
      { param: "wind.strength", anchor: "install", cycleDurationHours: 24, repeat: false, keyframes: [{ at: 0, value: 0 }] },
    ])).toThrow("at least 2 keyframes");
  });

  it("rejects keyframes out of ascending order", () => {
    expect(() => validateEvolutionRules([
      { param: "palette.base", anchor: "calendar", cycleDurationHours: 168, repeat: true, keyframes: [{ at: 0, value: 0 }, { at: 0.8, value: 1 }, { at: 0.5, value: 0.5 }] },
    ])).toThrow("ascending order");
  });

  it("rejects keyframe positions outside 0–1", () => {
    expect(() => validateEvolutionRules([
      { param: "wind.strength", anchor: "install", cycleDurationHours: 24, repeat: false, keyframes: [{ at: -0.1, value: 0 }, { at: 1, value: 1 }] },
    ])).toThrow("0–1");
  });

  it("rejects keyframes with non-finite values", () => {
    expect(() => validateEvolutionRules([
      {
        param: "wind.strength",
        anchor: "install",
        cycleDurationHours: 24,
        repeat: false,
        keyframes: [{ at: 0, value: Number.NaN }, { at: 1, value: 1 }],
      },
    ])).toThrow("finite number");
  });

  it("rejects mutation policy with negative minTransitionMs", () => {
    expect(() => validateMutationPolicy({ maxDelta: {}, minTransitionMs: -100 }))
      .toThrow("non-negative");
  });

  it("rejects mutation policy with negative maxDelta", () => {
    expect(() => validateMutationPolicy({ maxDelta: { "wind.strength": -0.5 }, minTransitionMs: 1000 }))
      .toThrow("non-negative");
  });

  it("accepts compound renderer with shader secondary", () => {
    expect(() => validateRendererRequirements({ primary: "three-scene", secondary: ["shader"] })).not.toThrow();
  });
});

describe("Use Case 3: Illy — behaviour + personality + stateModel + interpretation boundaries", () => {
  it("validates a complete Illy behaviour config", () => {
    expect(() => validatePieceConfigV3(illyConfig)).not.toThrow();
  });

  it("rejects behaviour with no states", () => {
    expect(() => validateBehaviourModel({
      triggers: [],
      states: [],
      fallbackStateId: "dormant",
    })).toThrow("at least one state");
  });

  it("rejects behaviour with invalid fallback state", () => {
    expect(() => validateBehaviourModel({
      triggers: [],
      states: [{ id: "idle", label: "Idle" }],
      fallbackStateId: "missing",
    })).toThrow('Fallback state "missing"');
  });

  it("rejects personality with out-of-range resting state", () => {
    expect(() => validateBehaviourModel({
      triggers: [],
      states: [{ id: "idle", label: "Idle" }],
      fallbackStateId: "idle",
      personality: {
        preset: "threshold",
        restingState: { arousal: 1.5, coherence: 0.5, intimacy: 0, tension: 0, novelty: 0, attention: 0, memoryResidue: 0 },
        decayRate: 0.3,
      },
    })).toThrow('Personality dimension "arousal" must be 0–1');
  });

  it("rejects personality with non-numeric resting state values", () => {
    expect(() => validateBehaviourModel({
      triggers: [],
      states: [{ id: "idle", label: "Idle" }],
      fallbackStateId: "idle",
      personality: {
        preset: "threshold",
        restingState: {
          arousal: "high" as unknown as number,
          coherence: 0.5,
          intimacy: 0,
          tension: 0,
          novelty: 0,
          attention: 0,
          memoryResidue: 0,
        },
        decayRate: 0.3,
      },
    })).toThrow('Personality dimension "arousal" must be 0–1');
  });

  it("rejects personality with out-of-range decayRate", () => {
    expect(() => validateBehaviourModel({
      triggers: [],
      states: [{ id: "idle", label: "Idle" }],
      fallbackStateId: "idle",
      personality: {
        preset: "custom",
        restingState: { arousal: 0, coherence: 0.5, intimacy: 0, tension: 0, novelty: 0, attention: 0, memoryResidue: 0 },
        decayRate: 2.0,
      },
    })).toThrow("decayRate must be 0–1");
  });

  it("rejects interpretation boundary with floor > ceiling", () => {
    expect(() => validateBehaviourModel({
      triggers: [],
      states: [{ id: "idle", label: "Idle" }],
      fallbackStateId: "idle",
      boundaries: [{ signal: "sound_level", valueFloor: 0.8, valueCeiling: 0.2 }],
    })).toThrow("valueFloor exceeds valueCeiling");
  });

  it("rejects interpretation boundary with negative sustainMs", () => {
    expect(() => validateBehaviourModel({
      triggers: [],
      states: [{ id: "idle", label: "Idle" }],
      fallbackStateId: "idle",
      boundaries: [{ signal: "gesture", sustainMs: -100 }],
    })).toThrow("non-negative");
  });

  it("rejects interpretation boundary with minConfidence > 1", () => {
    expect(() => validateBehaviourModel({
      triggers: [],
      states: [{ id: "idle", label: "Idle" }],
      fallbackStateId: "idle",
      boundaries: [{ signal: "presence", minConfidence: 1.5 }],
    })).toThrow("0–1");
  });
});

describe("Use Case 4: Form/Release — sceneRecipe + particleRecipe + gestureBindings", () => {
  it("validates a complete Form/Release config", () => {
    expect(() => validatePieceConfigV3(formReleaseConfig)).not.toThrow();
  });

  it("validates compound renderer with particle secondary", () => {
    expect(() => validateRendererRequirements({ primary: "three-scene", secondary: ["particle"], minGpuTier: "medium" })).not.toThrow();
  });

  it("rejects renderer with primary repeated in secondary", () => {
    expect(() => validateRendererRequirements({ primary: "three-scene", secondary: ["three-scene"] }))
      .toThrow("should not repeat");
  });

  it("rejects scene recipe with duplicate light IDs", () => {
    expect(() => validateSceneRecipe({
      lights: [
        { id: "a", kind: "ambient", color: 0xffffff, intensity: 1 },
        { id: "a", kind: "point", color: 0xffffff, intensity: 1 },
      ],
      meshes: [],
    })).toThrow('Duplicate light id "a"');
  });

  it("rejects scene recipe with duplicate mesh IDs", () => {
    expect(() => validateSceneRecipe({
      lights: [],
      meshes: [
        { id: "m1", geometry: { kind: "box" }, materialId: "mat" },
        { id: "m1", geometry: { kind: "sphere" }, materialId: "mat" },
      ],
    })).toThrow('Duplicate mesh id "m1"');
  });

  it("rejects particle recipe with zero maxParticles", () => {
    expect(() => validateParticleRecipe({
      emitters: [{ id: "e1", shape: "point", rate: 10, lifetime: { min: 1, max: 2 }, velocity: { direction: [0, 1, 0], spread: 0.5, speed: { min: 0.1, max: 1 } }, size: { start: 0.1, end: 0 }, opacity: { start: 1, end: 0 } }],
      maxParticles: 0,
    })).toThrow("maxParticles must be positive");
  });

  it("rejects particle recipe with no emitters", () => {
    expect(() => validateParticleRecipe({ emitters: [], maxParticles: 1000 }))
      .toThrow("at least one emitter");
  });

  it("rejects mesh-vertex emitter without meshId", () => {
    expect(() => validateParticleRecipe({
      emitters: [{ id: "e1", shape: "mesh-vertex", rate: 10, lifetime: { min: 1, max: 2 }, velocity: { direction: [0, 1, 0], spread: 0.5, speed: { min: 0.1, max: 1 } }, size: { start: 0.1, end: 0 }, opacity: { start: 1, end: 0 } }],
      maxParticles: 1000,
    })).toThrow("no meshId");
  });

  it("rejects emitter with inverted lifetime range", () => {
    expect(() => validateParticleRecipe({
      emitters: [{ id: "e1", shape: "point", rate: 10, lifetime: { min: 5, max: 2 }, velocity: { direction: [0, 1, 0], spread: 0.5, speed: { min: 0.1, max: 1 } }, size: { start: 0.1, end: 0 }, opacity: { start: 1, end: 0 } }],
      maxParticles: 1000,
    })).toThrow("invalid lifetime range");
  });

  it("rejects duplicate emitter IDs", () => {
    const emitter = { id: "e1", shape: "point" as const, rate: 10, lifetime: { min: 1, max: 2 }, velocity: { direction: [0, 1, 0] as [number, number, number], spread: 0.5, speed: { min: 0.1, max: 1 } }, size: { start: 0.1, end: 0 }, opacity: { start: 1, end: 0 } };
    expect(() => validateParticleRecipe({ emitters: [emitter, { ...emitter }], maxParticles: 1000 }))
      .toThrow('Duplicate emitter id "e1"');
  });

  it("rejects gesture binding with inverted input range", () => {
    expect(() => validateGestureBindings([
      { id: "b1", signal: "proximity", targetParam: "rate", mapping: { inputRange: [1, 0], outputRange: [0, 100] } },
    ])).toThrow("min must be less than max");
  });

  it("rejects duplicate gesture binding IDs", () => {
    const binding = { id: "b1", signal: "proximity" as const, targetParam: "rate", mapping: { inputRange: [0, 1] as [number, number], outputRange: [0, 100] as [number, number] } };
    expect(() => validateGestureBindings([binding, { ...binding }]))
      .toThrow('Duplicate gesture binding id "b1"');
  });
});

describe("PieceConfigV3 top-level validation", () => {
  it("rejects wrong version", () => {
    expect(() => validatePieceConfigV3({ ...webglShaderConfig, version: 2 as never }))
      .toThrow("version 3");
  });

  it("rejects blank id or title", () => {
    expect(() => validatePieceConfigV3({ ...webglShaderConfig, id: " " })).toThrow("id and title");
    expect(() => validatePieceConfigV3({ ...webglShaderConfig, title: "" })).toThrow("id and title");
  });

  it("validates all four use case configs without error", () => {
    expect(() => validatePieceConfigV3(webglShaderConfig)).not.toThrow();
    expect(() => validatePieceConfigV3(livingGrassConfig)).not.toThrow();
    expect(() => validatePieceConfigV3(illyConfig)).not.toThrow();
    expect(() => validatePieceConfigV3(formReleaseConfig)).not.toThrow();
  });
});

describe("rendererRequirementsToHint", () => {
  it("maps shader primary to shader hint", () => {
    expect(rendererRequirementsToHint({ primary: "shader" })).toBe("shader");
  });

  it("maps three-scene primary to threejs hint", () => {
    expect(rendererRequirementsToHint({ primary: "three-scene" })).toBe("threejs");
  });

  it("maps three-scene + particle compound to threejs+particle hint", () => {
    expect(rendererRequirementsToHint({ primary: "three-scene", secondary: ["particle"] })).toBe("threejs+particle");
  });

  it("maps particle primary + three-scene secondary to threejs+particle hint", () => {
    expect(rendererRequirementsToHint({ primary: "particle", secondary: ["three-scene"] })).toBe("threejs+particle");
  });

  it("falls back to auto for audio-reactive", () => {
    expect(rendererRequirementsToHint({ primary: "audio-reactive" })).toBe("auto");
  });
});
