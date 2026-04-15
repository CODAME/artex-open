/**
 * Firebase Auth validator.
 *
 * Validates Firebase Auth JWT tokens so external apps can authenticate
 * using the same login system as the ARTEX Creator Studio.
 *
 * Flow for external apps:
 *
 * 1. User logs into ARTEX (via Creator Studio or a Firebase Auth client)
 * 2. External app obtains the user's Firebase ID token:
 *    - If the external app embeds Firebase Auth SDK:
 *        const token = await firebase.auth().currentUser.getIdToken()
 *    - If using a service account (server-to-server):
 *        Use Firebase Admin SDK to create custom tokens
 * 3. External app passes the token to the ARTEX Platform API:
 *        Authorization: Bearer {firebase-id-token}
 * 4. This middleware verifies the token and extracts the user identity
 *
 * The user's UID, email, and custom claims become the ApiCaller identity.
 * Scopes can be derived from Firebase custom claims set on the user
 * (e.g., { artexScopes: ["projects:read", "projects:write"] }).
 */

import type { ApiCaller } from "./auth.js";

// ---------------------------------------------------------------------------
// Firebase Admin types (imported dynamically to avoid hard dependency)
// ---------------------------------------------------------------------------

interface FirebaseDecodedToken {
  uid: string;
  email?: string;
  name?: string;
  /** Custom claims set via Firebase Admin SDK. */
  artexScopes?: string[];
  artexRole?: "viewer" | "creator" | "admin";
  [key: string]: unknown;
}

interface FirebaseAuthVerifier {
  verifyIdToken(token: string): Promise<FirebaseDecodedToken>;
}

// ---------------------------------------------------------------------------
// Validator factory
// ---------------------------------------------------------------------------

/**
 * Default scopes based on ARTEX role custom claims.
 *
 * Set custom claims on Firebase users via Admin SDK:
 *   admin.auth().setCustomUserClaims(uid, { artexRole: "creator" })
 */
const ROLE_SCOPES: Record<string, string[]> = {
  admin: ["*"],
  creator: ["projects:read", "projects:write"],
  viewer: ["projects:read"],
};

const DEFAULT_SCOPES = ["projects:read"];

/**
 * Creates a validator that verifies Firebase Auth JWTs.
 *
 * Usage in server.ts:
 *
 *   import admin from "firebase-admin";
 *   admin.initializeApp();
 *
 *   const authValidator = createFirebaseAuthValidator(admin.auth());
 *
 * Or combined with API key fallback:
 *
 *   const authValidator = createCombinedValidator(
 *     createFirebaseAuthValidator(admin.auth()),
 *     createFirestoreApiKeyValidator(admin.firestore()),
 *   );
 */
export const createFirebaseAuthValidator = (
  firebaseAuth: FirebaseAuthVerifier,
): ((token: string) => Promise<ApiCaller | null>) => {

  return async (token: string): Promise<ApiCaller | null> => {
    try {
      const decoded = await firebaseAuth.verifyIdToken(token);

      // Determine scopes from custom claims
      let scopes: string[];
      if (decoded.artexScopes && Array.isArray(decoded.artexScopes)) {
        // Explicit scopes take priority
        scopes = decoded.artexScopes;
      } else if (decoded.artexRole && ROLE_SCOPES[decoded.artexRole]) {
        // Fall back to role-based scopes
        scopes = ROLE_SCOPES[decoded.artexRole];
      } else {
        // Default: read-only access
        scopes = DEFAULT_SCOPES;
      }

      return {
        callerId: decoded.uid,
        authMethod: "firebase_jwt",
        scopes,
      };
    } catch {
      // Token verification failed — not a valid Firebase JWT
      return null;
    }
  };
};

// ---------------------------------------------------------------------------
// Combined validator: try Firebase JWT first, fall back to API key
// ---------------------------------------------------------------------------

/**
 * Chains multiple validators. Tries each in order, returns the first
 * successful result. This allows both Firebase-authenticated users
 * AND API-key-authenticated services to use the same endpoints.
 *
 * Usage:
 *   const authValidator = createCombinedValidator(
 *     createFirebaseAuthValidator(admin.auth()),  // Users with Firebase login
 *     createFirestoreApiKeyValidator(db),          // Server-to-server API keys
 *     devAuthValidator,                            // Dev fallback (remove in prod)
 *   );
 */
export const createCombinedValidator = (
  ...validators: Array<(token: string) => Promise<ApiCaller | null>>
): ((token: string) => Promise<ApiCaller | null>) => {

  return async (token: string): Promise<ApiCaller | null> => {
    for (const validator of validators) {
      const result = await validator(token);
      if (result) return result;
    }
    return null;
  };
};
