# AI Generation Ops Guide

## Checklist: Implemented

- [x] Split generator modes by real output type:
  - `2D Image Generation` -> image models only.
  - `3D Text-to-Video Loops` -> video models only.
  - `3D Asset Generator` -> 3D Spaces/models only.
- [x] Added requested Hugging Face Spaces to 3D model catalog:
  - `microsoft/TRELLIS.2`
  - `tencent/Hunyuan3D-2.1`
  - `ilcve21/Sparc3D`
  - `3d-arena/3d-arena`
- [x] Added requested Hugging Face Spaces to text-to-video model catalog:
  - `Wan-AI/Wan2.2-Animate`
  - `KlingTeam/LivePortrait`
  - `rahul7star/Wan2.2-T2V-A14B`
  - `Wan-AI/Wan2.1`
  - `multimodalart/stable-video-diffusion`
  - `Lightricks/ltx-video-distilled`
  - `Heartsync/NSFW-Uncensored-video2`
  - `huggingface-projects/ai-video-composer`
- [x] Added in-app 3D image upload flow and preview.
- [x] Added video reference upload flow (image/video) for models that support or require it.
- [x] Enforced cost charging at 300% of provider cost in credits (where `providerCost` is configured).
- [x] Split every successful generation charge into:
  - provider reserve account (`providerReserveUsd`)
  - platform profit account (`platformProfitUsd`)
- [x] Tracked provider reserve by provider (`replicate`, `huggingface`) in ledger storage.
- [x] Added direct-download fallback for cross-origin export URLs.
- [x] Added provider health checks + automatic failover chain for video models.
- [x] Added pre-flight credit estimate panel in generator controls.
- [x] Added server-side provider-job orchestration routes and webhook status ingestion (`/api/v1/provider-jobs*`, `/api/v1/webhooks/provider`).
- [x] Added retry-with-backoff for orchestrator API requests from the web client.
- [x] Added provider-job polling monitor in generator output UI.
- [x] Moved billing ledger to API-backed persistence with Supabase support and local fallback.
- [x] Added webhook signature verification and optional orchestrator-token auth hardening.

## What Improves UX

- Correct model list per tool mode reduces invalid model/task combinations.
- 3D upload preview gives immediate confidence before generation spend.
- Video reference media controls reduce invalid requests for image/video-conditioned spaces.
- Disabled external-only spaces prevent failed jobs and wasted credits.
- Cached generations continue to avoid repeat charges.
- Pre-flight credit estimate communicates spend before submit.
- Provider health/failover improves completion rate during provider outages.
- Provider-job monitor gives users visibility into queued/running/failed provider states.
- API-backed ledger enables reconciliation and long-term billing audit outside the browser.
- Verified webhook signatures reduce spoofed status updates.

## Where It Is Stored

- Model/provider catalog:
  - `src/config/ai-providers.json`
- Pricing + provider cost basis:
  - `src/config/pricing.json`
- Credit and billing math:
  - `src/services/creditSystem.js`
- Generation + ledger + cache flow:
  - `src/services/backend.js`
- Provider-job monitor UI:
  - `src/pages/AssetGenerator.jsx`
- Provider API integration (Replicate, HF Inference, HF Spaces):
  - `src/services/aiProvider.js`
- Generator UI and upload controls:
  - `src/pages/AssetGenerator.jsx`
- Model dropdown behavior:
  - `src/components/ModelSelector.jsx`
- Provider health + failover logic:
  - `src/services/aiProvider.js`
- Provider job orchestration API:
  - `netlify/functions/api.js`
  - `netlify/functions/lib/billing.js`
  - `netlify/functions/lib/schema.js`
  - `netlify/functions/lib/store.js`
- Supabase billing ledger schema:
  - `supabase/migrations/20260308_billing_ledger_entries.sql`

## Maintenance

1. Update model metadata and provider/space IDs in `src/config/ai-providers.json`.
2. Set `providerCost` in `src/config/pricing.json` for each billable model.
3. Keep `chargeMultiplier` at `3.0` unless business pricing changes.
4. Configure backend env vars for persistence/security:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_ACCESS_TOKEN`)
   - optional: `ORCHESTRATOR_API_TOKEN`
   - optional: `PROVIDER_WEBHOOK_SECRET`, `REPLICATE_WEBHOOK_SECRET`, `HUGGINGFACE_WEBHOOK_SECRET`
5. Apply SQL migration for `billing_ledger_entries` before production cutover.
6. Validate:
   - `npm run lint`
   - `npm run build`
7. If a Space breaks, set `supportedInApp: false` and add `supportNote`.

## Current Known Limits

- `Sparc3D` space currently exposes no callable public API endpoint for in-app generation.
- `3D Arena` is Docker-based and does not expose standard Gradio prediction endpoints.
- These are listed and selectable for visibility, but disabled for in-app generation.

## Recommended Next Improvements

1. Add automated integration tests for provider webhook verification and billing ledger writes.
2. Add signed user identity verification on billing ledger write routes to prevent client-side tampering.
3. Add provider ETA estimation from historical runtime windows to improve job progress accuracy.
4. Add ledger export endpoints (CSV + month rollups) for finance reconciliation workflows.
