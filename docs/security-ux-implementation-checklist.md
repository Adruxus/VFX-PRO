# Security + UX Implementation Checklist (Prioritized)

Last updated: 2026-03-09
Scope: VFX-Pro web app + Netlify function API

## P0 (Do First) - Security Hardening

| ID | Item | Why It Matters | Estimate | Status | Acceptance Criteria |
|---|---|---|---:|---|---|
| P0-1 | Fail closed for internal API authorization | Prevents accidental open admin/internal routes when token is missing | 0.5 day | Done | Internal routes reject unauthorized requests when `ORCHESTRATOR_API_TOKEN` is missing unless explicit local override is enabled |
| P0-2 | Require auth for billing ledger read/write endpoints | Prevents unauthorized ledger access and tampering | 0.5 day | Done | `/api/v1/billing/ledger` and `/api/v1/billing/ledger/entries` return 401 without internal token |
| P0-3 | Remove client-exposed env fallbacks from server tokens | Avoids accidental secret leakage from `VITE_*` config | 0.25 day | Done | Server token lookup only uses server env vars (`REPLICATE_*`, `HUGGINGFACE_*`) |
| P0-4 | Add server-side request rate limiting for expensive provider endpoints | Reduces abuse and protects provider quota/cost | 1 day | Done | 429 with `Retry-After` on burst traffic for provider proxy + billing writes |
| P0-5 | Restrict CORS to allowlist origins | Reduces cross-origin abuse surface | 1 day | Done | API returns allowed origin only; wildcard removed for production |
| P0-6 | Move credit/ledger authority from localStorage to server DB | Prevents client-side balance tampering | 2-3 days | Done | Credits/ledger are canonical in server DB; client storage is cache-only |

### P0 env variables to configure

- `ORCHESTRATOR_API_TOKEN` (required in production)
- `INTERNAL_API_ALLOW_UNAUTH=false` (recommended)
- `RATE_LIMIT_PROVIDER_FILE`
- `RATE_LIMIT_REPLICATE_PREDICTION`
- `RATE_LIMIT_REPLICATE_POLL`
- `RATE_LIMIT_HUGGINGFACE_INFER`
- `RATE_LIMIT_BILLING_ENTRIES`
- `RATE_LIMIT_BILLING_CREDITS`
- `API_RATE_LIMIT_WINDOW_MS`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_BILLING_LEDGER_TABLE`
- `SUPABASE_CREDITS_TABLE`
- `REQUIRE_SERVER_BILLING_DB=true`
- `VITE_ORCHESTRATOR_API_TOKEN` (client calls to internal billing endpoints)
- `VITE_ALLOW_LOCAL_BILLING_FALLBACK=false` (recommended for production)

## P1 - Reliability and Job UX

| ID | Item | Why It Matters | Estimate | Status | Acceptance Criteria |
|---|---|---|---:|---|---|
| P1-1 | Model-specific preflight validator (required params, enum values) | Prevents avoidable 4xx failures before generation starts | 1.5 days | Done | Generator blocks invalid requests with actionable inline fixes |
| P1-2 | Phased progress model (queue -> run -> postprocess -> ready) | Removes confusing progress >100% and improves trust | 1 day | Done | Progress always clamped 0-100 and phase labels visible |
| P1-3 | Provider health + fallback policy panel | Helps users choose reliable/cheap models and understand failovers | 1 day | Done | Health/status badges + fallback chain shown before submit |
| P1-4 | Idempotent generation submit key | Prevents duplicate charges/jobs from accidental retries | 1 day | Done | Repeated submit for same request id does not double-charge |

## P2 - Product UX (Competitor + AAA-Inspired)

| ID | Item | Why It Matters | Estimate | Status | Acceptance Criteria |
|---|---|---|---:|---|---|
| P2-1 | Project workspace model (assets, prompts, settings, versions) | Aligns with creator workflows used in top tools | 2 days | Done | Users can create/switch projects and retain context |
| P2-2 | Asset library collections/tags/favorites | Reduces retrieval time and improves reuse | 1.5 days | Done | Filter/sort saved views and collections across sessions |
| P2-3 | Engine-ready scorecard (poly/texture/format/licensing checks) | AAA pipeline confidence before export | 2 days | Done | Each asset shows pass/fail readiness metrics |
| P2-4 | Scene outliner + inspector + shortcuts overlay | Mirrors professional engine UX conventions | 2-3 days | Done | Multi-select object edits and keyboard shortcut help |
| P2-5 | Timeline track editor (keyframes, clips, snapping) | Better than single-action editing for complex outputs | 3-4 days | Done | Multi-track timeline with non-destructive edits |
| P2-6 | Performance budget panel (FPS/VRAM/asset budget) | AAA-style optimization feedback in context | 2 days | Done | Live budget warnings tied to export presets |

## P3 - Monetization and Growth

| ID | Item | Why It Matters | Estimate | Status | Acceptance Criteria |
|---|---|---|---:|---|---|
| P3-1 | Team/org workspaces with seat billing | Expands B2B monetization | 3-4 days | Done | Org invites, roles, per-seat billing visibility |
| P3-2 | Tiered generation queues (priority SLA) | Monetizable reliability differentiator | 2 days | Done | Queue lane SLA shown by plan; measured in analytics |
| P3-3 | Preset marketplace (styles, camera paths, project templates) | Creator economy + retention | 3 days | Done | One-click import/purchase of reusable presets |

## Competitive / AAA Design Benchmarks To Follow

- AI generation UX references: Runway, Luma, Meshy workflows (preflight, preview/refine, clear progress states).
- Engine UX references: Unreal + Unity patterns for content browser, inspector, viewport controls, profiler.
- Security references: OWASP ASVS/API Top 10 and NIST SSDF controls for API auth, abuse resistance, and secure defaults.

## Next execution sequence

1. Complete remaining P0 (`P0-5`, `P0-6`).
2. Execute P1 in order (`P1-1` through `P1-4`).
3. Ship P2 as two milestones: Library/Workspace first, Timeline/Profiler second.
4. Begin P3 after reliability metrics stabilize.
