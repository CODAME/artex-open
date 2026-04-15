/**
 * WebSocket connection handler.
 *
 * Endpoint: ws(s)://{host}/v1/ws/projects/{projectId}/state
 *
 * Protocol:
 * - Server → Client: WsServerMessage (config_updated, state_updated, state_event, etc.)
 * - Client → Server: WsClientMessage (patch_state, push_events, ping)
 *
 * Clients receive broadcasts for the subscribed project AND can push
 * state changes directly over the WebSocket (useful for high-frequency
 * updates like live sensor data or animation parameter tweaking).
 *
 * Future: Option C extension frames will use a separate endpoint
 * ws(s)://{host}/v1/ws/projects/{projectId}/extensions
 */

import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import type { ProjectStore } from "../store/projectStore.js";
import type { WsBroadcaster } from "./broadcaster.js";
import type {
  WsClientMessage,
  WsServerMessage,
  WsError,
} from "../types/api.js";
import type { StateJson } from "@artex/contract";
import { deepMergePatch } from "../middleware/validate.js";

const MAX_EVENTS_PER_MESSAGE = 50;
const MAX_MESSAGE_SIZE = 64 * 1024; // 64KB

export interface WsHandlerDeps {
  store: ProjectStore;
  broadcaster: WsBroadcaster;
}

/**
 * Extract projectId from the WebSocket upgrade URL.
 * Expected path: /v1/ws/projects/{projectId}/state
 */
export const extractProjectIdFromUrl = (url: string | undefined): string | null => {
  if (!url) return null;
  const match = url.match(/\/v1\/ws\/projects\/([^/]+)\/state/);
  return match?.[1] ?? null;
};

/**
 * Authenticate the WebSocket upgrade request.
 * Uses the same Bearer token from query param or header.
 */
export const extractTokenFromUpgrade = (req: IncomingMessage): string | null => {
  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Fallback to query parameter (for browser WebSocket clients)
  const url = new URL(req.url ?? "", `http://${req.headers.host}`);
  return url.searchParams.get("token");
};

/**
 * Handle a new WebSocket connection for project state streaming.
 */
export const handleWsConnection = (
  ws: WebSocket,
  req: IncomingMessage,
  deps: WsHandlerDeps,
): void => {
  const { store, broadcaster } = deps;
  const projectId = extractProjectIdFromUrl(req.url);

  if (!projectId) {
    sendError(ws, "invalid_path", "Could not extract project ID from URL.");
    ws.close(4000, "Invalid path.");
    return;
  }

  // Validate project exists and is running
  store.get(projectId).then((project) => {
    if (!project) {
      sendError(ws, "project_not_found", "Project not found.");
      ws.close(4004, "Project not found.");
      return;
    }

    if (project.status !== "running") {
      sendError(ws, "project_not_running", "Project is not running. Call /run first.");
      ws.close(4009, "Project not running.");
      return;
    }

    // Subscribe to broadcasts
    const unsubscribe = broadcaster.subscribe(projectId, ws);

    // Send current state snapshot on connect
    const snapshot: WsServerMessage = {
      type: "state_updated",
      timestamp: new Date().toISOString(),
      state: project.state,
    };
    ws.send(JSON.stringify(snapshot));

    // Handle incoming messages from client
    ws.on("message", async (data) => {
      try {
        const raw = data.toString();
        if (raw.length > MAX_MESSAGE_SIZE) {
          sendError(ws, "message_too_large", "Message exceeds 64KB limit.");
          return;
        }

        const message = JSON.parse(raw) as WsClientMessage;
        await handleClientMessage(ws, projectId, message, deps);
      } catch (err) {
        sendError(ws, "invalid_message", "Could not parse message as JSON.");
      }
    });

    ws.on("close", () => {
      unsubscribe();
    });

    ws.on("error", () => {
      unsubscribe();
    });
  });
};

/**
 * Process an incoming WebSocket message from a client.
 */
const handleClientMessage = async (
  ws: WebSocket,
  projectId: string,
  message: WsClientMessage,
  deps: WsHandlerDeps,
): Promise<void> => {
  const { store, broadcaster } = deps;

  switch (message.type) {
    case "ping": {
      const pong: WsServerMessage = {
        type: "pong",
        timestamp: new Date().toISOString(),
      };
      ws.send(JSON.stringify(pong));
      break;
    }

    case "patch_state": {
      const project = await store.get(projectId);
      if (!project) return;

      const merged = deepMergePatch(project.state, message.patch) as StateJson;
      await store.updateState(projectId, merged);

      broadcaster.broadcast(projectId, {
        type: "state_updated",
        timestamp: new Date().toISOString(),
        state: merged,
      });
      break;
    }

    case "push_events": {
      if (!message.events?.length) return;
      if (message.events.length > MAX_EVENTS_PER_MESSAGE) {
        sendError(ws, "too_many_events", `Max ${MAX_EVENTS_PER_MESSAGE} events per message.`);
        return;
      }

      const project = await store.get(projectId);
      if (!project) return;

      const now = (Date.now() - new Date(project.state.installTimestamp).getTime()) / 1000;
      const timestamped = message.events.map((e) => ({
        t: e.t ?? now,
        event: e.event,
      }));

      const updatedState: StateJson = {
        ...project.state,
        eventsLog: [...project.state.eventsLog, ...timestamped],
      };

      await store.updateState(projectId, updatedState);

      broadcaster.broadcast(projectId, {
        type: "state_event",
        timestamp: new Date().toISOString(),
        events: timestamped,
      });
      break;
    }

    default: {
      sendError(ws, "unknown_message_type", `Unknown message type: ${(message as any).type}`);
    }
  }
};

const sendError = (ws: WebSocket, code: string, message: string): void => {
  if (ws.readyState !== ws.OPEN) return;
  const error: WsError = { type: "error", code, message };
  ws.send(JSON.stringify(error));
};
