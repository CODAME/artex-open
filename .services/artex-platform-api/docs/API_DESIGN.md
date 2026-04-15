# ARTEX External API — Design Document

> **Status:** Draft v1.0
> **Date:** 2026-04-15
> **Audience:** CODAME core team, external integration partners

---

## 1. Purpose

Enable external applications to:

1. **Run a new project** on a given ARTEX instance
2. **Update an existing running experience** in real-time (config, state, events)

These are the two initial use cases. The API is designed as a general-purpose interface
that third-party developers can build against.

---

## 2. Architecture

```
External App                ARTEX Platform API                ARTEX Instance
─────────────             ─────────────────────             ────────────────
                          ┌─────────────────────┐
  POST /projects    ──▶   │  Express REST API    │
  POST /run         ──▶   │  (Cloud Run)         │
  PATCH /config     ──▶   │                      │──▶  Firestore
  POST /events      ──▶   │  ┌─────────────────┐ │
                          │  │  WS Broadcaster  │─┼──▶  WebSocket ──▶  Renderer
  ws://state        ◀──▶  │  └─────────────────┘ │
                          └─────────────────────┘
```

The API extends the existing `artex-platform-api` Cloud Run service. It:

- Validates all input against `@artex/contract` types
- Stores projects in Firestore (in-memory for dev)
- Broadcasts changes to WebSocket subscribers for real-time rendering updates
- Enforces auth, rate limiting, and CORS

---

## 3. Use Case Flows

### Use Case 1: Run a New Project

```
External App                        Platform API
────────────                        ────────────
    │
    ├── POST /v1/projects ──────────▶ Validate ConfigJson
    │   { config: {...} }             Generate StateJson from config
    │                                 Store in Firestore
    │ ◀──────────── 201 Created ─────┤ Return { projectId, status: "draft" }
    │
    ├── POST /v1/projects/:id/run ──▶ Transition to "running"
    │   { instanceId: "gallery-1" }   Assign to instance
    │                                 Open for WS subscriptions
    │ ◀──────────── 200 OK ──────────┤ Return { status: "running", wsUrl }
    │
    └── (Renderer connects to wsUrl and begins rendering)
```

Combined shorthand (create + run in one call):
```
POST /v1/projects?run=true&instanceId=gallery-1
```

### Use Case 2: Update a Running Experience

**A. Live-tune configuration (e.g., adjust mood, swap shaders):**
```
PATCH /v1/projects/:id/config
Content-Type: application/merge-patch+json

{
  "mood": 0.8,
  "animation": { "baseSpeed": 1.5 },
  "artistTemplate": "flowing"
}

→ Config merged, validated, stored
→ config_updated broadcast to all WS subscribers
→ Renderer picks up change and applies immediately
```

**B. Push interaction events (e.g., external sensor triggers):**
```
POST /v1/projects/:id/state/events

{
  "events": [
    { "event": "viewer_close" },
    { "event": "sound_peak" }
  ]
}

→ Events timestamped and appended to eventsLog
→ state_event broadcast to all WS subscribers
→ Renderer triggers interaction effects
```

**C. High-frequency updates via WebSocket:**
```
ws://api.artex.live/v1/ws/projects/:id/state

Client sends:
  { "type": "patch_state", "patch": { "parameters": { "breathingIntensity": 0.9 } } }
  { "type": "push_events", "events": [{ "event": "proximity_change" }] }

Server broadcasts to all other subscribers.
```

---

## 4. Authentication Recommendation

### Phase 1: API Keys (Now)

Simple, fast to implement, appropriate for a known set of integration partners.

- Each external app gets an API key stored in Firestore
- Key is passed as `Authorization: Bearer {key}`
- Keys have scopes: `projects:read`, `projects:write`, `*`
- Rate limit: 100 req/min per key, 5 concurrent WS connections
- Key management via admin CLI or Firestore console

**Why start here:** You have no existing API consumers, so the overhead of OAuth2
is unjustified. API keys are trivial to issue, revoke, and rate-limit. They work
perfectly for server-to-server integrations (the most likely initial use case).

### Phase 2: Firebase Auth JWT (When user-context matters)

When external apps need to act on behalf of specific ARTEX users:

- Firebase Auth issues JWTs
- API validates JWTs alongside API keys
- User-scoped access: "this key can only access projects owned by user X"
- No new infrastructure — Firebase Auth is already in the stack

### Phase 3: OAuth2 (When third-party ecosystem grows)

When you have 10+ external developers building on ARTEX:

- Full OAuth2 authorization code flow
- Consent screen: "App X wants to manage your ARTEX projects"
- Scoped tokens with expiry and refresh
- Consider Auth0 or Firebase as the OAuth2 provider

---

## 5. WebSocket Protocol

### Connection

```
ws(s)://{host}/v1/ws/projects/{projectId}/state
```

Authentication via `Authorization` header or `?token=` query parameter.

### Server → Client Messages

| Type | When | Payload |
|------|------|---------|
| `state_updated` | State changes (PATCH or WS push) | Full StateJson |
| `config_updated` | Config changes (PUT/PATCH) | Full ConfigJson + changedPaths |
| `state_event` | Events pushed | Array of `{t, event}` |
| `state_replaced` | State reset | Full StateJson |
| `project_stopped` | Project stopped | reason string |
| `pong` | Response to ping | timestamp |
| `error` | Invalid message | code + message |

### Client → Server Messages

| Type | Purpose | Payload |
|------|---------|---------|
| `patch_state` | Update state params | Partial StateJson |
| `push_events` | Trigger interactions | Array of events |
| `ping` | Keep-alive | (none) |

### Limits

- Max message size: 64KB
- Max events per message: 50
- Max concurrent connections per API key: 5

---

## 6. API Endpoints Summary

### Core (Use Case 1 + 2)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/v1/projects` | Create a new project |
| `POST` | `/v1/projects/:id/run` | Start project on an instance |
| `PATCH` | `/v1/projects/:id/config` | Live-tune configuration |
| `PATCH` | `/v1/projects/:id/state` | Adjust runtime parameters |
| `POST` | `/v1/projects/:id/state/events` | Push interaction events |

### Supporting

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/v1/projects` | List projects |
| `GET` | `/v1/projects/:id` | Get full project |
| `PUT` | `/v1/projects/:id/config` | Replace full config |
| `POST` | `/v1/projects/:id/stop` | Stop project |
| `POST` | `/v1/projects/:id/reset` | Reset state |
| `DELETE` | `/v1/projects/:id` | Delete project |
| `GET` | `/v1/health` | Health check |

---

## 7. Option C: Future Extension Gateway

The API reserves the namespace `/v1/extensions/*` and the WebSocket path
`/v1/ws/projects/:id/extensions` for a future remote extension protocol.

### What It Enables

External apps will be able to:

1. **Register shaders remotely** — push GLSL source to a running experience
   without bundling in the renderer runtime
2. **Stream MediaInputFrames** — push live sensor data (audio, proximity, camera)
   from external hardware or apps directly into shader uniforms
3. **Register sandbox modules** — experimental remote rendering extensions

### Protocol Design (Future)

```
ws://{host}/v1/ws/projects/:id/extensions

Client sends:
  { "type": "extension:register", "extensionType": "media-input", "definition": {...} }
  { "type": "extension:media-frame", "adapterId": "ble-sensor", "frame": { audioLevel: 0.7, ... } }

Server relays to renderer:
  { "type": "extension:registered", "extensionId": "ble-sensor" }
  { "type": "extension:frame", "adapterId": "ble-sensor", "frame": {...} }
```

### Hooks Already in Place

The current implementation includes:

- `RemoteExtensionRegistration` and `RemoteMediaInputFrame` types in `types/api.ts`
- Reserved URL namespace in route definitions
- `WsBroadcaster` architecture that can be extended for extension channels
- `MediaInputFrame` contract from `@artex/extensions` is transport-agnostic

### What Needs to Be Built (Later)

- Extension authentication and capability negotiation
- Frame throttling and backpressure for high-frequency sensor data
- Extension lifecycle management (register, heartbeat, disconnect, cleanup)
- Security model: who can register extensions on which projects
- Renderer-side `RemoteMediaInputAdapter` that bridges WS frames to the extension host

---

## 8. File Structure

```
.services/artex-platform-api/
├── docs/
│   ├── API_DESIGN.md           ← This document
│   └── openapi.yaml            ← OpenAPI 3.1 specification
├── src/
│   ├── server.ts               ← Express + WS server entry point
│   ├── routes/
│   │   └── v1.ts               ← Route definitions
│   ├── handlers/
│   │   └── projects.ts         ← Request handlers for both use cases
│   ├── middleware/
│   │   ├── auth.ts             ← Authentication (API key → Firebase → OAuth2)
│   │   └── validate.ts         ← Contract validation middleware
│   ├── store/
│   │   └── projectStore.ts     ← Storage interface + in-memory implementation
│   ├── ws/
│   │   ├── broadcaster.ts      ← Per-project WS subscriber management
│   │   └── handler.ts          ← WS connection handler + client message processing
│   └── types/
│       └── api.ts              ← API-layer types, WS protocol, Option C reserved types
├── package.json
└── tsconfig.json
```

---

## 9. Development Quick Start

```bash
cd .services/artex-platform-api
npm install
npm run dev

# Create a project
curl -X POST http://localhost:8080/v1/projects \
  -H "Authorization: Bearer dev-token-12345678" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "version": 1,
      "title": "My Living Art",
      "story": "An interactive experience",
      "layers": { "base": { "parallaxDepth": 0.5, "breathingIntensity": 0.3, "textureDrift": 0.1 } },
      "animation": { "baseSpeed": 1.0, "breathingEnabled": true, "parallaxEnabled": true, "colorShiftEnabled": false },
      "evolution": { "mode": "timeBased", "durationDays": 30, "phases": [{ "startDay": 0, "label": "calm", "colorTemperatureShift": 0, "noiseIntensity": 0.1, "brightnessShift": 0 }] },
      "interaction": { "supportsProximity": true, "supportsAmbientLight": false, "events": [] },
      "constraints": { "protectedRegions": [] }
    }
  }'

# Run it on an instance
curl -X POST http://localhost:8080/v1/projects/{projectId}/run \
  -H "Authorization: Bearer dev-token-12345678" \
  -H "Content-Type: application/json" \
  -d '{ "instanceId": "gallery-1" }'

# Live-tune the running experience
curl -X PATCH http://localhost:8080/v1/projects/{projectId}/config \
  -H "Authorization: Bearer dev-token-12345678" \
  -H "Content-Type: application/merge-patch+json" \
  -d '{ "mood": 0.8, "animation": { "baseSpeed": 2.0 } }'

# Push an interaction event
curl -X POST http://localhost:8080/v1/projects/{projectId}/state/events \
  -H "Authorization: Bearer dev-token-12345678" \
  -H "Content-Type: application/json" \
  -d '{ "events": [{ "event": "viewer_close" }] }'

# Connect via WebSocket (use wscat or similar)
wscat -c "ws://localhost:8080/v1/ws/projects/{projectId}/state?token=dev-token-12345678"
```
