/**
 * Project storage interface and in-memory implementation.
 *
 * The interface is storage-agnostic — swap the implementation
 * for Firestore, PostgreSQL, or any other backend.
 *
 * The in-memory implementation is used for development and testing.
 * Production uses Firestore (see firestoreProjectStore.ts).
 */

import type { ConfigJson, StateJson } from "@artex/contract";
import type { ProjectPackageData } from "@artex/contract";
import type { Project, ProjectSummary, ProjectStatus } from "../types/api.js";
import { v4 as uuid } from "uuid";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ProjectStore {
  create(params: {
    config: ConfigJson;
    state: StateJson;
    packageData: ProjectPackageData | null;
    instanceId?: string;
  }): Promise<Project>;

  get(projectId: string): Promise<Project | null>;

  list(params: {
    limit: number;
    offset: number;
    status?: string;
  }): Promise<{
    projects: ProjectSummary[];
    total: number;
    limit: number;
    offset: number;
  }>;

  updateConfig(projectId: string, config: ConfigJson): Promise<ConfigJson>;
  updateState(projectId: string, state: StateJson): Promise<StateJson>;
  updatePackageData(projectId: string, data: ProjectPackageData): Promise<ProjectPackageData>;

  setStatus(projectId: string, status: ProjectStatus, instanceId?: string): Promise<Project>;

  delete(projectId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// In-memory implementation (dev/test)
// ---------------------------------------------------------------------------

export const createInMemoryProjectStore = (): ProjectStore => {
  const projects = new Map<string, Project>();

  return {
    async create({ config, state, packageData, instanceId }) {
      const projectId = uuid();
      const now = new Date().toISOString();

      const project: Project = {
        projectId,
        status: "draft",
        config,
        state: { ...state, artworkId: projectId },
        packageData,
        createdAt: now,
        updatedAt: now,
        activeSubscribers: 0,
        instanceId,
      };

      projects.set(projectId, project);
      return project;
    },

    async get(projectId) {
      return projects.get(projectId) ?? null;
    },

    async list({ limit, offset, status }) {
      let entries = [...projects.values()];

      if (status) {
        entries = entries.filter((p) => p.status === status);
      }

      // Sort by updatedAt descending
      entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      const total = entries.length;
      const page = entries.slice(offset, offset + limit);

      return {
        projects: page.map((p) => ({
          projectId: p.projectId,
          title: p.config.title,
          artistName: p.config.artistName,
          status: p.status,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          activeSubscribers: p.activeSubscribers,
          instanceId: p.instanceId,
        })),
        total,
        limit,
        offset,
      };
    },

    async updateConfig(projectId, config) {
      const project = projects.get(projectId);
      if (!project) throw new Error(`Project ${projectId} not found`);

      project.config = config;
      project.updatedAt = new Date().toISOString();
      return config;
    },

    async updateState(projectId, state) {
      const project = projects.get(projectId);
      if (!project) throw new Error(`Project ${projectId} not found`);

      project.state = state;
      project.updatedAt = new Date().toISOString();
      return state;
    },

    async updatePackageData(projectId, data) {
      const project = projects.get(projectId);
      if (!project) throw new Error(`Project ${projectId} not found`);

      project.packageData = data;
      project.updatedAt = new Date().toISOString();
      return data;
    },

    async setStatus(projectId, status, instanceId) {
      const project = projects.get(projectId);
      if (!project) throw new Error(`Project ${projectId} not found`);

      project.status = status;
      if (instanceId) project.instanceId = instanceId;
      project.updatedAt = new Date().toISOString();
      return project;
    },

    async delete(projectId) {
      projects.delete(projectId);
    },
  };
};
