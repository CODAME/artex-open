/**
 * WebSocket broadcaster — manages per-project subscriber lists
 * and broadcasts state/config changes to all connected clients.
 *
 * This is the real-time backbone for "update a running experience":
 * when an external app PATCHes config or pushes events via REST,
 * the broadcaster pushes the change to every connected renderer
 * and observer over WebSocket.
 */

import type { WebSocket } from "ws";
import type { WsServerMessage } from "../types/api.js";

export interface WsBroadcaster {
  /** Add a subscriber for a project. Returns an unsubscribe function. */
  subscribe(projectId: string, ws: WebSocket): () => void;

  /** Broadcast a message to all subscribers of a project. */
  broadcast(projectId: string, message: WsServerMessage): void;

  /** Disconnect all subscribers for a project (e.g., when stopped). */
  disconnectAll(projectId: string): void;

  /** Get the count of active subscribers for a project. */
  subscriberCount(projectId: string): number;
}

export const createWsBroadcaster = (): WsBroadcaster => {
  const subscribers = new Map<string, Set<WebSocket>>();

  const getOrCreate = (projectId: string): Set<WebSocket> => {
    let set = subscribers.get(projectId);
    if (!set) {
      set = new Set();
      subscribers.set(projectId, set);
    }
    return set;
  };

  const cleanup = (projectId: string, ws: WebSocket): void => {
    const set = subscribers.get(projectId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        subscribers.delete(projectId);
      }
    }
  };

  return {
    subscribe(projectId, ws) {
      const set = getOrCreate(projectId);
      set.add(ws);

      // Auto-cleanup on close
      ws.on("close", () => cleanup(projectId, ws));

      return () => cleanup(projectId, ws);
    },

    broadcast(projectId, message) {
      const set = subscribers.get(projectId);
      if (!set || set.size === 0) return;

      const payload = JSON.stringify(message);

      for (const ws of set) {
        if (ws.readyState === ws.OPEN) {
          ws.send(payload);
        }
      }
    },

    disconnectAll(projectId) {
      const set = subscribers.get(projectId);
      if (!set) return;

      for (const ws of set) {
        if (ws.readyState === ws.OPEN) {
          ws.close(1000, "Project stopped.");
        }
      }

      subscribers.delete(projectId);
    },

    subscriberCount(projectId) {
      return subscribers.get(projectId)?.size ?? 0;
    },
  };
};
