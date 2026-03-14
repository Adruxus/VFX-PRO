# VFX-Pro Engineering Optimization Guide

## 1) Completed Checklist

- [x] Enforced provider key validation before generation calls.
- [x] Added Replicate request controls (`Prefer: wait=60`, `Cancel-After: 2m`) and timeout handling.
- [x] Improved provider error parsing to surface actionable failures.
- [x] Added generation result caching (24h TTL, per-user, per-fingerprint) to reduce repeated provider calls and credit spend.
- [x] Added prompt normalization and max prompt length guardrails to reduce wasteful payload/token usage.
- [x] Added generation progress status + progress bar for clearer wait-state UX.
- [x] Added lifecycle-safe blob URL cleanup and release callback wiring for preview assets.
- [x] Hardened engine-pack API response handling (content-type guard + `job_id` validation).
- [x] Removed random BPM fallback for deterministic behavior.
- [x] Removed heavy `music-metadata-browser` runtime dependency and replaced with lightweight browser metadata heuristics.
- [x] Cleared all current ESLint warnings/errors.
- [x] Optimized bundle splitting (route-level lazy loading + 3D chunk partitioning).
- [x] Build pipeline runs cleanly (`npm run lint`, `npm run build`).

---

## 2) What We Got Right

- Strong user-facing safety checks before expensive generation calls.
- Credit accounting is only applied after successful generation output.
- Runtime cleanup exists for generated object URLs and waveform resources.
- Route-level code splitting is in place for major pages.
- 3D viewport is lazy-loaded and isolated from initial app payload.

---

## 3) Research Cross-Validation (Technical + Scientific)

| Source | Key Finding | Applied / Planned in VFX-Pro |
|---|---|---|
| Replicate API docs (`create-a-prediction`) | Synchronous wait mode supports bounded wait windows and prediction deadlines (`Cancel-After`). | Applied: bounded provider execution and timeout/error handling. |
| React docs (`lazy`, `Suspense`) | Route/component lazy loading reduces initial JS cost and improves startup UX. | Applied: page lazy loading + viewport lazy loading. |
| TanStack Query defaults | Controlled stale/focus/refetch behavior avoids unnecessary network churn. | Already configured in app root query client. |
| MDN Web Storage quotas | Local storage is finite and should be bounded/pruned. | Applied: bounded generation cache entries + TTL pruning. |
| Netlify CLI deploy docs | `netlify deploy --prod` is the canonical production publish path. | Applied: deployment workflow uses CLI production deploy. |
| Scientific Reports (Nature): progress indicator shape perception | Indicator design materially affects perceived wait quality. | Applied: explicit progress status + progress bar during generation. |
| Int. Journal of Industrial Ergonomics: progress indicators + wait UX | Visual wait feedback reduces uncertainty and abandonment risk. | Applied: continuous generation state feedback in UI. |
| PubMed studies on progress-bar design | Clear progress affordances improve subjective waiting experience. | Applied: status text + progress component during provider execution. |

---

## 4) Improvements: User Value, Storage, Maintenance, Next Steps

| Improvement | User Impact | Where Stored | Maintenance | Next Upgrade |
|---|---|---|---|---|
| Provider preflight validation | Fast, clear errors instead of failed calls | Runtime only | Keep provider list in sync with `ai-providers.json` | Add direct “Open API key setup docs” links in UI |
| Prompt normalization + char cap | Reduces wasteful token/payload overhead | Runtime only | Keep cap aligned with provider limits | Per-model cap/validation rules |
| Generation cache (24h) | Faster repeated previews, lower credit usage | `localStorage` (`vfx_pro_generation_cache:*`) | TTL and entry limit already enforced; monitor key growth | Add cache invalidation UI button |
| Blob URL cleanup callbacks | Prevents memory leaks from repeated previews | Runtime refs in component state | Ensure release callback is always called on replace/unmount | Add dev-only leak diagnostics in debug mode |
| Progress status + bar | Better perceived responsiveness during waits | Runtime state in `AssetGenerator` | Maintain status mapping as provider states evolve | Add estimated time from provider metrics |
| Deterministic metadata fallback | Predictable setlist behavior | Runtime only | Keep filename parsing regexes stable | Optional BPM detection worker for higher accuracy |
| Route + 3D chunk splitting | Faster app startup and lower initial RAM/CPU | Build-time chunk graph | Re-evaluate manual chunk map when deps change | Move 3D renderer to optional mount only after user interaction |

---

## 5) Storage Keys Reference

- `vfx_pro_credits:<userId>`
- `vfx_pro_plan_allocation:<userId>`
- `vfx_pro_credit_ledger:<userId>`
- `vfx_pro_generation_cache:<userId>`
- `vfx_pro_sidebar_collapsed`
- Access/compliance keys from `accessControl`:
  - `vfx_pro_subscription_plan`
  - `vfx_pro_admin_override`
  - `vfx_pro_age_verified`
  - `vfx_pro_restricted_consent`
  - `vfx_pro_verification_method`
  - `vfx_pro_verified_at`

---

## 6) Maintenance Playbook

1. Before release:
   - Run `npm run lint`
   - Run `npm run build`
2. Monthly:
   - Validate provider model IDs against upstream provider docs.
   - Verify cache TTL/size policy still fits usage patterns.
3. After dependency upgrades:
   - Re-check chunk distribution and lazy boundaries.
   - Re-run generation flow to confirm progress + cleanup behavior.
4. Incident handling:
   - If users report stale previews, clear `vfx_pro_generation_cache:*`.
   - If users report memory pressure, verify preview release callbacks are firing.

---

## 7) Next High-Impact UX Backlog

1. Add explicit “Use cached preview” badges in output history.
2. Add per-model estimated generation ranges in UI (`best case / typical / slow path`).
3. Add retry with backoff and user-visible retry countdown for transient provider errors.
4. Add “low-cost preview mode” toggle that auto-selects lowest-cost compatible model/resolution.
5. Add opt-in telemetry for wait time, cache hit rate, and generation failure reasons.

---

## 8) Source Links

### Technical Documentation

- Replicate predictions API: https://replicate.com/docs/topics/predictions/create-a-prediction
- React `lazy`: https://react.dev/reference/react/lazy
- React `Suspense`: https://react.dev/reference/react/Suspense
- TanStack Query important defaults: https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
- MDN storage quotas and eviction: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- Netlify CLI manual deploys: https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/#manual-deploys
- Hugging Face Inference Providers auth: https://huggingface.co/docs/inference-providers/index
- OpenAI prompt caching guide: https://platform.openai.com/docs/guides/prompt-caching

### Scientific / Peer-Reviewed Sources

- Scientific Reports (2025): waiting UX and countdown/progress feedback effects: https://www.nature.com/articles/s41598-025-34811-9
- PubMed: progress bar form effects on waiting experience (2018): https://pubmed.ncbi.nlm.nih.gov/29988473/
- PubMed: subjective waiting time and satisfaction relationship (2023): https://pubmed.ncbi.nlm.nih.gov/37800750/
