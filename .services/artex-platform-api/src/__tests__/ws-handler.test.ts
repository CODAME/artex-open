import { describe, it, expect } from "vitest";
import { extractProjectIdFromUrl, extractTokenFromUpgrade } from "../ws/handler.js";

describe("extractProjectIdFromUrl", () => {
  it("extracts project ID from valid path", () => {
    expect(extractProjectIdFromUrl("/v1/ws/projects/abc-123/state")).toBe("abc-123");
  });

  it("extracts UUID-style project IDs", () => {
    expect(
      extractProjectIdFromUrl("/v1/ws/projects/550e8400-e29b-41d4-a716-446655440000/state"),
    ).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("returns null for invalid paths", () => {
    expect(extractProjectIdFromUrl("/v1/projects/abc/state")).toBeNull();
    expect(extractProjectIdFromUrl("/v1/ws/abc/state")).toBeNull();
    expect(extractProjectIdFromUrl("/v1/ws/projects/")).toBeNull();
    expect(extractProjectIdFromUrl("")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(extractProjectIdFromUrl(undefined)).toBeNull();
  });
});

describe("extractTokenFromUpgrade", () => {
  it("extracts token from Authorization header", () => {
    const req = {
      headers: { authorization: "Bearer my-token-123", host: "localhost:8080" },
      url: "/v1/ws/projects/abc/state",
    };
    expect(extractTokenFromUpgrade(req as any)).toBe("my-token-123");
  });

  it("extracts token from query parameter", () => {
    const req = {
      headers: { host: "localhost:8080" },
      url: "/v1/ws/projects/abc/state?token=query-token-456",
    };
    expect(extractTokenFromUpgrade(req as any)).toBe("query-token-456");
  });

  it("prefers Authorization header over query param", () => {
    const req = {
      headers: { authorization: "Bearer header-token", host: "localhost:8080" },
      url: "/v1/ws/projects/abc/state?token=query-token",
    };
    expect(extractTokenFromUpgrade(req as any)).toBe("header-token");
  });

  it("returns null when no token available", () => {
    const req = {
      headers: { host: "localhost:8080" },
      url: "/v1/ws/projects/abc/state",
    };
    expect(extractTokenFromUpgrade(req as any)).toBeNull();
  });
});
