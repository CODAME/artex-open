import { describe, it, expect, beforeEach, vi } from "vitest";
import { createWsBroadcaster, type WsBroadcaster } from "../ws/broadcaster.js";
import type { WsServerMessage } from "../types/api.js";

/**
 * Minimal WebSocket mock for testing the broadcaster.
 */
function createMockWs() {
  const listeners = new Map<string, Set<Function>>();
  return {
    OPEN: 1 as const,
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
    on(event: string, fn: Function) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
    },
    _trigger(event: string, ...args: any[]) {
      listeners.get(event)?.forEach((fn) => fn(...args));
    },
  };
}

describe("WsBroadcaster", () => {
  let broadcaster: WsBroadcaster;

  beforeEach(() => {
    broadcaster = createWsBroadcaster();
  });

  describe("subscribe / subscriberCount", () => {
    it("starts with zero subscribers", () => {
      expect(broadcaster.subscriberCount("proj-1")).toBe(0);
    });

    it("tracks subscriptions", () => {
      const ws = createMockWs();
      broadcaster.subscribe("proj-1", ws as any);
      expect(broadcaster.subscriberCount("proj-1")).toBe(1);
    });

    it("handles multiple subscribers per project", () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      broadcaster.subscribe("proj-1", ws1 as any);
      broadcaster.subscribe("proj-1", ws2 as any);
      expect(broadcaster.subscriberCount("proj-1")).toBe(2);
    });

    it("tracks subscribers per project independently", () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      broadcaster.subscribe("proj-1", ws1 as any);
      broadcaster.subscribe("proj-2", ws2 as any);
      expect(broadcaster.subscriberCount("proj-1")).toBe(1);
      expect(broadcaster.subscriberCount("proj-2")).toBe(1);
    });
  });

  describe("unsubscribe", () => {
    it("removes subscription via returned function", () => {
      const ws = createMockWs();
      const unsub = broadcaster.subscribe("proj-1", ws as any);
      expect(broadcaster.subscriberCount("proj-1")).toBe(1);

      unsub();
      expect(broadcaster.subscriberCount("proj-1")).toBe(0);
    });

    it("auto-unsubscribes on close", () => {
      const ws = createMockWs();
      broadcaster.subscribe("proj-1", ws as any);
      expect(broadcaster.subscriberCount("proj-1")).toBe(1);

      ws._trigger("close");
      expect(broadcaster.subscriberCount("proj-1")).toBe(0);
    });
  });

  describe("broadcast", () => {
    it("sends message to all subscribers of a project", () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      broadcaster.subscribe("proj-1", ws1 as any);
      broadcaster.subscribe("proj-1", ws2 as any);

      const msg: WsServerMessage = {
        type: "state_event",
        timestamp: "2026-01-01T00:00:00Z",
        events: [{ t: 0, event: "test" }],
      };

      broadcaster.broadcast("proj-1", msg);

      expect(ws1.send).toHaveBeenCalledOnce();
      expect(ws2.send).toHaveBeenCalledOnce();

      const sent = JSON.parse(ws1.send.mock.calls[0][0]);
      expect(sent.type).toBe("state_event");
      expect(sent.events[0].event).toBe("test");
    });

    it("does not send to subscribers of other projects", () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      broadcaster.subscribe("proj-1", ws1 as any);
      broadcaster.subscribe("proj-2", ws2 as any);

      broadcaster.broadcast("proj-1", {
        type: "state_event",
        timestamp: "now",
        events: [{ t: 0, event: "test" }],
      });

      expect(ws1.send).toHaveBeenCalledOnce();
      expect(ws2.send).not.toHaveBeenCalled();
    });

    it("skips closed WebSocket connections", () => {
      const ws = createMockWs();
      ws.readyState = 3; // CLOSED
      broadcaster.subscribe("proj-1", ws as any);

      broadcaster.broadcast("proj-1", {
        type: "pong",
        timestamp: "now",
      });

      expect(ws.send).not.toHaveBeenCalled();
    });

    it("does nothing when no subscribers", () => {
      // Should not throw
      broadcaster.broadcast("non-existent", {
        type: "pong",
        timestamp: "now",
      });
    });
  });

  describe("disconnectAll", () => {
    it("closes all connections for a project", () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      broadcaster.subscribe("proj-1", ws1 as any);
      broadcaster.subscribe("proj-1", ws2 as any);

      broadcaster.disconnectAll("proj-1");

      expect(ws1.close).toHaveBeenCalledWith(1000, "Project stopped.");
      expect(ws2.close).toHaveBeenCalledWith(1000, "Project stopped.");
      expect(broadcaster.subscriberCount("proj-1")).toBe(0);
    });

    it("does nothing for non-existent project", () => {
      // Should not throw
      broadcaster.disconnectAll("non-existent");
    });
  });
});
