/**
 * Project handlers — focused on the two primary use cases:
 *
 * 1. Run a new project on a given ARTEX instance
 * 2. Update an existing running project
 *
 * These handlers are thin wrappers around the ProjectStore.
 * They validate input, delegate to the store, and broadcast
 * changes to WebSocket subscribers.
 */

import type { Request, Response } from "express";
import { validateConfigJson, createStateFromConfig, normalizeProjectPackageData } from "@artex/contract";
import type { ConfigJson, StateJson } from "@artex/contract";
import type { ProjectStore } from "../store/projectStore.js";
import type { WsBroadcaster } from "../ws/broadcaster.js";
import type {
  CreateProjectRequest,
  RunProjectRequest,
  PushEventsRequest,
  Project,
} from "../types/api.js";
import { deepMergePatch } from "../middleware/validate.js";

export const createProjectHandlers = (
  store: ProjectStore,
  broadcaster: WsBroadcaster,
) => ({

  // -------------------------------------------------------------------------
  // USE CASE 1: Run a new project on an ARTEX instance
  // -------------------------------------------------------------------------

  /**
   * POST /v1/projects
   *
   * Creates a new project with the provided ConfigJson.
   * Starts in "draft" status. Call /run to activate it on an instance.
   */
  async createProject(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body as CreateProjectRequest;

      // Validate config against contract
      validateConfigJson(body.config);

      // Generate initial state from config
      const state = createStateFromConfig(body.config);

      // Normalize package data if provided
      const packageData = body.packageData
        ? normalizeProjectPackageData(body.packageData)
        : null;

      const project = await store.create({
        config: body.config,
        state,
        packageData,
        instanceId: body.instanceId,
      });

      res.status(201).json(project);
    } catch (err: any) {
      if (err.name === "PackageContractError") {
        res.status(422).json({ code: err.code, message: err.message });
        return;
      }
      res.status(400).json({
        code: "create_failed",
        message: err.message ?? "Failed to create project.",
      });
    }
  },

  /**
   * POST /v1/projects/:projectId/run
   *
   * Activates a project on a target ARTEX instance.
   * - Transitions status to "running"
   * - Optionally resets state from config
   * - Returns a WebSocket URL for real-time subscriptions
   *
   * If the project is already running, returns the current WS URL (idempotent).
   */
  async runProject(req: Request, res: Response): Promise<void> {
    const { projectId } = req.params;
    const body = (req.body ?? {}) as RunProjectRequest;

    const project = await store.get(projectId);
    if (!project) {
      res.status(404).json({ code: "project_not_found", message: "Project not found." });
      return;
    }

    // Reset state if requested
    if (body.resetState) {
      const freshState = createStateFromConfig(project.config);
      await store.updateState(projectId, freshState);
    }

    // Assign to instance
    const instanceId = body.instanceId ?? project.instanceId ?? "default";

    // Transition to running
    const updated = await store.setStatus(projectId, "running", instanceId);

    // Build WebSocket URL
    const wsHost = req.get("host") ?? "localhost:8080";
    const wsProtocol = req.secure ? "wss" : "ws";
    const wsUrl = `${wsProtocol}://${wsHost}/v1/ws/projects/${projectId}/state`;

    res.json({
      projectId,
      status: "running",
      instanceId,
      wsUrl,
    });
  },

  /**
   * POST /v1/projects — shorthand: create AND run in one call.
   *
   * POST /v1/projects?run=true&instanceId=xxx
   *
   * Convenience for the "deploy new project to instance" use case.
   */
  async createAndRun(req: Request, res: Response): Promise<void> {
    // This is handled in the route layer by checking query params
    // and chaining createProject → runProject.
  },

  // -------------------------------------------------------------------------
  // USE CASE 2: Update an existing running project
  // -------------------------------------------------------------------------

  /**
   * PUT /v1/projects/:projectId/config
   *
   * Replaces the entire ConfigJson of a running (or draft) project.
   * If running, broadcasts config_updated to all WS subscribers.
   */
  async replaceConfig(req: Request, res: Response): Promise<void> {
    const { projectId } = req.params;
    const config = req.body as ConfigJson;

    const project = await store.get(projectId);
    if (!project) {
      res.status(404).json({ code: "project_not_found", message: "Project not found." });
      return;
    }

    try {
      validateConfigJson(config);
    } catch (err: any) {
      res.status(422).json({ code: err.code ?? "invalid_config", message: err.message });
      return;
    }

    const updated = await store.updateConfig(projectId, config);

    // Broadcast to subscribers if running
    if (project.status === "running") {
      broadcaster.broadcast(projectId, {
        type: "config_updated",
        timestamp: new Date().toISOString(),
        config: updated,
      });
    }

    res.json(updated);
  },

  /**
   * PATCH /v1/projects/:projectId/config
   *
   * Applies a JSON Merge Patch (RFC 7396) to the ConfigJson.
   * Only the provided fields are updated. Validated after merge.
   * Broadcasts config_updated if project is running.
   *
   * This is the primary endpoint for live-tuning a running experience:
   * - Adjust mood, animation speed, breathing intensity
   * - Change evolution phases
   * - Toggle interactions
   * - Swap shader modules
   */
  async patchConfig(req: Request, res: Response): Promise<void> {
    const { projectId } = req.params;
    const patch = req.body;

    const project = await store.get(projectId);
    if (!project) {
      res.status(404).json({ code: "project_not_found", message: "Project not found." });
      return;
    }

    try {
      // Merge patch with existing config
      const merged = deepMergePatch(project.config, patch) as ConfigJson;
      validateConfigJson(merged);

      const updated = await store.updateConfig(projectId, merged);

      if (project.status === "running") {
        broadcaster.broadcast(projectId, {
          type: "config_updated",
          timestamp: new Date().toISOString(),
          config: updated,
          changedPaths: Object.keys(patch),
        });
      }

      res.json(updated);
    } catch (err: any) {
      if (err.name === "PackageContractError") {
        res.status(422).json({ code: err.code, message: err.message });
        return;
      }
      res.status(400).json({ code: "patch_failed", message: err.message });
    }
  },

  /**
   * PATCH /v1/projects/:projectId/state
   *
   * Partially update runtime state. Useful for:
   * - Adjusting breathing intensity, color temperature in real-time
   * - Jumping to a different evolution phase
   * - Modifying time offset
   */
  async patchState(req: Request, res: Response): Promise<void> {
    const { projectId } = req.params;
    const patch = req.body;

    const project = await store.get(projectId);
    if (!project) {
      res.status(404).json({ code: "project_not_found", message: "Project not found." });
      return;
    }

    const merged = deepMergePatch(project.state, patch) as StateJson;
    const updated = await store.updateState(projectId, merged);

    if (project.status === "running") {
      broadcaster.broadcast(projectId, {
        type: "state_updated",
        timestamp: new Date().toISOString(),
        state: updated,
      });
    }

    res.json(updated);
  },

  /**
   * POST /v1/projects/:projectId/state/events
   *
   * Push interaction events into a running experience.
   * This is how external apps trigger effects:
   *
   * Example: { events: [{ event: "viewer_close" }, { event: "sound_peak" }] }
   *
   * Events are appended to StateJson.eventsLog and broadcast
   * to all WS subscribers for immediate rendering reaction.
   */
  async pushEvents(req: Request, res: Response): Promise<void> {
    const { projectId } = req.params;
    const body = req.body as PushEventsRequest;

    const project = await store.get(projectId);
    if (!project) {
      res.status(404).json({ code: "project_not_found", message: "Project not found." });
      return;
    }

    if (project.status !== "running") {
      res.status(409).json({
        code: "project_not_running",
        message: "Events can only be pushed to running projects.",
      });
      return;
    }

    if (!body.events?.length) {
      res.status(400).json({ code: "no_events", message: "At least one event is required." });
      return;
    }

    // Assign timestamps to events that don't have one
    const now = (Date.now() - new Date(project.state.installTimestamp).getTime()) / 1000;
    const timestamped = body.events.map((e) => ({
      t: e.t ?? now,
      event: e.event,
    }));

    // Append to events log
    const updatedState: StateJson = {
      ...project.state,
      eventsLog: [...project.state.eventsLog, ...timestamped],
    };

    await store.updateState(projectId, updatedState);

    // Broadcast event to subscribers immediately
    broadcaster.broadcast(projectId, {
      type: "state_event",
      timestamp: new Date().toISOString(),
      events: timestamped,
    });

    res.json({
      appended: timestamped.length,
      eventsLog: updatedState.eventsLog,
    });
  },

  // -------------------------------------------------------------------------
  // Supporting operations
  // -------------------------------------------------------------------------

  async getProject(req: Request, res: Response): Promise<void> {
    const project = await store.get(req.params.projectId);
    if (!project) {
      res.status(404).json({ code: "project_not_found", message: "Project not found." });
      return;
    }
    res.json(project);
  },

  async listProjects(req: Request, res: Response): Promise<void> {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const status = req.query.status as string | undefined;

    const result = await store.list({ limit, offset, status });
    res.json(result);
  },

  async stopProject(req: Request, res: Response): Promise<void> {
    const { projectId } = req.params;

    const project = await store.get(projectId);
    if (!project) {
      res.status(404).json({ code: "project_not_found", message: "Project not found." });
      return;
    }

    await store.setStatus(projectId, "stopped");

    // Notify all subscribers
    broadcaster.broadcast(projectId, {
      type: "project_stopped",
      timestamp: new Date().toISOString(),
      reason: "Stopped via API.",
    });

    // Close all WebSocket connections for this project
    broadcaster.disconnectAll(projectId);

    res.json({ projectId, status: "stopped" });
  },

  async resetProject(req: Request, res: Response): Promise<void> {
    const { projectId } = req.params;

    const project = await store.get(projectId);
    if (!project) {
      res.status(404).json({ code: "project_not_found", message: "Project not found." });
      return;
    }

    const freshState = createStateFromConfig(project.config);
    const updated = await store.updateState(projectId, freshState);

    if (project.status === "running") {
      broadcaster.broadcast(projectId, {
        type: "state_replaced",
        timestamp: new Date().toISOString(),
        state: updated,
      });
    }

    res.json(updated);
  },

  async deleteProject(req: Request, res: Response): Promise<void> {
    const { projectId } = req.params;

    const exists = await store.get(projectId);
    if (!exists) {
      res.status(404).json({ code: "project_not_found", message: "Project not found." });
      return;
    }

    // Disconnect subscribers first
    broadcaster.disconnectAll(projectId);
    await store.delete(projectId);

    res.status(204).send();
  },
});
