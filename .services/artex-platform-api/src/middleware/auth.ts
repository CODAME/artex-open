/**
 * Authentication middleware.
 *
 * Phase 1: API key validation (Bearer token = API key).
 * Phase 2: Add Firebase Auth JWT verification alongside API keys.
 * Phase 3: Add OAuth2 token introspection.
 *
 * The middleware attaches a `caller` object to the request with
 * identity and permission context.
 */

import type { Request, Response, NextFunction } from "express";

export interface ApiCaller {
  /** Unique caller identifier (API key ID or user UID). */
  callerId: string;
  /** How the caller authenticated. */
  authMethod: "api_key" | "firebase_jwt" | "oauth2";
  /** Scopes/permissions granted. */
  scopes: string[];
}

declare global {
  namespace Express {
    interface Request {
      caller?: ApiCaller;
    }
  }
}

/**
 * Phase 1: Simple API key validation.
 *
 * In production, keys are stored in Firestore with associated
 * scopes and rate limits. This implementation validates against
 * an in-memory store for development and a Firestore lookup
 * for production.
 */
export const authenticate = (
  validateApiKey: (key: string) => Promise<ApiCaller | null>,
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({
        code: "missing_auth",
        message: "Authorization header with Bearer token is required.",
      });
      return;
    }

    const token = authHeader.slice(7);

    try {
      const caller = await validateApiKey(token);
      if (!caller) {
        res.status(401).json({
          code: "invalid_auth",
          message: "Invalid or expired API key.",
        });
        return;
      }

      req.caller = caller;
      next();
    } catch (err) {
      res.status(500).json({
        code: "auth_error",
        message: "Authentication service unavailable.",
      });
    }
  };
};

/**
 * Scope guard — checks that the caller has the required scope.
 */
export const requireScope = (scope: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.caller) {
      res.status(401).json({ code: "unauthenticated", message: "Not authenticated." });
      return;
    }

    if (!req.caller.scopes.includes(scope) && !req.caller.scopes.includes("*")) {
      res.status(403).json({
        code: "insufficient_scope",
        message: `This operation requires the '${scope}' scope.`,
      });
      return;
    }

    next();
  };
};

/**
 * Development-only: accepts any Bearer token and assigns full access.
 */
export const devAuthValidator = async (key: string): Promise<ApiCaller | null> => {
  if (!key || key.length < 8) return null;
  return {
    callerId: `dev-${key.slice(0, 8)}`,
    authMethod: "api_key",
    scopes: ["*"],
  };
};
