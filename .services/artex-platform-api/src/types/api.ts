/**
 * API-layer types that extend the @artex/contract types with
 * platform concerns (lifecycle, metadata, WebSocket protocol).
 */

import type { ConfigJson, StateJson } from "@artex/contract";
import type { ProjectPackageData } from "@artex/contract";

// ---------------------------------------------------------------------------
// Project lifecycle
// ---------------------------------------------------------------------------

export type ProjectStatus = "draft" | "running" | "stopped" | "archived";

export interface ProjectMeta {
  projectId: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  /** Number of active WebSocket subscribers. */
  activeSubscribers: number;
  /** ARTEX instance this project is assigned to (for multi-instance deployments). */
  instanceId?: string;
}

export interface Project extends ProjectMeta {
  config: ConfigJson;
  state: StateJson;
  packageData: ProjectPackageData | null;
}

export interface ProjectSummary {
  projectId: string;
  title: string;
  artistName?: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  activeSubscribers: number;
  instanceId?: string;
}

// ---------------------------------------------------------------------------
// API request/response shapes
// ---------------------------------------------------------------------------

export interface CreateProjectRequest {
  config: ConfigJson;
  packageData?: ProjectPackageData;
  /** Target ARTEX instance to deploy to. Uses default if omitted. */
  instanceId?: string;
}

export interface RunProjectRequest {
  /** Target ARTEX instance. Required if project is not already assigned. */
  instanceId?: string;
  /** If true, reset state from config before starting. */
  resetState?: boolean;
}

export interface RunProjectResponse {
  projectId: string;
  status: "running";
  instanceId: string;
  wsUrl: string;
}

export interface PushEventsRequest {
  events: Array<{
    /** Timestamp offset (seconds). Server-assigned if omitted. */
    t?: number;
    /** Event identifier (e.g., "viewer_close", "sound_peak", "external_trigger"). */
    event: string;
  }>;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// WebSocket protocol
// ---------------------------------------------------------------------------

/**
 * Messages sent FROM the server TO WebSocket clients.
 */
export type WsServerMessage =
  | WsConfigUpdated
  | WsStateUpdated
  | WsStateReplaced
  | WsStateEvent
  | WsProjectStopped
  | WsError
  | WsPong;

export interface WsConfigUpdated {
  type: "config_updated";
  timestamp: string;
  /** Full config after update. */
  config: ConfigJson;
  /** Fields that changed (dot-notation paths). */
  changedPaths?: string[];
}

export interface WsStateUpdated {
  type: "state_updated";
  timestamp: string;
  /** Full state after update. */
  state: StateJson;
}

export interface WsStateReplaced {
  type: "state_replaced";
  timestamp: string;
  state: StateJson;
}

export interface WsStateEvent {
  type: "state_event";
  timestamp: string;
  events: Array<{ t: number; event: string }>;
}

export interface WsProjectStopped {
  type: "project_stopped";
  timestamp: string;
  reason: string;
}

export interface WsError {
  type: "error";
  code: string;
  message: string;
}

export interface WsPong {
  type: "pong";
  timestamp: string;
}

/**
 * Messages sent FROM WebSocket clients TO the server.
 * Clients can push state updates and events via WebSocket as an
 * alternative to REST — useful for high-frequency live updates.
 */
export type WsClientMessage =
  | WsClientPatchState
  | WsClientPushEvents
  | WsClientPing;

export interface WsClientPatchState {
  type: "patch_state";
  /** Partial StateJson fields to merge. */
  patch: Partial<StateJson>;
}

export interface WsClientPushEvents {
  type: "push_events";
  events: Array<{ t?: number; event: string }>;
}

export interface WsClientPing {
  type: "ping";
}

// ---------------------------------------------------------------------------
// Future: Option C — Remote Extension Protocol (reserved)
// ---------------------------------------------------------------------------

/**
 * Reserved namespace for remote extension registration.
 * External apps will be able to register shaders and push
 * MediaInputFrames over WebSocket without being bundled in-process.
 *
 * This is NOT implemented yet — these types document the future direction.
 */
export interface RemoteExtensionRegistration {
  type: "extension:register";
  extensionType: "shader" | "media-input";
  definition: unknown; // Will use ShaderExtensionDefinition | MediaInputAdapterDefinition
}

export interface RemoteMediaInputFrame {
  type: "extension:media-frame";
  adapterId: string;
  frame: {
    timestamp: number;
    audioLevel: number;
    bassLevel: number;
    transientLevel?: number;
    cameraLevel?: number;
    proximity?: number;
  };
}
