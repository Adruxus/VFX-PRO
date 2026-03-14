const globalState = globalThis.__VJ_STUDIO_STORE__ || {
    jobs: new Map(),
    assets: new Map(),
    pushes: new Map(),
    pipelineRuns: new Map(),
    providerJobs: new Map(),
}

if (!globalThis.__VJ_STUDIO_STORE__) {
    globalThis.__VJ_STUDIO_STORE__ = globalState
}

function nowIso() {
    return new Date().toISOString()
}

function makeId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function hashText(text) {
    let hash = 0
    for (let i = 0; i < text.length; i += 1) {
        hash = (hash << 5) - hash + text.charCodeAt(i)
        hash |= 0
    }
    return Math.abs(hash).toString(16)
}

function buildDependencies(exportTargets) {
    const out = []
    if (exportTargets.includes('uasset') || exportTargets.includes('fbx')) out.push('material_graph/main')
    if (exportTargets.includes('shadergraph')) out.push('shader_params/default')
    if (exportTargets.includes('mp4') || exportTargets.includes('mov')) out.push('media/preview')
    return out
}

function toProviderJobSummary(job) {
    if (!job) return null
    return {
        provider_job_id: job.id,
        status: job.status,
        provider: job.provider,
        type: job.type,
        model_id: job.model_id,
        user_id: job.user_id,
        user_tier: job.user_tier,
        external_job_id: job.external_job_id,
        result_url: job.result_url || null,
        metadata: job.metadata || null,
        created_at: job.created_at,
        updated_at: job.updated_at,
        events: job.events || [],
    }
}

function buildAssetManifest(request, variantIndex, assetId) {
    const createdAt = nowIso()
    const payload = {
        id: assetId,
        name: `${request.project_name}-v${variantIndex + 1}`,
        version: request.metadata.project_version,
        duration: request.duration_seconds,
        fps: request.frame_rate,
        resolution: request.resolution,
        loop_type: request.loop_type,
        tempo_bpm: request.tempo_bpm,
        asset_type: request.asset_type,
        export_targets: request.export_targets,
        dominant_colors: request.color_palette.slice(0, 6),
        tags: request.metadata.tags,
        license: request.metadata.license,
        author: request.metadata.author,
        checksum_sha256: '',
        engine_compatibility: {
            unreal: request.export_targets.some((target) => ['uasset', 'fbx', 'material_graph'].includes(target)),
            unity: request.export_targets.some((target) => ['prefab', 'fbx', 'shadergraph'].includes(target)),
        },
        gpu_budget_ms: request.constraints.gpu_budget_ms,
        created_at: createdAt,
        variant_index: variantIndex,
        dependencies: buildDependencies(request.export_targets),
        shader_params: [
            { key: 'intensity', min: 0, max: 1, default: 0.65 },
            { key: 'hueShift', min: -1, max: 1, default: 0.1 },
        ],
        animation_clips: [
            {
                name: 'loop_main',
                start_frame: 0,
                end_frame: Math.round(request.duration_seconds * request.frame_rate) - 1,
                seamless: true,
            },
        ],
        package: {
            root: `package-${assetId}.zip`,
            media: ['preview.mp4', 'preview.png'],
            engine: ['scene.fbx', 'shader_params.json'],
            docs: ['README.md', 'perf-notes.md'],
            manifest: 'meta.json',
        },
    }
    payload.checksum_sha256 = hashText(JSON.stringify(payload))
    return payload
}

export function createGenerationJob(request) {
    const jobId = makeId('job')
    const createdAt = nowIso()
    const variantCount = request.variants.count

    const manifests = Array.from({ length: variantCount }).map((_, index) => {
        const assetId = makeId('asset')
        const manifest = buildAssetManifest(request, index, assetId)
        globalState.assets.set(assetId, manifest)
        return manifest
    })

    const job = {
        id: jobId,
        status: 'completed',
        created_at: createdAt,
        updated_at: nowIso(),
        progress: 100,
        estimated_seconds: Math.max(4, Math.round(request.duration_seconds * 0.35)),
        request,
        result_asset_ids: manifests.map((manifest) => manifest.id),
        logs: [
            { at: createdAt, level: 'info', message: 'Generation request accepted' },
            { at: nowIso(), level: 'info', message: 'Prototype pipeline completed synchronously' },
        ],
    }

    globalState.jobs.set(jobId, job)
    return job
}

export function getJob(jobId) {
    return globalState.jobs.get(jobId) || null
}

export function getAsset(assetId) {
    return globalState.assets.get(assetId) || null
}

export function createEnginePush(payload) {
    const pushId = makeId('push')
    const createdAt = nowIso()
    const record = {
        id: pushId,
        status: 'accepted',
        created_at: createdAt,
        updated_at: createdAt,
        ...payload,
    }
    globalState.pushes.set(pushId, record)
    return record
}

export function getDownloadTicket(assetId) {
    const asset = getAsset(assetId)
    if (!asset) return null
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    return {
        asset_id: assetId,
        filename: `package-${assetId}.zip`,
        content_type: 'application/zip',
        checksum_sha256: asset.checksum_sha256,
        expires_at: expires,
        download_url: `/downloads/${assetId}.zip`,
        note: 'Prototype ticket. Integrate object storage for production downloads.',
    }
}

export function createProviderJob(payload) {
    const jobId = makeId('provider_job')
    const createdAt = nowIso()
    const status = payload.status || 'queued'
    const record = {
        id: jobId,
        status,
        provider: payload.provider || 'unknown',
        type: payload.type || 'video',
        model_id: payload.model_id || null,
        user_id: payload.user_id || null,
        user_tier: payload.user_tier || 'free',
        prompt_excerpt: payload.prompt_excerpt || '',
        metadata: payload.metadata || null,
        webhook_url: payload.webhook_url || null,
        external_job_id: payload.external_job_id || null,
        result_url: null,
        created_at: createdAt,
        updated_at: createdAt,
        events: [
            {
                at: createdAt,
                status,
                message: 'Provider job accepted by orchestrator',
            },
        ],
    }
    globalState.providerJobs.set(jobId, record)
    return toProviderJobSummary(record)
}

export function getProviderJob(providerJobId) {
    return toProviderJobSummary(globalState.providerJobs.get(providerJobId) || null)
}

export function appendProviderJobEvent(providerJobId, payload) {
    const current = globalState.providerJobs.get(providerJobId)
    if (!current) return null
    const updatedAt = nowIso()
    const nextStatus = payload.status || current.status || 'running'
    const nextEvents = [
        {
            at: updatedAt,
            status: nextStatus,
            message: payload.message || '',
            metadata: payload.metadata || null,
            result_url: payload.result_url || null,
            external_job_id: payload.external_job_id || null,
            provider_payload: payload.provider_payload || null,
        },
        ...(Array.isArray(current.events) ? current.events : []),
    ].slice(0, 80)

    const updated = {
        ...current,
        status: nextStatus,
        updated_at: updatedAt,
        result_url: payload.result_url || current.result_url || null,
        external_job_id: payload.external_job_id || current.external_job_id || null,
        metadata: payload.metadata != null ? payload.metadata : current.metadata,
        events: nextEvents,
    }
    globalState.providerJobs.set(providerJobId, updated)
    return toProviderJobSummary(updated)
}

export function appendProviderWebhookEvent(payload) {
    const directId = payload.provider_job_id || null
    if (directId && globalState.providerJobs.has(directId)) {
        return appendProviderJobEvent(directId, payload)
    }

    if (!payload.external_job_id) return null
    const provider = payload.provider || ''
    for (const record of globalState.providerJobs.values()) {
        const providerMatches = !provider || record.provider === provider
        const externalMatches = record.external_job_id && record.external_job_id === payload.external_job_id
        if (providerMatches && externalMatches) {
            return appendProviderJobEvent(record.id, payload)
        }
    }

    return null
}

export function createPipelineExecution(request) {
    const runId = makeId('pipeline')
    const createdAt = nowIso()
    const steps = [
        `terrain: generated ${request.terrain.resolution}x${request.terrain.resolution} deterministic heightfield`,
        `staging: staged ${request.asset_staging.asset_paths.length} asset placeholders`,
        `morph: single-shot compute morph alpha=${request.morph.alpha.toFixed(3)}`,
        `wormhole: ${request.wormhole.mode} radius=${request.wormhole.radius}`,
        `capture: ${request.capture.camera_names.length} cameras @ ${request.capture.resolution.x}x${request.capture.resolution.y}`,
    ]

    const record = {
        id: runId,
        status: 'completed',
        request_id: request.request_id,
        scene_name: request.scene_name,
        target: request.target,
        created_at: createdAt,
        updated_at: nowIso(),
        step_logs: steps.map((message) => ({ at: nowIso(), level: 'info', message })),
        summary: {
            deterministic: true,
            loops_used: false,
            timeline_used: false,
            sequencer_used: false,
            tick_used: false,
            update_used: false,
            coroutine_used: false,
        },
    }

    globalState.pipelineRuns.set(runId, record)
    return record
}

export function getPipelineExecution(runId) {
    return globalState.pipelineRuns.get(runId) || null
}
