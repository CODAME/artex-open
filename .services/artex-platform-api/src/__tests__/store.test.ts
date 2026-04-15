import { describe, it, expect, beforeEach } from "vitest";
import { createInMemoryProjectStore, type ProjectStore } from "../store/projectStore.js";
import { buildTestConfig, buildTestState } from "./helpers.js";

describe("InMemoryProjectStore", () => {
  let store: ProjectStore;

  beforeEach(() => {
    store = createInMemoryProjectStore();
  });

  describe("create", () => {
    it("creates a project with draft status", async () => {
      const config = buildTestConfig();
      const state = buildTestState(config);
      const project = await store.create({ config, state, packageData: null });

      expect(project.projectId).toBeDefined();
      expect(project.status).toBe("draft");
      expect(project.config.title).toBe("Test Artwork");
      expect(project.state.currentPhaseLabel).toBe("calm");
      expect(project.createdAt).toBeDefined();
    });

    it("generates unique project IDs", async () => {
      const config = buildTestConfig();
      const state = buildTestState(config);
      const p1 = await store.create({ config, state, packageData: null });
      const p2 = await store.create({ config, state, packageData: null });

      expect(p1.projectId).not.toBe(p2.projectId);
    });

    it("assigns artworkId to state", async () => {
      const config = buildTestConfig();
      const state = buildTestState(config);
      const project = await store.create({ config, state, packageData: null });

      expect(project.state.artworkId).toBe(project.projectId);
    });

    it("stores instanceId when provided", async () => {
      const config = buildTestConfig();
      const state = buildTestState(config);
      const project = await store.create({
        config, state, packageData: null, instanceId: "gallery-1",
      });

      expect(project.instanceId).toBe("gallery-1");
    });
  });

  describe("get", () => {
    it("returns null for non-existent project", async () => {
      const result = await store.get("non-existent");
      expect(result).toBeNull();
    });

    it("returns the project by ID", async () => {
      const config = buildTestConfig();
      const state = buildTestState(config);
      const created = await store.create({ config, state, packageData: null });
      const fetched = await store.get(created.projectId);

      expect(fetched).not.toBeNull();
      expect(fetched!.projectId).toBe(created.projectId);
      expect(fetched!.config.title).toBe("Test Artwork");
    });
  });

  describe("list", () => {
    it("returns empty list when no projects", async () => {
      const result = await store.list({ limit: 50, offset: 0 });
      expect(result.projects).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("paginates results", async () => {
      const config = buildTestConfig();
      for (let i = 0; i < 5; i++) {
        await store.create({ config, state: buildTestState(config), packageData: null });
      }

      const page1 = await store.list({ limit: 2, offset: 0 });
      expect(page1.projects).toHaveLength(2);
      expect(page1.total).toBe(5);

      const page2 = await store.list({ limit: 2, offset: 2 });
      expect(page2.projects).toHaveLength(2);
    });

    it("filters by status", async () => {
      const config = buildTestConfig();
      const p1 = await store.create({ config, state: buildTestState(config), packageData: null });
      const p2 = await store.create({ config, state: buildTestState(config), packageData: null });
      await store.setStatus(p1.projectId, "running");

      const running = await store.list({ limit: 50, offset: 0, status: "running" });
      expect(running.projects).toHaveLength(1);
      expect(running.projects[0].projectId).toBe(p1.projectId);

      const drafts = await store.list({ limit: 50, offset: 0, status: "draft" });
      expect(drafts.projects).toHaveLength(1);
    });
  });

  describe("updateConfig", () => {
    it("updates config and updatedAt", async () => {
      const config = buildTestConfig();
      const project = await store.create({ config, state: buildTestState(config), packageData: null });
      const originalUpdatedAt = project.updatedAt;

      // Small delay to ensure timestamp changes
      await new Promise((r) => setTimeout(r, 10));

      const newConfig = buildTestConfig({ title: "Updated Title", mood: 0.8 });
      await store.updateConfig(project.projectId, newConfig);

      const fetched = await store.get(project.projectId);
      expect(fetched!.config.title).toBe("Updated Title");
      expect(fetched!.updatedAt).not.toBe(originalUpdatedAt);
    });

    it("throws for non-existent project", async () => {
      await expect(
        store.updateConfig("non-existent", buildTestConfig()),
      ).rejects.toThrow("not found");
    });
  });

  describe("updateState", () => {
    it("replaces the state", async () => {
      const config = buildTestConfig();
      const project = await store.create({ config, state: buildTestState(config), packageData: null });

      const newState = {
        ...project.state,
        parameters: { ...project.state.parameters, breathingIntensity: 0.99 },
      };
      await store.updateState(project.projectId, newState);

      const fetched = await store.get(project.projectId);
      expect(fetched!.state.parameters.breathingIntensity).toBe(0.99);
    });
  });

  describe("setStatus", () => {
    it("transitions project status", async () => {
      const config = buildTestConfig();
      const project = await store.create({ config, state: buildTestState(config), packageData: null });

      await store.setStatus(project.projectId, "running", "instance-1");

      const fetched = await store.get(project.projectId);
      expect(fetched!.status).toBe("running");
      expect(fetched!.instanceId).toBe("instance-1");
    });
  });

  describe("delete", () => {
    it("removes the project", async () => {
      const config = buildTestConfig();
      const project = await store.create({ config, state: buildTestState(config), packageData: null });

      await store.delete(project.projectId);

      const fetched = await store.get(project.projectId);
      expect(fetched).toBeNull();
    });
  });
});
