import { describe, it, expect } from "vitest";
import { devAuthValidator } from "../middleware/auth.js";
import { createFirebaseAuthValidator, createCombinedValidator } from "../middleware/firebaseAuth.js";

describe("devAuthValidator", () => {
  it("accepts tokens of 8+ characters", async () => {
    const result = await devAuthValidator("abcdefgh");
    expect(result).not.toBeNull();
    expect(result!.authMethod).toBe("api_key");
    expect(result!.scopes).toContain("*");
  });

  it("rejects tokens shorter than 8 characters", async () => {
    const result = await devAuthValidator("short");
    expect(result).toBeNull();
  });

  it("rejects empty tokens", async () => {
    const result = await devAuthValidator("");
    expect(result).toBeNull();
  });

  it("uses first 8 chars as caller ID prefix", async () => {
    const result = await devAuthValidator("my-test-token-123");
    expect(result!.callerId).toBe("dev-my-test-");
  });
});

describe("createFirebaseAuthValidator", () => {
  it("returns caller with scopes from artexRole claim", async () => {
    const mockAuth = {
      verifyIdToken: async () => ({
        uid: "user-123",
        email: "test@example.com",
        artexRole: "creator" as const,
      }),
    };

    const validator = createFirebaseAuthValidator(mockAuth);
    const result = await validator("fake-jwt-token");

    expect(result).not.toBeNull();
    expect(result!.callerId).toBe("user-123");
    expect(result!.authMethod).toBe("firebase_jwt");
    expect(result!.scopes).toContain("projects:read");
    expect(result!.scopes).toContain("projects:write");
  });

  it("returns admin scopes for admin role", async () => {
    const mockAuth = {
      verifyIdToken: async () => ({
        uid: "admin-1",
        artexRole: "admin" as const,
      }),
    };

    const validator = createFirebaseAuthValidator(mockAuth);
    const result = await validator("token");

    expect(result!.scopes).toContain("*");
  });

  it("uses explicit artexScopes over role", async () => {
    const mockAuth = {
      verifyIdToken: async () => ({
        uid: "user-1",
        artexRole: "viewer" as const,
        artexScopes: ["projects:write", "custom:scope"],
      }),
    };

    const validator = createFirebaseAuthValidator(mockAuth);
    const result = await validator("token");

    expect(result!.scopes).toEqual(["projects:write", "custom:scope"]);
  });

  it("defaults to read-only when no role or scopes", async () => {
    const mockAuth = {
      verifyIdToken: async () => ({ uid: "user-1" }),
    };

    const validator = createFirebaseAuthValidator(mockAuth);
    const result = await validator("token");

    expect(result!.scopes).toEqual(["projects:read"]);
  });

  it("returns null when verification fails", async () => {
    const mockAuth = {
      verifyIdToken: async () => { throw new Error("Invalid token"); },
    };

    const validator = createFirebaseAuthValidator(mockAuth);
    const result = await validator("bad-token");

    expect(result).toBeNull();
  });
});

describe("createCombinedValidator", () => {
  it("returns first successful result", async () => {
    const failValidator = async () => null;
    const successValidator = async (token: string) => ({
      callerId: "found",
      authMethod: "api_key" as const,
      scopes: ["*"],
    });

    const combined = createCombinedValidator(failValidator, successValidator);
    const result = await combined("any-token");

    expect(result).not.toBeNull();
    expect(result!.callerId).toBe("found");
  });

  it("returns null when all validators fail", async () => {
    const fail1 = async () => null;
    const fail2 = async () => null;

    const combined = createCombinedValidator(fail1, fail2);
    const result = await combined("bad-token");

    expect(result).toBeNull();
  });

  it("stops at first success (short-circuit)", async () => {
    let secondCalled = false;
    const first = async () => ({
      callerId: "first",
      authMethod: "api_key" as const,
      scopes: ["*"],
    });
    const second = async () => {
      secondCalled = true;
      return { callerId: "second", authMethod: "api_key" as const, scopes: ["*"] };
    };

    const combined = createCombinedValidator(first, second);
    await combined("token");

    expect(secondCalled).toBe(false);
  });
});
