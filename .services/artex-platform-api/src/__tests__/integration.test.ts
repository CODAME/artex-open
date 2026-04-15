/**
 * Integration tests — exercise both primary use cases end-to-end
 * using the real handler + store + broadcaster stack (no HTTP layer).
 *
 * Use Case 1: Run a new project on an ARTEX instance
 * Use Case 2: Update an existing running experience
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createInMemoryProjectStore, type ProjectStore } from "../store/projectStore.js";
import { createWsBroadcaster, type WsBroadcaster } from "../ws/broadcaster.js";
import { createProjectHandlers } from "../handlers/projects.js";
import { buildTestConfig } from "./helpers.js";
import type { ConfigJson } from "@artex/contract";

// ---------------------------------------------------------------------------
// Mock Express req/res
// ---------------------------------------------------------------------------

function mockReq(params: Record<string, string> = {}, body: any = {}, query: Record<string, string> = {}) {
  return {
    params,
    body,
    query,
    get: (header: string) => header === "host" ? "localhost:8080" : undefined,
    secure: false,
    caller: { callerId: "test-user", authMethod: "api_key" as const, scopes: ["*"] },
  } as any;
}

function mockRes() {
  const res: any = {
    statusCode: 200,
    _body: null,
    status(code: number) { res.statusCode = code; return res; },
    json(body: any) { res._body = body; res.statusCode = res.statusCode || 200; return res; },
    send() { return res; },
  };
  return res;
}

// ---------------------------------------------------------------------------
// Use Case 1: Run a New Project
// ---------------------------------------------------------------------------

describe("Use Case 1: Run a new project on an ARTEX instance", () => {
  let store: ProjectStore;
  let broadcaster: WsBroadcaster;
  let handlers: ReturnType<typeof createProjectHandlers>;

  beforeEach(() => {
    store = createInMemoryProjectStore();
    broadcaster = createWsBroadcaster();
    handlers = createProjectHandlers(store, broadcaster);
  });

  it("creates a project, then runs it on an instance", async () => {
    const config = buildTestConfig({ title: "Gallery Piece" });

    // Step 1: Create
    const createReq = mockReq({}, { config });
    const createRes = mockRes();
    await handlers.createProject(createReq, createRes);

    expect(createRes.statusCode).toBe(201);
    expect(createRes._body.projectId).toBeDefined();
    expect(createRes._body.status).toBe("draft");
    expect(createRes._body.config.title).toBe("Gallery Piece");
    expect(createRes._body.state.currentPhaseLabel).toBe("calm");

    const projectId = createRes._body.projectId;

    // Step 2: Run on instance
    const runReq = mockReq({ projectId }, { instanceId: "gallery-1" });
    const runRes = mockRes();
    await handlers.runProject(runReq, runRes);

    expect(runRes.statusCode).toBe(200);
    expect(runRes._body.status).toBe("running");
    expect(runRes._body.instanceId).toBe("gallery-1");
    expect(runRes._body.wsUrl).toContain(projectId);

    // Step 3: Verify persistence
    const project = await store.get(projectId);
    expect(project!.status).toBe("running");
    expect(project!.instanceId).toBe("gallery-1");
  });

  it("generates state from config automatically", async () => {
    const config = buildTestConfig({
      evolution: {
        mode: "timeBased",
        durationDays: 60,
        phases: [
          { startDay: 0, label: "morning", colorTemperatureShift: -0.5, noiseIntensity: 0.2, brightnessShift: 0.1 },
          { startDay: 30, label: "evening", colorTemperatureShift: 0.5, noiseIntensity: 0.4, brightnessShift: -0.1 },
        ],
      },
    });

    const req = mockReq({}, { config });
    const res = mockRes();
    await handlers.createProject(req, res);

    // State should derive from config
    expect(res._body.state.currentPhaseLabel).toBe("morning");
    expect(res._body.state.parameters.breathingIntensity).toBe(config.layers.base.breathingIntensity);
    expect(res._body.state.parameters.noiseIntensity).toBe(0.2); // From first phase
    expect(res._body.state.randomSeed).toBeGreaterThan(0);
  });

  it("rejects invalid config", async () => {
    const badConfig = { version: 1, title: "No layers" }; // Missing required fields

    const req = mockReq({}, { config: badConfig });
    const res = mockRes();
    await handlers.createProject(req, res);

    expect(res.statusCode).toBe(422);
    expect(res._body.code).toBeDefined();
  });

  it("run is idempotent on already running project", async () => {
    const config = buildTestConfig();
    const createRes = mockRes();
    await handlers.createProject(mockReq({}, { config }), createRes);
    const projectId = createRes._body.projectId;

    // Run twice
    await handlers.runProject(mockReq({ projectId }, {}), mockRes());
    const secondRes = mockRes();
    await handlers.runProject(mockReq({ projectId }, {}), secondRes);

    expect(secondRes._body.status).toBe("running");
  });

  it("run with resetState regenerates state from config", async () => {
    const config = buildTestConfig();
    const createRes = mockRes();
    await handlers.createProject(mockReq({}, { config }), createRes);
    const projectId = createRes._body.projectId;

    // Modify state
    const project = await store.get(projectId);
    await store.updateState(projectId, {
      ...project!.state,
      parameters: { ...project!.state.parameters, breathingIntensity: 0.99 },
    });

    // Run with reset
    await handlers.runProject(mockReq({ projectId }, { resetState: true }), mockRes());

    const after = await store.get(projectId);
    expect(after!.state.parameters.breathingIntensity).toBe(config.layers.base.breathingIntensity);
  });
});

// ---------------------------------------------------------------------------
// Use Case 2: Update a Running Experience
// ---------------------------------------------------------------------------

describe("Use Case 2: Update an existing running experience", () => {
  let store: ProjectStore;
  let broadcaster: WsBroadcaster;
  let handlers: ReturnType<typeof createProjectHandlers>;
  let projectId: string;

  beforeEach(async () => {
    store = createInMemoryProjectStore();
    broadcaster = createWsBroadcaster();
    handlers = createProjectHandlers(store, broadcaster);

    // Create and run a project
    const config = buildTestConfig({ title: "Live Experience", mood: 0.5 });
    const createRes = mockRes();
    await handlers.createProject(mockReq({}, { config }), createRes);
    projectId = createRes._body.projectId;
    await handlers.runProject(mockReq({ projectId }, { instanceId: "test-instance" }), mockRes());
  });

  describe("PATCH config — live-tune the experience", () => {
    it("partially updates config via merge patch", async () => {
      const broadcastSpy = vi.spyOn(broadcaster, "broadcast");

      const req = mockReq({ projectId }, { mood: 0.85, animation: { baseSpeed: 2.5 } });
      const res = mockRes();
      await handlers.patchConfig(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._body.mood).toBe(0.85);
      expect(res._body.animation.baseSpeed).toBe(2.5);
      // Other animation fields preserved
      expect(res._body.animation.breathingEnabled).toBe(true);
      expect(res._body.title).toBe("Live Experience");

      // Should broadcast to WS subscribers
      expect(broadcastSpy).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({ type: "config_updated" }),
      );
    });

    it("changes artistTemplate and interactions", async () => {
      const req = mockReq({ projectId }, {
        artistTemplate: "dream",
        simpleInteractions: ["timeOfDay", "sound"],
        contextBehavior: {
          enabled: true,
          driver: "seasonal",
          affects: "look",
          style: "cinematic",
          intensity: "bold",
        },
      });
      const res = mockRes();
      await handlers.patchConfig(req, res);

      expect(res._body.artistTemplate).toBe("dream");
      expect(res._body.simpleInteractions).toEqual(["timeOfDay", "sound"]);
      expect(res._body.contextBehavior.driver).toBe("seasonal");
    });

    it("rejects patch that results in invalid config", async () => {
      // Remove required evolution phases
      const req = mockReq({ projectId }, {
        evolution: { phases: [] },
      });
      const res = mockRes();
      await handlers.patchConfig(req, res);

      expect(res.statusCode).toBe(422);
    });

    it("does not broadcast when project is not running", async () => {
      await handlers.stopProject(mockReq({ projectId }, {}), mockRes());
      const broadcastSpy = vi.spyOn(broadcaster, "broadcast");

      await handlers.patchConfig(
        mockReq({ projectId }, { mood: 0.1 }),
        mockRes(),
      );

      expect(broadcastSpy).not.toHaveBeenCalled();
    });
  });

  describe("PATCH state — adjust runtime parameters", () => {
    it("partially updates state parameters", async () => {
      const broadcastSpy = vi.spyOn(broadcaster, "broadcast");

      const req = mockReq({ projectId }, {
        parameters: { breathingIntensity: 0.95, colorTemperature: 0.4 },
      });
      const res = mockRes();
      await handlers.patchState(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._body.parameters.breathingIntensity).toBe(0.95);
      expect(res._body.parameters.colorTemperature).toBe(0.4);
      // Preserved
      expect(res._body.parameters.parallaxShift).toBeDefined();
      expect(res._body.currentPhaseLabel).toBe("calm");

      expect(broadcastSpy).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({ type: "state_updated" }),
      );
    });

    it("jumps to a different evolution phase", async () => {
      const req = mockReq({ projectId }, {
        currentPhaseLabel: "sunset",
        timeOffsetSeconds: 86400 * 20,
      });
      const res = mockRes();
      await handlers.patchState(req, res);

      expect(res._body.currentPhaseLabel).toBe("sunset");
      expect(res._body.timeOffsetSeconds).toBe(86400 * 20);
    });
  });

  describe("POST events — push interaction triggers", () => {
    it("appends events to the log", async () => {
      const broadcastSpy = vi.spyOn(broadcaster, "broadcast");

      const req = mockReq({ projectId }, {
        events: [
          { event: "viewer_close" },
          { event: "sound_peak" },
        ],
      });
      const res = mockRes();
      await handlers.pushEvents(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._body.appended).toBe(2);
      expect(res._body.eventsLog).toHaveLength(2);
      expect(res._body.eventsLog[0].event).toBe("viewer_close");
      expect(res._body.eventsLog[0].t).toBeGreaterThanOrEqual(0);
      expect(res._body.eventsLog[1].event).toBe("sound_peak");

      expect(broadcastSpy).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({ type: "state_event" }),
      );
    });

    it("preserves custom timestamps", async () => {
      const req = mockReq({ projectId }, {
        events: [{ t: 42.5, event: "custom_trigger" }],
      });
      const res = mockRes();
      await handlers.pushEvents(req, res);

      expect(res._body.eventsLog[0].t).toBe(42.5);
    });

    it("accumulates events across multiple pushes", async () => {
      await handlers.pushEvents(
        mockReq({ projectId }, { events: [{ event: "first" }] }),
        mockRes(),
      );
      const res = mockRes();
      await handlers.pushEvents(
        mockReq({ projectId }, { events: [{ event: "second" }] }),
        res,
      );

      expect(res._body.eventsLog).toHaveLength(2);
      expect(res._body.eventsLog[0].event).toBe("first");
      expect(res._body.eventsLog[1].event).toBe("second");
    });

    it("rejects events on stopped projects", async () => {
      await handlers.stopProject(mockReq({ projectId }, {}), mockRes());

      const res = mockRes();
      await handlers.pushEvents(
        mockReq({ projectId }, { events: [{ event: "test" }] }),
        res,
      );

      expect(res.statusCode).toBe(409);
      expect(res._body.code).toBe("project_not_running");
    });

    it("rejects empty events array", async () => {
      const res = mockRes();
      await handlers.pushEvents(
        mockReq({ projectId }, { events: [] }),
        res,
      );

      expect(res.statusCode).toBe(400);
    });
  });

  describe("PUT config — full replacement", () => {
    it("replaces entire config", async () => {
      const newConfig = buildTestConfig({
        title: "Completely New Config",
        mood: 0.99,
        artistTemplate: "seasonal",
      });

      const req = mockReq({ projectId }, newConfig);
      const res = mockRes();
      await handlers.replaceConfig(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._body.title).toBe("Completely New Config");
      expect(res._body.mood).toBe(0.99);
    });
  });

  describe("Lifecycle operations", () => {
    it("stop → run cycle preserves state", async () => {
      // Push some events first
      await handlers.pushEvents(
        mockReq({ projectId }, { events: [{ event: "test_event" }] }),
        mockRes(),
      );

      // Stop
      const stopRes = mockRes();
      await handlers.stopProject(mockReq({ projectId }, {}), stopRes);
      expect(stopRes._body.status).toBe("stopped");

      // Run again
      const runRes = mockRes();
      await handlers.runProject(mockReq({ projectId }, {}), runRes);
      expect(runRes._body.status).toBe("running");

      // State preserved (events still there)
      const project = await store.get(projectId);
      expect(project!.state.eventsLog).toHaveLength(1);
      expect(project!.state.eventsLog[0].event).toBe("test_event");
    });

    it("reset clears state to initial from config", async () => {
      // Modify state
      await handlers.patchState(
        mockReq({ projectId }, { parameters: { breathingIntensity: 0.99 } }),
        mockRes(),
      );
      await handlers.pushEvents(
        mockReq({ projectId }, { events: [{ event: "should_be_cleared" }] }),
        mockRes(),
      );

      // Reset
      const res = mockRes();
      await handlers.resetProject(mockReq({ projectId }, {}), res);

      expect(res.statusCode).toBe(200);
      expect(res._body.eventsLog).toHaveLength(0);
      expect(res._body.parameters.breathingIntensity).toBe(0.3); // From config
    });
  });
});
