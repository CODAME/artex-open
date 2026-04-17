# ARTEX Platform API

External API for managing ARTEX living art projects. Enables third-party applications to create projects, deploy them to ARTEX instances, and update running experiences in real-time.

## Quick Start

This package depends on `@artex/contract` via the workspace graph, so **install from the repo root** first:

```bash
# From the artex-open root
npm install

# Then start the API (either way works)
npm run dev --workspace=@artex/platform-api
# — or —
cd .services/artex-platform-api && npm run dev
```

> **Note:** Running `npm install` inside `.services/artex-platform-api/` directly will fail because npm cannot resolve `@artex/contract` outside the workspace context.

The API starts at `http://localhost:8080/v1`. In development mode, any Bearer token of 8+ characters is accepted.

## Two Core Use Cases

### 1. Run a New Project

Create a project with a full `ConfigJson`, then deploy it to an ARTEX instance:

```bash
# Create
curl -X POST http://localhost:8080/v1/projects \
  -H "Authorization: Bearer dev-token-12345678" \
  -H "Content-Type: application/json" \
  -d '{ "config": { "version": 1, "title": "My Art", "story": "...", ... } }'

# Run on an instance
curl -X POST http://localhost:8080/v1/projects/{projectId}/run \
  -H "Authorization: Bearer dev-token-12345678" \
  -H "Content-Type: application/json" \
  -d '{ "instanceId": "gallery-1" }'
```

See `examples/run-new-project.ts` for a complete working example with a full ConfigJson.

### 2. Update a Running Experience

Live-tune config, adjust runtime state, or push interaction events to a running experience:

```bash
# Tune mood and animation speed
curl -X PATCH http://localhost:8080/v1/projects/{projectId}/config \
  -H "Authorization: Bearer dev-token-12345678" \
  -H "Content-Type: application/merge-patch+json" \
  -d '{ "mood": 0.85, "animation": { "baseSpeed": 2.0 } }'

# Push interaction events
curl -X POST http://localhost:8080/v1/projects/{projectId}/state/events \
  -H "Authorization: Bearer dev-token-12345678" \
  -H "Content-Type: application/json" \
  -d '{ "events": [{ "event": "viewer_close" }, { "event": "sound_peak" }] }'

# Subscribe to real-time changes via WebSocket
wscat -c "ws://localhost:8080/v1/ws/projects/{projectId}/state?token=dev-token-12345678"
```

See `examples/update-running-experience.ts` for a complete working example.

## Sample Apps

Both samples are standalone TypeScript scripts that exercise the API end-to-end:

```bash
# Use Case 1: Deploy a new living artwork
npx tsx examples/run-new-project.ts
npx tsx examples/run-new-project.ts --instance gallery-1

# Use Case 2: Live-tune a running experience (needs a projectId from step 1)
npx tsx examples/update-running-experience.ts <projectId>
```

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/v1/projects` | Create a new project |
| `GET` | `/v1/projects` | List projects |
| `GET` | `/v1/projects/:id` | Get full project |
| `DELETE` | `/v1/projects/:id` | Delete project |
| `GET` | `/v1/projects/:id/config` | Get config |
| `PUT` | `/v1/projects/:id/config` | Replace config |
| `PATCH` | `/v1/projects/:id/config` | Merge-patch config |
| `GET` | `/v1/projects/:id/state` | Get runtime state |
| `PATCH` | `/v1/projects/:id/state` | Merge-patch state |
| `POST` | `/v1/projects/:id/state/events` | Push interaction events |
| `POST` | `/v1/projects/:id/run` | Start on an instance |
| `POST` | `/v1/projects/:id/stop` | Stop |
| `POST` | `/v1/projects/:id/reset` | Reset state |
| `GET` | `/v1/health` | Health check |
| `WS` | `/v1/ws/projects/:id/state` | Real-time state stream |

## WebSocket Protocol

Connect to `ws(s)://{host}/v1/ws/projects/{projectId}/state` with a Bearer token (header or `?token=` query param).

**Server sends:** `config_updated`, `state_updated`, `state_replaced`, `state_event`, `project_stopped`, `pong`, `error`

**Client can send:** `patch_state` (merge state), `push_events` (trigger interactions), `ping` (keep-alive)

## Authentication

The API supports phased authentication:

| Phase | Method | When |
|-------|--------|------|
| 1 (now) | Dev tokens | Any 8+ character Bearer token works |
| 2 | Firebase Auth | Hooks into existing ARTEX user login — same JWT |
| 3 | OAuth2 | Full third-party authorization flows |

To enable Firebase Auth, see the comments in `src/server.ts`. External apps use the same login their users already have for ARTEX.

## Tests

```bash
npm test          # 74 tests across 6 suites
npx vitest watch  # Watch mode
```

| Suite | Coverage |
|-------|----------|
| `auth.test.ts` | Dev validator, Firebase JWT mock, combined validator chain |
| `broadcaster.test.ts` | Subscribe, broadcast, disconnect, project isolation |
| `store.test.ts` | CRUD, pagination, filtering, state management |
| `validate.test.ts` | RFC 7396 JSON Merge Patch implementation |
| `ws-handler.test.ts` | URL parsing, token extraction |
| `integration.test.ts` | End-to-end flows for both use cases |

## Architecture

```
External App ──▶ REST API (Express) ──▶ ProjectStore (Firestore / in-memory)
                      │
                      ▼
               WS Broadcaster ──▶ WebSocket ──▶ ARTEX Renderer
```

All input is validated against `@artex/contract` types (`ConfigJson`, `StateJson`, `ProjectPackageData`). The same contract validators used by the Creator Studio are used here.

## Documentation

- `docs/API_DESIGN.md` — Full design document with use case flows, auth plan, and Option C roadmap
- `docs/openapi.yaml` — OpenAPI 3.1 specification

## Future: Option C — Remote Extension Gateway

A reserved namespace (`/v1/extensions/*`, `/v1/ws/projects/:id/extensions`) will enable external apps to register shaders and stream live sensor data (audio, proximity, camera) directly into running experiences over WebSocket. See `docs/API_DESIGN.md` section 7 for the protocol design.
