# VJ Studio Pro API Contract (Prototype v1)

## Authentication
- Prototype mode: public read routes, optional token hardening for provider write routes.
- If `ORCHESTRATOR_API_TOKEN` is set, these write routes require either `Authorization: Bearer <token>` or `X-Orchestrator-Token`:
  - `POST /api/v1/provider-jobs`
  - `POST /api/v1/provider-jobs/{provider_job_id}/events`
- Webhook signature verification:
  - If provider secrets are set (`PROVIDER_WEBHOOK_SECRET` or provider-specific variants), `POST /api/v1/webhooks/provider` validates HMAC SHA-256 signatures.

## Base URL
- Production: `https://vfx-studios.com`
- Local Netlify dev: `http://localhost:8888`

## Endpoints
1. `POST /api/v1/generate`
2. `GET /api/v1/jobs/{job_id}`
3. `GET /api/v1/assets/{asset_id}/manifest`
4. `GET /api/v1/assets/{asset_id}/download`
5. `POST /api/v1/engine/push`
6. `POST /api/v1/pipeline/execute`
7. `GET /api/v1/pipeline/runs/{run_id}`
8. `POST /api/v1/provider-jobs`
9. `GET /api/v1/provider-jobs/{provider_job_id}`
10. `POST /api/v1/provider-jobs/{provider_job_id}/events`
11. `POST /api/v1/webhooks/provider`
12. `GET /api/v1/billing/ledger?user_id={user_id}`
13. `POST /api/v1/billing/ledger/entries`
14. `WS /ws/jobs` (planned; REST polling active now)

## Request and Response Rules
- Content type: `application/json`
- Idempotency key (planned): `X-Request-Id`
- Retry policy:
  - `429`, `500`, `502`, `503`, `504`: exponential backoff with jitter
  - `400`, `401`, `403`, `404`, `422`: do not retry without payload/auth changes

## Error Shape
```json
{
  "error": "validation_failed",
  "message": "Request payload does not match schema requirements",
  "details": [
    { "path": "resolution", "message": "Expected format: WIDTHxHEIGHT" }
  ]
}
```

## Status and Job Model
- Job statuses: `queued`, `running`, `completed`, `failed` (prototype currently returns `completed`)
- Progress range: `0-100`
- Result links: job status + asset manifest + download ticket

## Provider Webhook Behavior
- External providers can POST status updates to `/api/v1/webhooks/provider`.
- Payload must include `provider`, `status`, and either `provider_job_id` or `external_job_id`.
- Matching provider jobs are updated in orchestrator state and surfaced through `GET /api/v1/provider-jobs/{provider_job_id}`.
- When webhook secrets are configured, unsigned or invalidly-signed events are rejected with `401`.

## Billing Ledger Behavior
- Client generation flows submit billing entries to `POST /api/v1/billing/ledger/entries`.
- Ledger reads are available via `GET /api/v1/billing/ledger?user_id={user_id}`.
- Backing store:
  - Primary: Supabase REST table `billing_ledger_entries` (when env vars are present).
  - Fallback: in-memory function state for local/dev.

## WebSocket Job Stream (planned protocol)
- Client subscribe frame:
```json
{ "type": "jobs.subscribe", "job_id": "job_x123" }
```
- Server update frame:
```json
{ "type": "job.update", "job_id": "job_x123", "status": "running", "progress": 45 }
```

## Engine Push Contract
- Request:
```json
{
  "asset_id": "asset_abcd1234",
  "target": "unreal",
  "endpoint": "ws://127.0.0.1:7777/vfx-runtime",
  "hot_reload": true,
  "fidelity_mode": "quality"
}
```

## Cross-Engine Pipeline Execute Contract
- Request:
```json
{
  "request_id": "REQ-ULTRA-001",
  "scene_name": "HouseAndCityDemo",
  "target": "unity",
  "terrain": {
    "resolution": 2049,
    "world_scale": 100,
    "height_scale": 1200,
    "seed": 1337
  },
  "asset_staging": {
    "asset_paths": ["Assets/House.prefab", "Assets/Wolf.prefab"],
    "stage_origin": { "x": 0, "y": 0, "z": 0 },
    "grid_spacing": 3,
    "validate_pbr": true
  },
  "morph": {
    "source_asset_path": "Assets/A.prefab",
    "target_asset_path": "Assets/B.prefab",
    "alpha": 1,
    "use_sdf_fallback": false
  },
  "wormhole": {
    "mode": "wormhole",
    "center": { "x": 0, "y": 3, "z": -5 },
    "radius": 8,
    "distortion_strength": 1.25,
    "particle_budget": 150000
  },
  "capture": {
    "camera_names": ["Cam_A", "Cam_B", "Cam_C", "Cam_D", "Cam_E"],
    "resolution": { "x": 3840, "y": 2160 },
    "frame_rate": 60,
    "output_directory": "Recordings/VFXStudio"
  }
}
```

- Response:
```json
{
  "run_id": "pipeline_abcd1234",
  "status": "completed",
  "request_id": "REQ-ULTRA-001",
  "scene_name": "HouseAndCityDemo",
  "target": "unity",
  "step_logs": [
    { "at": "2026-03-06T00:00:00.000Z", "level": "info", "message": "terrain: generated 2049x2049 deterministic heightfield" }
  ],
  "summary": {
    "deterministic": true,
    "loops_used": false,
    "timeline_used": false,
    "sequencer_used": false,
    "tick_used": false,
    "update_used": false,
    "coroutine_used": false
  }
}
```
- Response:
```json
{
  "push_id": "push_qwerty12",
  "status": "accepted",
  "target": "unreal",
  "asset_id": "asset_abcd1234"
}
```
