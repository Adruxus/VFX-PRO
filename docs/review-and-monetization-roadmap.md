# UX Review + Monetization Roadmap

Updated: 2026-03-09

## Implemented In This Pass

1. Login discoverability:
   - Added visible `Sign In` call-to-action in desktop top bar.
   - Added visible `Sign In` call-to-action in mobile header and mobile sidebar drawer.
   - Added `Tutorials` page to global navigation.
2. Generator guidance:
   - Added mode-specific quick-start instructions for Image, Video, and 3D workflows.
   - Added generation readiness checklist (prompt/model/provider/reference requirements).
   - Added one-click example prompt insertion for non-3D generation modes.
   - Added direct jump link from Generator to Tutorials section.
3. Tutorials system:
   - Added full official step-by-step tutorial catalog for core platform areas.
   - Added community tutorial publish flow with metadata (title/category/level/tags/duration).
   - Added community tutorial playback (embedded YouTube/Vimeo, direct MP4/WebM, in-browser file uploads).
   - Added tutorial moderation controls (uploader/admin deletion).

## Product UX Gaps Found (High Priority)

1. Onboarding state is not persisted per account in a backend profile table.
2. Provider setup errors should include one-click remediation links in-context.
3. Model cards should show clear "requires image/video input" badges before selection.
4. Export settings should warn when selected format is label-only fallback rather than true transcode.
5. Dashboard should support playlist/setlist assignment from generated assets.
6. Community tutorials currently rely on browser storage prototype mode, not shared cloud persistence.

## Product UX Gaps Found (Medium Priority)

1. Add structured prompt templates (per genre/use-case) and saved prompt snippets.
2. Add bulk actions in Dashboard library (tag, move, delete, export zip).
3. Add downloadable starter projects for Unity/Unreal with generated assets prewired.
4. Add tutorial quality scoring and upvotes to highlight best content.
5. Add model recommendation assistant based on budget/latency/quality intent.

## Monetization Opportunities

1. Usage-based overage billing:
   - Keep plans for baseline credits, charge metered overage for heavy users.
2. Team workspaces:
   - Seat-based subscriptions with shared credit pools and role permissions.
3. Marketplace rev-share:
   - Sell templates, prompts, LUTs, and engine-ready packs with take rate.
4. Premium tutorial marketplace:
   - Creator-paid tutorials/courses, split revenue with educators.
5. Enterprise reliability bundle:
   - SLA, dedicated support, custom failover pools, and private inference routing.
6. White-label export package:
   - Remove branding, include custom intro/outro templates for agencies.
7. API productization:
   - Paid API access tiers for automation and external app embedding.
8. Audit/compliance tier:
   - Generation logs, moderation controls, policy exports for enterprise buyers.

## Analytics Required To Monetize Better

1. Conversion funnel:
   - `visit -> sign in -> first generation -> first paid action`.
2. Model economics:
   - provider cost, billed credits, margin, failure rate, and time-to-result by model.
3. Retention cohorts:
   - weekly active creators by plan + by generator mode.
4. Tutorial impact:
   - tutorial viewed -> successful generation rate uplift.

## Suggested Rollout Sequence

1. Ship cloud-backed tutorial persistence + moderation queue.
2. Launch usage overage billing + hard credit alerts.
3. Launch team workspaces and shared libraries.
4. Launch creator marketplace + tutorial revenue sharing.
5. Launch enterprise SLA/white-label/API bundles.
