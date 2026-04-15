#!/usr/bin/env npx tsx
/**
 * ARTEX Platform API — Sample: Run a New Project
 *
 * Demonstrates how an external application can create a new ARTEX
 * project with a full ConfigJson and deploy it to a running instance.
 *
 * Prerequisites:
 *   - ARTEX Platform API running (npm run dev)
 *
 * Usage:
 *   npx tsx examples/run-new-project.ts
 *   npx tsx examples/run-new-project.ts --instance gallery-1
 *
 * What this script does:
 *   1. Builds a complete ConfigJson for a living artwork
 *   2. Creates the project via POST /projects
 *   3. Runs it on an ARTEX instance via POST /projects/:id/run
 *   4. Connects to the WebSocket to confirm it's live
 *   5. Prints the project ID for use with update-running-experience.ts
 */

import type { ConfigJson } from "@artex/contract";

const API_BASE = process.env.ARTEX_API_URL ?? "http://localhost:8080/v1";
const API_TOKEN = process.env.ARTEX_API_TOKEN ?? "dev-token-12345678";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function api(method: string, path: string, body?: unknown): Promise<any> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(`${method} ${path} → ${res.status}: ${err.message ?? err.code}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Build the artwork configuration
// ---------------------------------------------------------------------------

function buildConfig(): ConfigJson {
  return {
    version: 1,
    title: "Coral Drift — Generative Seascape",
    artistName: "CODAME External Demo",
    story:
      "A living seascape that breathes with ocean currents. " +
      "Colors shift from cool morning blues to warm sunset corals " +
      "over a 30-day evolution cycle. Responds to viewer proximity " +
      "and ambient sound.",
    medium: "Digital — WebGL living art",

    layers: {
      base: {
        parallaxDepth: 0.6,
        breathingIntensity: 0.4,
        textureDrift: 0.15,
      },
    },

    animation: {
      baseSpeed: 1.0,
      breathingEnabled: true,
      parallaxEnabled: true,
      colorShiftEnabled: true,
    },

    evolution: {
      mode: "timeBased",
      durationDays: 30,
      phases: [
        {
          startDay: 0,
          label: "calm-dawn",
          colorTemperatureShift: -0.3,
          noiseIntensity: 0.1,
          brightnessShift: 0.1,
        },
        {
          startDay: 10,
          label: "midday-current",
          colorTemperatureShift: 0.0,
          noiseIntensity: 0.3,
          brightnessShift: 0.0,
        },
        {
          startDay: 20,
          label: "sunset-coral",
          colorTemperatureShift: 0.5,
          noiseIntensity: 0.2,
          brightnessShift: -0.1,
        },
      ],
      schedule: {
        anchor: "install",
        timezone: "America/Los_Angeles",
      },
    },

    interaction: {
      supportsProximity: true,
      supportsAmbientLight: true,
      events: [
        {
          trigger: "viewer_close",
          effect: "increase_breathing",
          intensityDelta: 0.3,
          cooldownSeconds: 5,
        },
        {
          trigger: "night",
          effect: "dim_scene",
          brightnessShift: -0.2,
        },
      ],
    },

    interactions: {
      simpleInteractionsEnabled: true,
      simpleInteractionMode: "expressive",
      audioReactive: true,
      proximitySensor: true,
      interactionProfile: "expressive",
    },

    artistTemplate: "flowing",
    mood: 0.6,
    simpleInteractions: ["timeOfDay", "presence", "sound"],

    contextBehavior: {
      enabled: true,
      driver: "daily",
      affects: "everything",
      style: "calm",
      intensity: "balanced",
    },

    shader: {
      flowIntensity: 0.5,
      flowSpeed: 0.4,
      flowScale: 0.6,
    },

    constraints: {
      protectedRegions: [],
    },

    assets: {
      baseImage: "art/coral-drift-base.png",
      states: ["states/calm.png", "states/active.png"],
      masks: {
        water: "masks/water-region.png",
      },
      depth: "maps/depth.png",
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const instanceId = process.argv.includes("--instance")
    ? process.argv[process.argv.indexOf("--instance") + 1]
    : "default";

  console.log("═══════════════════════════════════════════════════════");
  console.log("  ARTEX Sample: Run a New Project");
  console.log("═══════════════════════════════════════════════════════\n");

  // Step 1: Build config
  console.log("1. Building artwork configuration...");
  const config = buildConfig();
  console.log(`   Title: "${config.title}"`);
  console.log(`   Artist: ${config.artistName}`);
  console.log(`   Template: ${config.artistTemplate}`);
  console.log(`   Evolution: ${config.evolution.phases.length} phases over ${config.evolution.durationDays} days`);
  console.log(`   Interactions: proximity=${config.interaction.supportsProximity}, audio=${config.interactions?.audioReactive}`);
  console.log();

  // Step 2: Create the project
  console.log("2. Creating project via API...");
  const project = await api("POST", "/projects", { config });
  console.log(`   ✓ Created! Project ID: ${project.projectId}`);
  console.log(`   Status: ${project.status}`);
  console.log(`   State initialized: phase="${project.state.currentPhaseLabel}", seed=${project.state.randomSeed}`);
  console.log();

  // Step 3: Run on instance
  console.log(`3. Running on instance "${instanceId}"...`);
  const runResult = await api("POST", `/projects/${project.projectId}/run`, {
    instanceId,
  });
  console.log(`   ✓ Running!`);
  console.log(`   Instance: ${runResult.instanceId}`);
  console.log(`   WebSocket: ${runResult.wsUrl}`);
  console.log();

  // Step 4: Verify it's running by fetching state
  console.log("4. Verifying project is live...");
  const live = await api("GET", `/projects/${project.projectId}`);
  console.log(`   Status: ${live.status}`);
  console.log(`   Config title: "${live.config.title}"`);
  console.log(`   Current phase: ${live.state.currentPhaseLabel}`);
  console.log(`   Breathing: ${live.state.parameters.breathingIntensity}`);
  console.log();

  // Done
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Project is live! To update it in real-time, run:");
  console.log();
  console.log(`  npx tsx examples/update-running-experience.ts ${project.projectId}`);
  console.log("═══════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("\n✗ Error:", err.message);
  process.exit(1);
});
