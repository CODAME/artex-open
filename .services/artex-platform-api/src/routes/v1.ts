/**
 * v1 API routes.
 *
 * Focused on the two primary use cases:
 * 1. Run a new project on a given ARTEX instance
 * 2. Update an existing running project (config, state, events)
 *
 * All routes are prefixed with /v1.
 */

import { Router } from "express";
import type { ProjectStore } from "../store/projectStore.js";
import type { WsBroadcaster } from "../ws/broadcaster.js";
import { createProjectHandlers } from "../handlers/projects.js";
import { requireScope } from "../middleware/auth.js";

export const createV1Router = (
  store: ProjectStore,
  broadcaster: WsBroadcaster,
): Router => {
  const router = Router();
  const handlers = createProjectHandlers(store, broadcaster);

  // -------------------------------------------------------------------------
  // Health (no auth required — handled at app level)
  // -------------------------------------------------------------------------

  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    });
  });

  // -------------------------------------------------------------------------
  // USE CASE 1: Run a new project
  //
  // Flow:  POST /projects  →  POST /projects/:id/run
  //
  // Or combined: POST /projects?run=true&instanceId=xxx
  // -------------------------------------------------------------------------

  router.post("/projects",
    requireScope("projects:write"),
    async (req, res) => {
      const shouldRun = req.query.run === "true";
      const instanceId = req.query.instanceId as string | undefined;

      // Create the project
      await handlers.createProject(req, res);

      // If run=true and create succeeded, chain to run
      if (shouldRun && res.statusCode === 201) {
        const project = (res as any)._body; // Will need middleware to capture
        // For now, the client calls /run separately after create
      }
    },
  );

  router.get("/projects",
    requireScope("projects:read"),
    handlers.listProjects,
  );

  // -------------------------------------------------------------------------
  // USE CASE 2: Update a running project
  //
  // Primary endpoints:
  //   PATCH /projects/:id/config     — live-tune config
  //   PATCH /projects/:id/state      — adjust runtime parameters
  //   POST  /projects/:id/state/events — push interaction events
  //
  // Supporting:
  //   GET   /projects/:id            — read current state
  //   PUT   /projects/:id/config     — full config replacement
  //   POST  /projects/:id/run        — start/resume
  //   POST  /projects/:id/stop       — stop
  //   POST  /projects/:id/reset      — reset state
  // -------------------------------------------------------------------------

  router.get("/projects/:projectId",
    requireScope("projects:read"),
    handlers.getProject,
  );

  router.delete("/projects/:projectId",
    requireScope("projects:write"),
    handlers.deleteProject,
  );

  // Config
  router.get("/projects/:projectId/config",
    requireScope("projects:read"),
    async (req, res) => {
      const project = await store.get(req.params.projectId);
      if (!project) {
        res.status(404).json({ code: "project_not_found", message: "Project not found." });
        return;
      }
      res.json(project.config);
    },
  );

  router.put("/projects/:projectId/config",
    requireScope("projects:write"),
    handlers.replaceConfig,
  );

  router.patch("/projects/:projectId/config",
    requireScope("projects:write"),
    handlers.patchConfig,
  );

  // State
  router.get("/projects/:projectId/state",
    requireScope("projects:read"),
    async (req, res) => {
      const project = await store.get(req.params.projectId);
      if (!project) {
        res.status(404).json({ code: "project_not_found", message: "Project not found." });
        return;
      }
      res.json(project.state);
    },
  );

  router.patch("/projects/:projectId/state",
    requireScope("projects:write"),
    handlers.patchState,
  );

  router.post("/projects/:projectId/state/events",
    requireScope("projects:write"),
    handlers.pushEvents,
  );

  // Package data
  router.get("/projects/:projectId/package",
    requireScope("projects:read"),
    async (req, res) => {
      const project = await store.get(req.params.projectId);
      if (!project) {
        res.status(404).json({ code: "project_not_found", message: "Project not found." });
        return;
      }
      if (!project.packageData) {
        res.status(404).json({ code: "no_package_data", message: "No package data set." });
        return;
      }
      res.json(project.packageData);
    },
  );

  // Lifecycle
  router.post("/projects/:projectId/run",
    requireScope("projects:write"),
    handlers.runProject,
  );

  router.post("/projects/:projectId/stop",
    requireScope("projects:write"),
    handlers.stopProject,
  );

  router.post("/projects/:projectId/reset",
    requireScope("projects:write"),
    handlers.resetProject,
  );

  return router;
};
