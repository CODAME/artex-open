#!/usr/bin/env npx tsx
/**
 * ARTEX Platform API — Sample: Update a Running Experience
 *
 * Demonstrates how an external application can modify a live ARTEX
 * experience in real-time: tune config, adjust state parameters,
 * push interaction events, and subscribe to changes via WebSocket.
 *
 * Prerequisites:
 *   - ARTEX Platform API running (npm run dev)
 *   - A project already created and running (use run-new-project.ts first)
 *
 * Usage:
 *   npx tsx examples/update-running-experience.ts <projectId>
 *
 * What this script does:
 *   1. Fetches the current project to confirm it's running
 *   2. Connects to the WebSocket for real-time updates
 *   3. Patches the config (adjusts mood, animation speed, template)
 *   4. Patches the state (tweaks breathing intensity)
 *   5. Pushes interaction events (viewer_close, sound_peak)
 *   6. Listens for broadcast confirmations via WebSocket
 */

const API_BASE = process.env.ARTEX_API_URL ?? "http://localhost:8080/v1";
const API_TOKEN = process.env.ARTEX_API_TOKEN ?? "dev-token-12345678";
const WS_BASE = API_BASE.replace(/^http/, "ws");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function api(method: string, path: string, body?: unknown): Promise<any> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${API_TOKEN}`,
      "Content-Type": method === "PATCH"
        ? "application/merge-patch+json"
        : "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(`${method} ${path} → ${res.status}: ${err.message ?? err.code}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

function connectWebSocket(projectId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const url = `${WS_BASE}/ws/projects/${projectId}/state?token=${API_TOKEN}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log("  ✓ WebSocket connected\n");
      resolve(ws);
    };

    ws.onerror = (e) => reject(new Error(`WebSocket error: ${e}`));

    ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data));
      const preview = JSON.stringify(msg).slice(0, 120);
      console.log(`  ← WS [${msg.type}] ${preview}...`);
    };

    ws.onclose = (e) => {
      console.log(`  ✗ WebSocket closed: ${e.code} ${e.reason}`);
    };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error("Usage: npx tsx examples/update-running-experience.ts <projectId>");
    console.error("\nRun examples/run-new-project.ts first to get a projectId.");
    process.exit(1);
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log("  ARTEX Sample: Update a Running Experience");
  console.log("═══════════════════════════════════════════════════════\n");

  // Step 1: Verify the project exists and is running
  console.log("1. Fetching project...");
  const project = await api("GET", `/projects/${projectId}`);
  console.log(`   Title: ${project.config.title}`);
  console.log(`   Status: ${project.status}`);

  if (project.status !== "running") {
    console.log("\n   Project is not running. Starting it...");
    const runResult = await api("POST", `/projects/${projectId}/run`, {});
    console.log(`   ✓ Now running. WS URL: ${runResult.wsUrl}`);
  }
  console.log();

  // Step 2: Connect to WebSocket for real-time updates
  console.log("2. Connecting to WebSocket...");
  const ws = connectWebSocket(projectId);
  await sleep(500); // Let initial state snapshot arrive

  // Step 3: Patch the config — live-tune the experience
  console.log("3. Patching config (mood → 0.85, speed → 2.0, template → flowing)...");
  const updatedConfig = await api("PATCH", `/projects/${projectId}/config`, {
    mood: 0.85,
    animation: {
      baseSpeed: 2.0,
    },
    artistTemplate: "flowing",
  });
  console.log(`   ✓ Config updated. Mood: ${updatedConfig.mood}, Speed: ${updatedConfig.animation.baseSpeed}`);
  await sleep(300);
  console.log();

  // Step 4: Patch the state — adjust runtime parameters
  console.log("4. Patching state (breathingIntensity → 0.9, colorTemperature → 0.3)...");
  const updatedState = await api("PATCH", `/projects/${projectId}/state`, {
    parameters: {
      breathingIntensity: 0.9,
      colorTemperature: 0.3,
    },
  });
  console.log(`   ✓ State updated. Breathing: ${updatedState.parameters.breathingIntensity}`);
  await sleep(300);
  console.log();

  // Step 5: Push interaction events
  console.log("5. Pushing interaction events...");
  const eventResult = await api("POST", `/projects/${projectId}/state/events`, {
    events: [
      { event: "viewer_close" },
      { event: "sound_peak" },
      { event: "external_trigger" },
    ],
  });
  console.log(`   ✓ ${eventResult.appended} events pushed. Total log: ${eventResult.eventsLog.length} entries`);
  await sleep(300);
  console.log();

  // Step 6: Do a second config tweak to show iterative updates
  console.log("6. Second config tweak (breathing off, color shift on)...");
  await api("PATCH", `/projects/${projectId}/config`, {
    animation: {
      breathingEnabled: false,
      colorShiftEnabled: true,
    },
  });
  console.log("   ✓ Config updated.");
  await sleep(500);

  // Done
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Done! The running experience was updated in real-time.");
  console.log("  All changes were broadcast to WebSocket subscribers.");
  console.log("═══════════════════════════════════════════════════════\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("\n✗ Error:", err.message);
  process.exit(1);
});
