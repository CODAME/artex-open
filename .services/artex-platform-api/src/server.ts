/**
 * ARTEX Platform API server.
 *
 * Exposes REST endpoints for project CRUD and lifecycle management,
 * plus WebSocket endpoints for real-time state streaming.
 *
 * Usage:
 *   npm run dev    — development with hot reload
 *   npm start      — production
 *
 * Environment variables:
 *   PORT                — HTTP port (default: 8080)
 *   NODE_ENV            — "development" | "production"
 *   ARTEX_API_KEY_MODE  — "dev" (any 8+ char token) | "firestore" (validate against DB)
 *   CORS_ORIGINS        — Comma-separated allowed origins (default: "*" in dev)
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

import { createV1Router } from "./routes/v1.js";
import { authenticate, devAuthValidator } from "./middleware/auth.js";
import { createFirebaseAuthValidator, createCombinedValidator } from "./middleware/firebaseAuth.js";
import { createInMemoryProjectStore } from "./store/projectStore.js";
import { createWsBroadcaster } from "./ws/broadcaster.js";
import { handleWsConnection, extractProjectIdFromUrl, extractTokenFromUpgrade } from "./ws/handler.js";

const PORT = Number(process.env.PORT) || 8080;
const isDev = process.env.NODE_ENV !== "production";

// ---------------------------------------------------------------------------
// Initialize dependencies
// ---------------------------------------------------------------------------

// Storage: in-memory for dev, Firestore for production
const store = createInMemoryProjectStore();
// TODO: Production → createFirestoreProjectStore(admin.firestore())

// WebSocket broadcaster
const broadcaster = createWsBroadcaster();

// Auth validator
// ---------------------------------------------------------------------------
// Development: accepts any 8+ character token
// Production:  Firebase Auth JWT (same login as ARTEX Creator Studio)
//              + optional API key fallback for server-to-server
//
// To enable Firebase Auth:
//   1. npm install firebase-admin
//   2. import admin from "firebase-admin";
//   3. admin.initializeApp();
//   4. Replace authValidator below with:
//
//      const authValidator = createCombinedValidator(
//        createFirebaseAuthValidator(admin.auth()),  // Users with ARTEX login
//        devAuthValidator,                            // Remove in production
//      );
//
// External apps get tokens by:
//   - Embedding Firebase Auth SDK and using the user's existing ARTEX login
//   - Or calling firebase.auth().currentUser.getIdToken() after login
// ---------------------------------------------------------------------------
const authValidator = devAuthValidator;

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(cors({
  origin: isDev ? "*" : (process.env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()),
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Body parsing
app.use(express.json({ limit: "1mb" }));

// Rate limiting
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 1000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: "rate_limited", message: "Too many requests. Limit: 100/minute." },
}));

// Auth (skip for health endpoint)
app.use("/v1", (req, res, next) => {
  if (req.path === "/health") return next();
  return authenticate(authValidator)(req, res, next);
});

// API routes
app.use("/v1", createV1Router(store, broadcaster));

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ code: "not_found", message: "Endpoint not found." });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[API Error]", err);
  res.status(500).json({ code: "internal_error", message: "Internal server error." });
});

// ---------------------------------------------------------------------------
// HTTP + WebSocket server
// ---------------------------------------------------------------------------

const server = createServer(app);

const wss = new WebSocketServer({
  server,
  path: undefined, // Handle path matching ourselves
  verifyClient: (info, callback) => {
    // Verify the upgrade request targets a valid project state path
    const projectId = extractProjectIdFromUrl(info.req.url);
    if (!projectId) {
      callback(false, 400, "Invalid WebSocket path. Expected /v1/ws/projects/{id}/state");
      return;
    }

    // Verify auth token
    const token = extractTokenFromUpgrade(info.req);
    if (!token) {
      callback(false, 401, "Missing authentication token.");
      return;
    }

    authValidator(token).then((caller) => {
      if (!caller) {
        callback(false, 401, "Invalid authentication token.");
        return;
      }
      // Attach caller to request for downstream use
      (info.req as any).caller = caller;
      callback(true);
    }).catch(() => {
      callback(false, 500, "Authentication error.");
    });
  },
});

wss.on("connection", (ws, req) => {
  handleWsConnection(ws, req, { store, broadcaster });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  ARTEX Platform API                                      ║
║                                                          ║
║  REST:      http://localhost:${PORT}/v1                     ║
║  WebSocket: ws://localhost:${PORT}/v1/ws/projects/:id/state ║
║  Health:    http://localhost:${PORT}/v1/health               ║
║                                                          ║
║  Mode: ${isDev ? "development" : "production "}                                   ║
╚══════════════════════════════════════════════════════════╝
  `);
});

export { app, server };
