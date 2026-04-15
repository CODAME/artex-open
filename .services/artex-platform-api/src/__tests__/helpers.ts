/**
 * Shared test helpers — builds valid ConfigJson, creates test stores, etc.
 */

import type { ConfigJson, StateJson } from "@artex/contract";
import { createStateFromConfig } from "@artex/contract";

/**
 * Returns a minimal valid ConfigJson for testing.
 */
export function buildTestConfig(overrides?: Partial<ConfigJson>): ConfigJson {
  return {
    version: 1,
    title: "Test Artwork",
    artistName: "Test Artist",
    story: "A test artwork for unit tests.",
    layers: {
      base: {
        parallaxDepth: 0.5,
        breathingIntensity: 0.3,
        textureDrift: 0.1,
      },
    },
    animation: {
      baseSpeed: 1.0,
      breathingEnabled: true,
      parallaxEnabled: true,
      colorShiftEnabled: false,
    },
    evolution: {
      mode: "timeBased",
      durationDays: 30,
      phases: [
        {
          startDay: 0,
          label: "calm",
          colorTemperatureShift: 0,
          noiseIntensity: 0.1,
          brightnessShift: 0,
        },
      ],
    },
    interaction: {
      supportsProximity: true,
      supportsAmbientLight: false,
      events: [],
    },
    constraints: {
      protectedRegions: [],
    },
    ...overrides,
  } as ConfigJson;
}

/**
 * Returns a valid StateJson derived from a config.
 */
export function buildTestState(config?: ConfigJson): StateJson {
  return createStateFromConfig(config ?? buildTestConfig());
}
