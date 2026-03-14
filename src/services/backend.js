import {
    generateVideo as providerGenerateVideo,
    generateImage as providerGenerateImage,
    generate3DAsset as providerGenerate3DAsset,
    getActiveProviders,
    getVideoModels,
    getImageModels,
    getThreeDModels,
} from '@/services/aiProvider'
import {
    canUseModel,
    getCreditUnitValue,
    getModelCreditCost,
    getModelPricing,
    getModelTier,
    getPlanMonthlyCredits,
} from '@/services/creditSystem'

const DEFAULT_CREDITS = 100
const CREDIT_STORAGE_KEY = 'vfx_pro_credits'
const PLAN_ALLOCATION_STORAGE_KEY = 'vfx_pro_plan_allocation'
const LEDGER_FALLBACK_STORAGE_KEY = 'vfx_pro_credit_ledger_fallback'
const GENERATION_CACHE_STORAGE_KEY = 'vfx_pro_generation_cache'
const GENERATION_LIBRARY_STORAGE_KEY = 'vfx_pro_generation_library'
const MAX_LEDGER_ENTRIES = 200
const MAX_GENERATION_CACHE_ENTRIES = 80
const MAX_GENERATION_LIBRARY_ENTRIES = 240
const MAX_DATA_URL_IMAGE_BYTES = 900000
const MAX_DATA_URL_VIDEO_BYTES = 3500000
const GENERATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const ORCHESTRATOR_BASE_URL = '/api/v1'
const ORCHESTRATOR_DEFAULT_ATTEMPTS = 4
const ORCHESTRATOR_DEFAULT_TIMEOUT_MS = 12000
const ORCHESTRATOR_RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])
const PROVIDER_JOB_TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'canceled', 'aborted', 'completed'])
const MISSING_PROVIDER_JOB_IDS = new Set()
const IN_FLIGHT_GENERATION_REQUESTS = new Map()
const SERVER_CREDIT_CACHE_TTL_MS = 20_000
const SERVER_CREDIT_SNAPSHOT_CACHE = new Map()
const ORCHESTRATOR_API_TOKEN = import.meta.env.VITE_ORCHESTRATOR_API_TOKEN || ''
const PROVIDER_JOB_TRACKING_OVERRIDE = String(import.meta.env.VITE_ENABLE_PROVIDER_JOB_TRACKING || '').toLowerCase() === 'true'
const LOCAL_BILLING_FALLBACK_ENABLED = String(import.meta.env.VITE_ALLOW_LOCAL_BILLING_FALLBACK || '').toLowerCase() === 'true'

function shouldUseProviderJobTracking() {
    if (PROVIDER_JOB_TRACKING_OVERRIDE) return true
    if (typeof window === 'undefined') return false
    const host = String(window.location.hostname || '').toLowerCase()
    return host === 'localhost' || host === '127.0.0.1'
}

function creditKey(userId) {
    return `${CREDIT_STORAGE_KEY}:${userId || 'guest'}`
}

function planAllocationKey(userId) {
    return `${PLAN_ALLOCATION_STORAGE_KEY}:${userId || 'guest'}`
}

function fallbackLedgerKey(userId) {
    return `${LEDGER_FALLBACK_STORAGE_KEY}:${userId || 'guest'}`
}

function generationCacheKey(userId) {
    return `${GENERATION_CACHE_STORAGE_KEY}:${userId || 'guest'}`
}

function generationLibraryKey(userId) {
    return `${GENERATION_LIBRARY_STORAGE_KEY}:${userId || 'guest'}`
}

function readJsonStorage(key, fallback) {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    try {
        return JSON.parse(raw)
    } catch {
        return fallback
    }
}

function writeJsonStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value))
}

function normalizeText(value, maxLength = 1000) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, maxLength)
}

function normalizeFileFingerprint(file) {
    if (typeof File === 'undefined' || !(file instanceof File)) return null
    return `${file.name}:${file.type}:${file.size}:${file.lastModified}`
}

function makeGenerationFingerprint(payload) {
    return JSON.stringify(payload)
}

function createId(prefix = 'id') {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function shouldRetryOrchestratorStatus(status) {
    return ORCHESTRATOR_RETRYABLE_STATUSES.has(Number(status))
}

function getRetryDelayMs(attempt) {
    const base = 450
    const capped = Math.min(7000, base * Math.pow(2, Math.max(0, attempt)))
    return Math.round(capped + Math.random() * 120)
}

async function orchestratorRequest(
    path,
    { method = 'GET', payload = null, attempts = ORCHESTRATOR_DEFAULT_ATTEMPTS, timeoutMs = ORCHESTRATOR_DEFAULT_TIMEOUT_MS } = {}
) {
    const url = `${ORCHESTRATOR_BASE_URL}${path}`
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), timeoutMs)
        try {
            const headers = {}
            if (payload != null) headers['Content-Type'] = 'application/json'
            if (ORCHESTRATOR_API_TOKEN) {
                headers.Authorization = `Bearer ${ORCHESTRATOR_API_TOKEN}`
            }
            const response = await fetch(url, {
                method,
                headers,
                body: payload == null ? undefined : JSON.stringify(payload),
                signal: controller.signal,
            })
            clearTimeout(timeout)

            const isJson = (response.headers.get('content-type') || '').includes('application/json')
            const data = isJson ? await response.json().catch(() => null) : null

            if (response.ok) {
                return { ok: true, status: response.status, data }
            }

            const retryable = shouldRetryOrchestratorStatus(response.status)
            if (attempt < attempts - 1 && retryable) {
                await sleep(getRetryDelayMs(attempt))
                continue
            }
            return { ok: false, status: response.status, data }
        } catch (error) {
            clearTimeout(timeout)
            if (attempt < attempts - 1) {
                await sleep(getRetryDelayMs(attempt))
                continue
            }
            return {
                ok: false,
                status: 0,
                data: null,
                error: error instanceof Error ? error.message : 'Network request failed',
            }
        }
    }
    return { ok: false, status: 0, data: null, error: 'Orchestrator request failed after retries' }
}

async function postOrchestratorJson(path, payload, options) {
    const response = await orchestratorRequest(path, { method: 'POST', payload: payload || {}, ...(options || {}) })
    return response.ok ? response.data : null
}

async function getOrchestratorJson(path, options) {
    const response = await orchestratorRequest(path, { method: 'GET', ...(options || {}) })
    return response.ok ? response.data : null
}

function getCreditSnapshotCacheKey(userId, userTier = 'free') {
    return `${userId || 'guest'}:${userTier || 'free'}`
}

function invalidateCreditSnapshotCache(userId, userTier = 'free') {
    SERVER_CREDIT_SNAPSHOT_CACHE.delete(getCreditSnapshotCacheKey(userId, userTier))
}

function getPlanSeedCredits(userTier = 'free') {
    const planCredits = getPlanMonthlyCredits(userTier || 'free')
    return planCredits > 0 ? planCredits : DEFAULT_CREDITS
}

function writeCreditCache(userId, userTier, credits) {
    const safeCredits = Math.max(0, Math.floor(Number(credits) || 0))
    writeCredits(userId, safeCredits)
    writePlanAllocation(userId, {
        tier: userTier || 'free',
        seededCredits: Math.max(safeCredits, getPlanSeedCredits(userTier)),
        seededAt: new Date().toISOString(),
    })
}

async function readServerCreditSnapshot(userId, userTier = 'free') {
    const normalizedUserId = userId || 'guest'
    const normalizedTier = userTier || 'free'
    const cacheKey = getCreditSnapshotCacheKey(normalizedUserId, normalizedTier)
    const cached = SERVER_CREDIT_SNAPSHOT_CACHE.get(cacheKey)
    const now = Date.now()
    if (cached && now - cached.cachedAt < SERVER_CREDIT_CACHE_TTL_MS) {
        return cached.snapshot
    }

    const seedCredits = getPlanSeedCredits(normalizedTier)
    const response = await orchestratorRequest(
        `/billing/credits?user_id=${encodeURIComponent(normalizedUserId)}&plan_tier=${encodeURIComponent(normalizedTier)}&seed_credits=${encodeURIComponent(seedCredits)}`,
        {
            method: 'GET',
            attempts: 2,
        }
    )
    if (!response.ok || !response.data?.balance) return null

    const snapshot = response.data.balance
    const credits = Number(snapshot.credits_balance)
    if (Number.isFinite(credits) && credits >= 0) {
        writeCreditCache(normalizedUserId, normalizedTier, credits)
    }

    SERVER_CREDIT_SNAPSHOT_CACHE.set(cacheKey, {
        cachedAt: now,
        snapshot,
    })
    return snapshot
}

async function chargeServerCredits({
    userId,
    userTier = 'free',
    cost,
    idempotencyKey = null,
    metadata = null,
}) {
    const normalizedUserId = userId || 'guest'
    const normalizedTier = userTier || 'free'
    const seedCredits = getPlanSeedCredits(normalizedTier)
    const response = await orchestratorRequest('/billing/credits/charge', {
        method: 'POST',
        payload: {
            user_id: normalizedUserId,
            plan_tier: normalizedTier,
            seed_credits: seedCredits,
            cost: Math.max(1, Math.floor(Number(cost) || 0)),
            ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
            ...(metadata ? { metadata } : {}),
        },
        attempts: 1,
    })
    if (!response.ok || !response.data?.charge) return null

    const charge = response.data.charge
    if (Number.isFinite(Number(charge.credits_after))) {
        writeCreditCache(normalizedUserId, normalizedTier, Number(charge.credits_after))
        invalidateCreditSnapshotCache(normalizedUserId, normalizedTier)
    }
    return charge
}

function toEventStatus(value) {
    const normalized = normalizeText(value || 'running', 80)
    return normalized || 'running'
}

function toEventMessage(value) {
    const normalized = normalizeText(value || '', 780)
    return normalized || undefined
}

function toEventMetadata(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    try {
        return JSON.parse(JSON.stringify(value))
    } catch {
        return null
    }
}

function queueProviderJobEvent(providerJobId, payload) {
    if (!shouldUseProviderJobTracking()) return
    if (!providerJobId) return
    if (MISSING_PROVIDER_JOB_IDS.has(providerJobId)) return
    const sanitizedPayload = {
        status: toEventStatus(payload?.status),
        ...(toEventMessage(payload?.message) ? { message: toEventMessage(payload?.message) } : {}),
        ...(typeof payload?.result_url === 'string' && payload.result_url.trim() ? { result_url: payload.result_url.trim().slice(0, 2048) } : {}),
        ...(typeof payload?.external_job_id === 'string' && payload.external_job_id.trim()
            ? { external_job_id: payload.external_job_id.trim().slice(0, 200) }
            : {}),
        ...(toEventMetadata(payload?.provider_payload) ? { provider_payload: toEventMetadata(payload.provider_payload) } : {}),
        ...(toEventMetadata(payload?.metadata) ? { metadata: toEventMetadata(payload.metadata) } : {}),
    }
    void (async () => {
        const response = await orchestratorRequest(`/provider-jobs/${providerJobId}/events`, {
            method: 'POST',
            payload: sanitizedPayload,
            attempts: 1,
        })
        if (!response.ok && response.status === 404) {
            MISSING_PROVIDER_JOB_IDS.add(providerJobId)
        }
    })()
}

async function createProviderJob({
    type,
    provider,
    modelId,
    userId,
    userTier,
    prompt,
    metadata,
}) {
    if (!shouldUseProviderJobTracking()) return null
    const result = await postOrchestratorJson('/provider-jobs', {
        type,
        provider,
        model_id: modelId,
        user_id: userId || 'guest',
        user_tier: userTier || 'free',
        prompt_excerpt: normalizeText(prompt, 180),
        metadata: metadata || null,
    })
    const providerJobId = result?.provider_job_id || null
    if (!providerJobId) return null

    const verify = await orchestratorRequest(`/provider-jobs/${encodeURIComponent(providerJobId)}`, {
        method: 'GET',
        attempts: 1,
    })
    if (!verify.ok || !verify.data) {
        MISSING_PROVIDER_JOB_IDS.add(providerJobId)
        return null
    }

    MISSING_PROVIDER_JOB_IDS.delete(providerJobId)
    return providerJobId
}

function readGenerationCache(userId) {
    const data = readJsonStorage(generationCacheKey(userId), { entries: [] })
    const now = Date.now()
    const entries = Array.isArray(data?.entries)
        ? data.entries.filter((entry) => {
            if (!entry || typeof entry !== 'object') return false
            if (!entry.key || !entry.resultUrl) return false
            const expiresAt = Number(entry.expiresAt)
            return Number.isFinite(expiresAt) && expiresAt > now
        })
        : []

    if (entries.length !== (Array.isArray(data?.entries) ? data.entries.length : 0)) {
        writeJsonStorage(generationCacheKey(userId), { entries })
    }
    return entries
}

function writeGenerationCache(userId, entries) {
    writeJsonStorage(generationCacheKey(userId), {
        entries: Array.isArray(entries) ? entries.slice(0, MAX_GENERATION_CACHE_ENTRIES) : [],
    })
}

function inferAssetKind(url, fallback = null) {
    const normalized = String(url || '').toLowerCase()
    if (/\.(mp4|mov|webm|mkv)(\?|#|$)/i.test(normalized)) return 'video'
    if (/\.(glb|gltf|obj|fbx|ply|stl|dae)(\?|#|$)/i.test(normalized)) return '3d'
    if (/\.(png|jpg|jpeg|webp|gif|bmp|tiff|svg)(\?|#|$)/i.test(normalized)) return 'image'
    return fallback || 'unknown'
}

function inferMimeType(kind, sourceUrl = '') {
    if (String(sourceUrl || '').startsWith('data:')) {
        const match = String(sourceUrl).match(/^data:([^;,]+)[;,]/i)
        if (match?.[1]) return match[1].toLowerCase()
    }
    if (kind === 'video') return 'video/mp4'
    if (kind === '3d') return 'model/gltf-binary'
    if (kind === 'image') return 'image/png'
    return 'application/octet-stream'
}

function normalizeTagList(value) {
    if (!Array.isArray(value)) return []
    return value
        .map((item) => normalizeText(item, 32).toLowerCase())
        .filter(Boolean)
        .slice(0, 12)
}

function normalizeCollectionValue(value) {
    const normalized = normalizeText(value || '', 80)
    return normalized || 'default'
}

function normalizeLibraryAsset(asset) {
    if (!asset || typeof asset !== 'object') return null
    const sourceUrl = String(asset.source_url || asset.sourceUrl || asset.result_url || '').trim()
    if (!sourceUrl) return null
    const createdAt = asset.created_at || asset.createdAt || new Date().toISOString()
    const kind = String(asset.kind || inferAssetKind(sourceUrl, asset.type)).toLowerCase()
    const metadata = asset.metadata && typeof asset.metadata === 'object' && !Array.isArray(asset.metadata)
        ? JSON.parse(JSON.stringify(asset.metadata))
        : null
    const tags = normalizeTagList(asset.tags || metadata?.tags)
    const favorite = Boolean(asset.favorite ?? metadata?.favorite)
    const collection = normalizeCollectionValue(asset.collection || metadata?.collection || 'default')
    return {
        id: String(asset.id || createId('asset')),
        title: normalizeText(asset.title || '', 120) || 'Generated Asset',
        source_url: sourceUrl.slice(0, 4096),
        kind,
        mime_type: normalizeText(asset.mime_type || inferMimeType(kind, sourceUrl), 160),
        model_id: normalizeText(asset.model_id || asset.modelId || '', 200) || null,
        provider: normalizeText(asset.provider || '', 120) || null,
        type: normalizeText(asset.type || kind, 40) || 'unknown',
        prompt_excerpt: normalizeText(asset.prompt_excerpt || asset.prompt || '', 220) || null,
        created_at: createdAt,
        updated_at: asset.updated_at || asset.updatedAt || createdAt,
        tags,
        favorite,
        collection,
        metadata: {
            ...(metadata || {}),
            tags,
            favorite,
            collection,
        },
    }
}

function readGenerationLibrary(userId) {
    const payload = readJsonStorage(generationLibraryKey(userId), { entries: [] })
    const normalized = Array.isArray(payload?.entries)
        ? payload.entries
            .map((entry) => normalizeLibraryAsset(entry))
            .filter(Boolean)
            .slice(0, MAX_GENERATION_LIBRARY_ENTRIES)
        : []
    if (!Array.isArray(payload?.entries) || normalized.length !== payload.entries.length) {
        writeJsonStorage(generationLibraryKey(userId), { entries: normalized })
    }
    return normalized
}

function writeGenerationLibrary(userId, entries) {
    writeJsonStorage(generationLibraryKey(userId), {
        entries: Array.isArray(entries) ? entries.slice(0, MAX_GENERATION_LIBRARY_ENTRIES) : [],
    })
}

function upsertGenerationLibraryAsset(userId, incomingAsset) {
    const normalized = normalizeLibraryAsset(incomingAsset)
    if (!normalized) return null
    const entries = readGenerationLibrary(userId)
    const deduped = entries.filter((entry) => entry.id !== normalized.id && entry.source_url !== normalized.source_url)
    writeGenerationLibrary(userId, [normalized, ...deduped])
    return normalized
}

function getCachedGeneration(userId, fingerprint) {
    const entries = readGenerationCache(userId)
    return entries.find((entry) => entry.key === fingerprint) || null
}

function storeCachedGeneration(userId, fingerprint, resultUrl, meta = {}) {
    if (!/^https?:\/\//i.test(String(resultUrl || ''))) return
    const entries = readGenerationCache(userId)
    const nextEntry = {
        key: fingerprint,
        resultUrl,
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + GENERATION_CACHE_TTL_MS,
        ...meta,
    }
    const deduped = entries.filter((entry) => entry.key !== fingerprint)
    writeGenerationCache(userId, [nextEntry, ...deduped])
    upsertGenerationLibraryAsset(userId, {
        id: createId('asset'),
        title: `${String(meta?.type || 'generated').toUpperCase()} ${normalizeText(meta?.modelId || '', 50)}`.trim(),
        source_url: resultUrl,
        model_id: meta?.modelId || null,
        provider: meta?.provider || null,
        type: meta?.type || inferAssetKind(resultUrl),
        prompt_excerpt: normalizeText(meta?.prompt || '', 220) || null,
        metadata: {
            from_cache: true,
            fingerprint,
            ...(meta || {}),
        },
    })
}

function hasStoredCredits(userId) {
    return localStorage.getItem(creditKey(userId)) != null
}

function readCredits(userId) {
    const raw = localStorage.getItem(creditKey(userId))
    const value = Number(raw)
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_CREDITS
}

function writeCredits(userId, credits) {
    localStorage.setItem(creditKey(userId), String(Math.max(0, Math.floor(credits))))
}

function readPlanAllocation(userId) {
    return readJsonStorage(planAllocationKey(userId), null)
}

function writePlanAllocation(userId, allocation) {
    writeJsonStorage(planAllocationKey(userId), allocation)
}

function ensureTierCredits(userId, userTier = 'free') {
    const tier = userTier || 'free'
    const tierCredits = getPlanMonthlyCredits(tier)
    const existingCredits = readCredits(userId)
    const hasCreditRecord = hasStoredCredits(userId)
    const allocation = readPlanAllocation(userId)

    if (!hasCreditRecord) {
        const seeded = tierCredits > 0 ? tierCredits : DEFAULT_CREDITS
        writeCredits(userId, seeded)
        writePlanAllocation(userId, {
            tier,
            seededCredits: seeded,
            seededAt: new Date().toISOString(),
        })
        return seeded
    }

    if (!allocation || allocation.tier !== tier) {
        const adjusted = Math.max(existingCredits, tierCredits || 0)
        writeCredits(userId, adjusted)
        writePlanAllocation(userId, {
            tier,
            seededCredits: adjusted,
            seededAt: new Date().toISOString(),
        })
        return adjusted
    }

    return existingCredits
}

async function withCreditCheck(userId, userTier, cost) {
    const required = Math.max(0, Math.floor(Number(cost) || 0))
    const serverSnapshot = await readServerCreditSnapshot(userId, userTier)
    if (serverSnapshot) {
        const current = Math.max(0, Math.floor(Number(serverSnapshot.credits_balance) || 0))
        if (current < required) {
            return { ok: false, error: `Insufficient credits. Need ${required}, have ${current}` }
        }
        return { ok: true, current, source: 'server' }
    }

    if (!LOCAL_BILLING_FALLBACK_ENABLED) {
        return {
            ok: false,
            error:
                'Billing service unavailable. Server-authoritative credits are required. Configure ORCHESTRATOR_API_TOKEN and billing env vars.',
        }
    }

    const current = ensureTierCredits(userId, userTier)
    if (current < required) {
        return { ok: false, error: `Insufficient credits. Need ${required}, have ${current}` }
    }
    return { ok: true, current, source: 'local_fallback' }
}

function readFallbackLedger(userId) {
    return readJsonStorage(fallbackLedgerKey(userId), {
        totalCreditsCharged: 0,
        totalBilledUsd: 0,
        totalProviderReserveUsd: 0,
        totalPlatformProfitUsd: 0,
        providerReserveByProvider: {
            replicate: 0,
            huggingface: 0,
            unknown: 0,
        },
        platformProfitAccountUsd: 0,
        entries: [],
    })
}

function writeFallbackLedger(userId, ledger) {
    writeJsonStorage(fallbackLedgerKey(userId), {
        ...ledger,
        entries: Array.isArray(ledger.entries) ? ledger.entries.slice(0, MAX_LEDGER_ENTRIES) : [],
    })
}

function appendFallbackLedgerEntry(userId, entry) {
    const current = readFallbackLedger(userId)
    const provider = entry.provider || 'unknown'
    const providerReserveByProvider = {
        replicate: Number(current.providerReserveByProvider?.replicate || 0),
        huggingface: Number(current.providerReserveByProvider?.huggingface || 0),
        unknown: Number(current.providerReserveByProvider?.unknown || 0),
    }
    if (!(provider in providerReserveByProvider)) {
        providerReserveByProvider[provider] = 0
    }
    providerReserveByProvider[provider] += Number(entry.providerReserveUsd || 0)

    const next = {
        ...current,
        totalCreditsCharged: Number(current.totalCreditsCharged || 0) + Number(entry.credits || 0),
        totalBilledUsd: Number(current.totalBilledUsd || 0) + Number(entry.billedUsd || 0),
        totalProviderReserveUsd: Number(current.totalProviderReserveUsd || 0) + Number(entry.providerReserveUsd || 0),
        totalPlatformProfitUsd: Number(current.totalPlatformProfitUsd || 0) + Number(entry.platformProfitUsd || 0),
        providerReserveByProvider,
        platformProfitAccountUsd: Number(current.platformProfitAccountUsd || 0) + Number(entry.platformProfitUsd || 0),
        entries: [entry, ...(Array.isArray(current.entries) ? current.entries : [])],
    }
    writeFallbackLedger(userId, next)
    return next
}

async function readLedger(userId) {
    const normalizedUserId = userId || 'guest'
    const result = await getOrchestratorJson(`/billing/ledger?user_id=${encodeURIComponent(normalizedUserId)}`, { attempts: 3 })
    if (result?.ledger && typeof result.ledger === 'object') {
        writeFallbackLedger(normalizedUserId, result.ledger)
        return result.ledger
    }
    const cached = readFallbackLedger(normalizedUserId)
    if (!LOCAL_BILLING_FALLBACK_ENABLED) {
        return {
            ...cached,
            warning: 'Server ledger unavailable. Showing cached ledger snapshot only.',
            storage: 'cache_only',
        }
    }
    return cached
}

async function appendLedgerEntry(userId, entry) {
    const normalizedUserId = userId || 'guest'
    const payload = {
        user_id: normalizedUserId,
        timestamp: entry.timestamp || new Date().toISOString(),
        operation: entry.operation || 'generation',
        model_id: entry.modelId || null,
        provider: entry.provider || 'unknown',
        credits: Number(entry.credits || 0),
        billed_usd: Number(entry.billedUsd || 0),
        provider_reserve_usd: Number(entry.providerReserveUsd || 0),
        platform_profit_usd: Number(entry.platformProfitUsd || 0),
        charge_multiplier: entry.chargeMultiplier == null ? null : Number(entry.chargeMultiplier),
        configured_provider_cost_usd:
            entry.configuredProviderCostUsd == null ? null : Number(entry.configuredProviderCostUsd),
        model_tier: entry.modelTier || null,
        provider_settlement_bucket: entry.providerSettlementBucket || null,
        platform_settlement_bucket: entry.platformSettlementBucket || null,
        metadata: entry.metadata || null,
    }
    const result = await postOrchestratorJson('/billing/ledger/entries', payload, { attempts: 3 })
    if (result?.ledger && typeof result.ledger === 'object') {
        writeFallbackLedger(normalizedUserId, result.ledger)
        return result.ledger
    }
    if (!LOCAL_BILLING_FALLBACK_ENABLED) {
        return null
    }
    return appendFallbackLedgerEntry(normalizedUserId, entry)
}

function buildChargeBreakdown(modelId, cost, provider) {
    const credits = Math.max(0, Number(cost) || 0)
    const creditValue = getCreditUnitValue()
    const modelPricing = modelId ? getModelPricing(modelId) : null

    if (modelPricing && modelPricing.credits > 0) {
        const scale = credits / modelPricing.credits
        const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1
        const billedUsd = modelPricing.billedUsd * safeScale
        const providerReserveUsd = modelPricing.providerReserveUsd * safeScale
        const platformProfitUsd = Math.max(0, billedUsd - providerReserveUsd)
        return {
            credits,
            billedUsd,
            providerReserveUsd,
            platformProfitUsd,
            chargeMultiplier: modelPricing.chargeMultiplier,
            configuredProviderCostUsd: Number(modelPricing.providerCost || 0) * safeScale,
            modelTier: modelPricing.tier || null,
            provider: provider || 'unknown',
        }
    }

    const billedUsd = credits * creditValue
    const providerReserveUsd = 0
    const platformProfitUsd = billedUsd
    return {
        credits,
        billedUsd,
        providerReserveUsd,
        platformProfitUsd,
        chargeMultiplier: null,
        configuredProviderCostUsd: 0,
        modelTier: null,
        provider: provider || 'unknown',
    }
}

async function applyCreditCharge({
    userId,
    userTier = 'free',
    current,
    cost,
    modelId,
    operation,
    provider,
    idempotencyKey = null,
    metadata = null,
}) {
    const normalizedCost = Math.max(0, Math.floor(Number(cost) || 0))
    const breakdown = buildChargeBreakdown(modelId, normalizedCost, provider)
    let remaining = Math.max(0, Number(current) - normalizedCost)
    let chargeSource = 'local_fallback'
    let chargeWasIdempotent = false

    const serverCharge = await chargeServerCredits({
        userId,
        userTier,
        cost: normalizedCost,
        idempotencyKey,
        metadata: {
            operation: operation || 'generation',
            model_id: modelId || null,
            provider: breakdown.provider,
            ...(metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}),
        },
    })
    if (serverCharge) {
        if (Number.isFinite(Number(serverCharge.credits_after))) {
            remaining = Math.max(0, Math.floor(Number(serverCharge.credits_after)))
        }
        chargeSource = 'server'
        chargeWasIdempotent = serverCharge.idempotent === true
    } else {
        if (!LOCAL_BILLING_FALLBACK_ENABLED) {
            throw new Error('Credit charge failed because server billing is unavailable.')
        }
        writeCreditCache(userId, userTier, remaining)
    }

    if (!chargeWasIdempotent) {
        const ledger = await appendLedgerEntry(userId, {
            timestamp: new Date().toISOString(),
            operation: operation || 'generation',
            modelId: modelId || null,
            provider: breakdown.provider,
            credits: breakdown.credits,
            billedUsd: breakdown.billedUsd,
            providerReserveUsd: breakdown.providerReserveUsd,
            platformProfitUsd: breakdown.platformProfitUsd,
            chargeMultiplier: breakdown.chargeMultiplier,
            configuredProviderCostUsd: breakdown.configuredProviderCostUsd,
            modelTier: breakdown.modelTier,
            providerSettlementBucket: `${breakdown.provider}_reserve`,
            platformSettlementBucket: 'platform_profit',
            metadata: {
                ...(metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}),
                credit_charge_source: chargeSource,
                idempotency_key: idempotencyKey || null,
            },
        })
        if (!ledger && !LOCAL_BILLING_FALLBACK_ENABLED) {
            throw new Error('Ledger write failed because server billing is unavailable.')
        }
    }

    return remaining
}

function normalizeProviderOutput(output) {
    if (!output) {
        return {
            resultUrl: null,
            releaseResult: null,
            usedProvider: null,
            usedModelId: null,
            failoverUsed: false,
        }
    }
    if (typeof output === 'string') {
        return {
            resultUrl: output,
            releaseResult: null,
            usedProvider: null,
            usedModelId: null,
            failoverUsed: false,
        }
    }
    if (output && typeof output === 'object') {
        if ('output' in output) {
            const nested = normalizeProviderOutput(output.output)
            return {
                ...nested,
                usedProvider: output.used_provider || nested.usedProvider || null,
                usedModelId: output.used_model_id || nested.usedModelId || null,
                failoverUsed: output.failover_used === true || nested.failoverUsed === true,
            }
        }
        if ('result_url' in output) {
            return {
                resultUrl: output.result_url || null,
                releaseResult: typeof output.release_result === 'function' ? output.release_result : null,
                usedProvider: output.used_provider || null,
                usedModelId: output.used_model_id || null,
                failoverUsed: output.failover_used === true,
            }
        }
        if ('url' in output) {
            return {
                resultUrl: output.url || null,
                releaseResult: typeof output.revoke === 'function' ? output.revoke : null,
                usedProvider: output.used_provider || null,
                usedModelId: output.used_model_id || null,
                failoverUsed: output.failover_used === true,
            }
        }
    }
    if (Array.isArray(output)) {
        return {
            resultUrl: output[0] || null,
            releaseResult: null,
            usedProvider: null,
            usedModelId: null,
            failoverUsed: false,
        }
    }
    return {
        resultUrl: null,
        releaseResult: null,
        usedProvider: null,
        usedModelId: null,
        failoverUsed: false,
    }
}

function getModelsForType(type) {
    if (type === 'video') return getVideoModels()
    if (type === 'image') return getImageModels()
    if (type === '3d') return getThreeDModels()
    return []
}

function getModelProvider(modelId, type) {
    const models = getModelsForType(type)
    return models.find((m) => m.id === modelId)?.provider || null
}

function ensureProviderAvailable(modelId, type) {
    const provider = getModelProvider(modelId, type)
    if (!provider) {
        return { ok: false, error: `Unknown ${type} model ${modelId}.` }
    }
    const active = getActiveProviders()
    if (!active.includes(provider)) {
        return { ok: false, error: `Provider ${provider} is not configured. Add the required API key.` }
    }
    return { ok: true, provider }
}

function resolveGenerationCost(modelId, fallbackCost) {
    const configuredPricing = getModelPricing(modelId)
    if (configuredPricing?.credits > 0) return configuredPricing.credits
    const configuredCost = getModelCreditCost(modelId)
    return configuredCost > 0 ? configuredCost : fallbackCost
}

function resolveVideoReservedCost(modelId, fallbackCost) {
    const videoModel = getVideoModels().find((model) => model.id === modelId)
    if (!videoModel) return resolveGenerationCost(modelId, fallbackCost)
    const candidateIds = [videoModel.id, ...(Array.isArray(videoModel.failoverModelIds) ? videoModel.failoverModelIds : [])]
    let maxCost = 0
    for (const candidateId of candidateIds) {
        maxCost = Math.max(maxCost, resolveGenerationCost(candidateId, fallbackCost))
    }
    return maxCost > 0 ? maxCost : resolveGenerationCost(modelId, fallbackCost)
}

function ensureModelAccess(userTier, modelId) {
    const normalizedTier = userTier || 'free'
    const modelTier = getModelTier(modelId)
    if (!canUseModel(normalizedTier, modelTier)) {
        return {
            ok: false,
            error: `Plan ${normalizedTier} cannot access ${modelTier} model ${modelId}.`,
            modelTier,
        }
    }
    return { ok: true, modelTier }
}

function ensureComplianceAccess({ modelTier, ageVerified, contentConsentAccepted, isAdmin }) {
    if (isAdmin) return { ok: true }
    if (modelTier === 'free') return { ok: true }
    if (ageVerified && contentConsentAccepted) return { ok: true }
    return {
        ok: false,
        error: 'Age verification + 18+ restricted-content consent required for paid models.',
    }
}

export async function getCredits(userId, userTier = 'free') {
    const snapshot = await readServerCreditSnapshot(userId, userTier)
    if (snapshot && Number.isFinite(Number(snapshot.credits_balance))) {
        return {
            credits: Math.max(0, Math.floor(Number(snapshot.credits_balance))),
            source: snapshot.storage || 'server',
            warning: snapshot.warning || null,
        }
    }

    if (!LOCAL_BILLING_FALLBACK_ENABLED) {
        return {
            credits: readCredits(userId),
            source: 'cache_only',
            warning: 'Server credit balance unavailable. Showing cached value only; billing fallback is disabled.',
        }
    }

    return {
        credits: ensureTierCredits(userId, userTier),
        source: 'local_fallback',
        warning: 'Server credit balance unavailable. Using local fallback.',
    }
}

export async function getBillingLedger(userId) {
    return await readLedger(userId)
}

export async function getGenerationLibrary(userId) {
    const entries = readGenerationLibrary(userId)
    return entries
        .slice()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export async function saveLibraryAsset(userId, payload = {}) {
    const sourceUrl = String(payload.source_url || payload.sourceUrl || '').trim()
    if (!sourceUrl) {
        return { ok: false, error: 'Asset URL is required.' }
    }
    const inferredKind = payload.kind || payload.type || inferAssetKind(sourceUrl, payload.type)
    if (sourceUrl.startsWith('data:')) {
        const isVideo = String(inferredKind || '').toLowerCase() === 'video' || sourceUrl.startsWith('data:video/')
        const maxLength = isVideo ? MAX_DATA_URL_VIDEO_BYTES : MAX_DATA_URL_IMAGE_BYTES
        if (sourceUrl.length > maxLength) {
            return {
                ok: false,
                error: isVideo
                    ? 'Edited video is too large for browser storage. Trim shorter segments or reduce duration.'
                    : 'Edited asset is too large for browser storage. Reduce resolution and retry.',
            }
        }
    }
    const asset = upsertGenerationLibraryAsset(userId, {
        id: payload.id || createId('asset'),
        title: payload.title || 'Edited Asset',
        source_url: sourceUrl,
        kind: inferredKind,
        mime_type: payload.mime_type || payload.mimeType || null,
        model_id: payload.model_id || payload.modelId || null,
        provider: payload.provider || null,
        type: payload.type || inferAssetKind(sourceUrl, inferredKind),
        prompt_excerpt: payload.prompt_excerpt || payload.prompt || null,
        created_at: payload.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: normalizeTagList(payload.tags || payload.metadata?.tags),
        favorite: Boolean(payload.favorite ?? payload.metadata?.favorite),
        collection: normalizeCollectionValue(payload.collection || payload.metadata?.collection || 'default'),
        metadata: payload.metadata || null,
    })
    if (!asset) return { ok: false, error: 'Unable to save asset.' }
    return { ok: true, asset, assets: await getGenerationLibrary(userId) }
}

export async function updateLibraryAsset(userId, assetId, updates = {}) {
    const id = String(assetId || '').trim()
    if (!id) return { ok: false, error: 'Asset id is required.' }
    const entries = readGenerationLibrary(userId)
    const index = entries.findIndex((entry) => entry.id === id)
    if (index === -1) {
        return { ok: false, error: 'Asset not found.' }
    }

    const current = entries[index]
    const nextAsset = normalizeLibraryAsset({
        ...current,
        title: updates.title != null ? updates.title : current.title,
        tags: updates.tags != null ? updates.tags : current.tags,
        favorite: updates.favorite != null ? updates.favorite : current.favorite,
        collection: updates.collection != null ? updates.collection : current.collection,
        metadata: {
            ...(current.metadata || {}),
            ...(updates.metadata && typeof updates.metadata === 'object' && !Array.isArray(updates.metadata) ? updates.metadata : {}),
            ...(updates.tags != null ? { tags: normalizeTagList(updates.tags) } : {}),
            ...(updates.favorite != null ? { favorite: Boolean(updates.favorite) } : {}),
            ...(updates.collection != null ? { collection: normalizeCollectionValue(updates.collection) } : {}),
        },
        updated_at: new Date().toISOString(),
    })
    if (!nextAsset) return { ok: false, error: 'Unable to update asset.' }

    const nextEntries = entries.slice()
    nextEntries[index] = nextAsset
    writeGenerationLibrary(userId, nextEntries)
    return { ok: true, asset: nextAsset, assets: await getGenerationLibrary(userId) }
}

export async function deleteLibraryAsset(userId, assetId) {
    const id = String(assetId || '').trim()
    if (!id) return { ok: false, error: 'Asset id is required.' }
    const entries = readGenerationLibrary(userId)
    const next = entries.filter((entry) => entry.id !== id)
    if (next.length === entries.length) {
        return { ok: false, error: 'Asset not found.' }
    }
    writeGenerationLibrary(userId, next)
    return { ok: true, assets: await getGenerationLibrary(userId) }
}

function normalizeProviderJobSnapshot(payload) {
    if (!payload || typeof payload !== 'object') return null
    const status = String(payload.status || '').toLowerCase()
    return {
        provider_job_id: payload.provider_job_id || null,
        provider: payload.provider || null,
        type: payload.type || null,
        model_id: payload.model_id || null,
        status,
        created_at: payload.created_at || null,
        updated_at: payload.updated_at || null,
        result_url: payload.result_url || null,
        events: Array.isArray(payload.events) ? payload.events : [],
    }
}

export async function getProviderJobStatus(providerJobId, { attempts = 3 } = {}) {
    if (!shouldUseProviderJobTracking()) return null
    if (!providerJobId) return null
    if (MISSING_PROVIDER_JOB_IDS.has(providerJobId)) return null
    const response = await orchestratorRequest(`/provider-jobs/${encodeURIComponent(providerJobId)}`, {
        method: 'GET',
        attempts,
    })
    if (!response.ok) {
        if (response.status === 404) MISSING_PROVIDER_JOB_IDS.add(providerJobId)
        return null
    }
    MISSING_PROVIDER_JOB_IDS.delete(providerJobId)
    return normalizeProviderJobSnapshot(response.data)
}

export async function pollProviderJobStatus(
    providerJobId,
    {
        maxAttempts = 18,
        initialDelayMs = 900,
        maxDelayMs = 6000,
        onUpdate,
        signal = null,
    } = {}
) {
    if (!shouldUseProviderJobTracking()) return null
    if (!providerJobId) return null
    if (MISSING_PROVIDER_JOB_IDS.has(providerJobId)) return null
    let delayMs = Math.max(250, Number(initialDelayMs) || 900)
    let lastSnapshot = null

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (signal?.aborted) break
        if (MISSING_PROVIDER_JOB_IDS.has(providerJobId)) break
        const snapshot = await getProviderJobStatus(providerJobId)
        if (snapshot) {
            lastSnapshot = snapshot
            if (typeof onUpdate === 'function') {
                onUpdate(snapshot)
            }
            if (PROVIDER_JOB_TERMINAL_STATUSES.has(snapshot.status)) {
                return snapshot
            }
        }

        if (attempt === maxAttempts - 1) break
        await sleep(delayMs)
        delayMs = Math.min(maxDelayMs, Math.round(delayMs * 1.5))
    }

    return lastSnapshot
}

function withInFlightGenerationRequest(requestKey, run, onProgress) {
    const key = normalizeText(requestKey, 600)
    if (!key) return run()
    const existing = IN_FLIGHT_GENERATION_REQUESTS.get(key)
    if (existing) {
        if (typeof onProgress === 'function') {
            onProgress({
                status: 'queued',
                message: 'Reusing in-flight generation request.',
            })
        }
        return existing
    }

    let promise = null
    promise = (async () => {
        try {
            return await run()
        } finally {
            if (IN_FLIGHT_GENERATION_REQUESTS.get(key) === promise) {
                IN_FLIGHT_GENERATION_REQUESTS.delete(key)
            }
        }
    })()
    IN_FLIGHT_GENERATION_REQUESTS.set(key, promise)
    return promise
}

async function getCurrentCredits(userId, userTier = 'free') {
    const snapshot = await readServerCreditSnapshot(userId, userTier)
    if (snapshot && Number.isFinite(Number(snapshot.credits_balance))) {
        const credits = Math.max(0, Math.floor(Number(snapshot.credits_balance)))
        writeCreditCache(userId, userTier, credits)
        return credits
    }
    if (!LOCAL_BILLING_FALLBACK_ENABLED) {
        return readCredits(userId)
    }
    return ensureTierCredits(userId, userTier)
}

const VIDEO_MODEL_PRESETS = {
    'seedance-1-lite': {
        durations: [5, 10],
        resolutions: ['480p', '720p', '1080p'],
    },
    'seedance-1-pro': {
        durations: [5, 10],
        resolutions: ['480p', '720p', '1080p'],
    },
    'veo-3-fast': {
        durations: [4, 6, 8],
        resolutions: ['720p', '1080p'],
    },
    'veo-3': {
        durations: [4, 6, 8],
        resolutions: ['720p', '1080p'],
    },
    'hailuo-02-fast': {
        durations: [6, 10],
        resolutions: ['512P'],
    },
}

function resolutionToLabel(resolution) {
    const value = String(resolution || '').trim().toLowerCase()
    if (!value) return ''
    if (value.endsWith('p')) return value
    const match = value.match(/^(\d{3,5})x(\d{3,5})$/)
    if (!match) return value
    const height = Number(match[2])
    if (!Number.isFinite(height)) return value
    return `${height}p`
}

function normalizeVideoDuration(duration) {
    const value = Number(duration)
    if (!Number.isFinite(value)) return null
    return Math.max(1, Math.round(value))
}

function normalizeVideoResolution(resolution) {
    const label = resolutionToLabel(resolution)
    if (!label) return null
    return label.toUpperCase() === '512P' ? '512P' : label.toLowerCase()
}

export function validateGenerationPreflight({
    type,
    modelId,
    prompt,
    duration,
    resolution,
    width,
    height,
    imageFile,
    videoFile,
    maxTriangles,
    maxTexture,
}) {
    const normalizedType = String(type || '').toLowerCase()
    const errors = []
    const warnings = []
    const checks = []

    if (!modelId) {
        errors.push('Model is required.')
        return { ok: false, errors, warnings, checks }
    }

    if (normalizedType === 'video') {
        const models = getVideoModels()
        const selectedModel = models.find((model) => model.id === modelId)
        if (!selectedModel) {
            errors.push(`Unknown video model: ${modelId}`)
            return { ok: false, errors, warnings, checks }
        }
        if (!normalizeText(prompt, 1200)) {
            errors.push('Prompt is required for video generation.')
        }
        if (selectedModel.requiresImageInput && !(typeof File !== 'undefined' && imageFile instanceof File)) {
            errors.push(`${selectedModel.name} requires a reference image.`)
        }
        if (selectedModel.requiresVideoInput && !(typeof File !== 'undefined' && videoFile instanceof File)) {
            errors.push(`${selectedModel.name} requires a driving video.`)
        }

        const preset = VIDEO_MODEL_PRESETS[selectedModel.id]
        const durationValue = normalizeVideoDuration(duration)
        const resolutionValue = normalizeVideoResolution(resolution)
        if (preset?.durations?.length && durationValue != null && !preset.durations.includes(durationValue)) {
            warnings.push(`${selectedModel.name} supports durations: ${preset.durations.join(', ')}s. Input will be normalized.`)
        }
        if (preset?.resolutions?.length && resolutionValue) {
            const normalizedAllowed = preset.resolutions.map((item) => String(item).toLowerCase())
            if (!normalizedAllowed.includes(String(resolutionValue).toLowerCase())) {
                warnings.push(`${selectedModel.name} supports resolutions: ${preset.resolutions.join(', ')}. Input will be normalized.`)
            }
        }

        checks.push({ label: 'Model selected', ok: true })
        checks.push({ label: 'Prompt entered', ok: Boolean(normalizeText(prompt, 1200)) })
        checks.push({
            label: 'Reference image',
            ok: !selectedModel.requiresImageInput || (typeof File !== 'undefined' && imageFile instanceof File),
        })
        checks.push({
            label: 'Driving video',
            ok: !selectedModel.requiresVideoInput || (typeof File !== 'undefined' && videoFile instanceof File),
        })
    }

    if (normalizedType === 'image') {
        if (!normalizeText(prompt, 1200)) {
            errors.push('Prompt is required for image generation.')
        }
        const safeWidth = Number(width)
        const safeHeight = Number(height)
        if (Number.isFinite(safeWidth) && (safeWidth < 256 || safeWidth > 4096)) {
            warnings.push('Width should stay between 256 and 4096.')
        }
        if (Number.isFinite(safeHeight) && (safeHeight < 256 || safeHeight > 4096)) {
            warnings.push('Height should stay between 256 and 4096.')
        }
        checks.push({ label: 'Model selected', ok: true })
        checks.push({ label: 'Prompt entered', ok: Boolean(normalizeText(prompt, 1200)) })
    }

    if (normalizedType === '3d') {
        const model = getThreeDModels().find((item) => item.id === modelId)
        if (!model) {
            errors.push(`Unknown 3D model: ${modelId}`)
            return { ok: false, errors, warnings, checks }
        }
        if (!(typeof File !== 'undefined' && imageFile instanceof File)) {
            errors.push('A source image is required for 3D asset generation.')
        }
        const triangles = Number(maxTriangles)
        if (Number.isFinite(triangles) && (triangles < 5000 || triangles > 2000000)) {
            warnings.push('Triangle budgets outside 5,000-2,000,000 may be rejected by provider limits.')
        }
        const texture = Number(maxTexture)
        if (Number.isFinite(texture) && texture > 8192) {
            warnings.push('Texture size above 8192 can cause engine import/performance issues.')
        }

        checks.push({ label: 'Model selected', ok: true })
        checks.push({ label: 'Source image uploaded', ok: typeof File !== 'undefined' && imageFile instanceof File })
        checks.push({ label: 'Optional prompt added', ok: true })
    }

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        checks,
    }
}

export async function generateVideo({
    userId,
    userTier,
    ageVerified,
    contentConsentAccepted,
    isAdmin,
    modelId,
    prompt,
    style,
    duration,
    resolution,
    imageFile,
    videoFile,
    onProgress,
}) {
    const normalizedPrompt = normalizeText(prompt, 1200)
    const normalizedStyle = normalizeText(style, 160)
    const normalizedDuration = Number(duration) || 5
    const normalizedResolution = normalizeText(resolution, 32) || '720p'
    const imageFingerprint = normalizeFileFingerprint(imageFile)
    const videoFingerprint = normalizeFileFingerprint(videoFile)
    const preflight = validateGenerationPreflight({
        type: 'video',
        modelId,
        prompt: normalizedPrompt,
        duration: normalizedDuration,
        resolution: normalizedResolution,
        imageFile,
        videoFile,
    })
    if (!preflight.ok) return { error: preflight.errors.join(' ') }

    const access = ensureModelAccess(userTier, modelId)
    if (!access.ok) return { error: access.error }
    const compliance = ensureComplianceAccess({
        modelTier: access.modelTier,
        ageVerified,
        contentConsentAccepted,
        isAdmin,
    })
    if (!compliance.ok) return { error: compliance.error }

    const fingerprint = makeGenerationFingerprint({
        type: 'video',
        modelId,
        prompt: normalizedPrompt,
        style: normalizedStyle,
        duration: normalizedDuration,
        resolution: normalizedResolution,
        imageFingerprint,
        videoFingerprint,
    })
    const cached = getCachedGeneration(userId, fingerprint)
    if (cached?.resultUrl) {
        if (typeof onProgress === 'function') onProgress({ status: 'cached' })
        return {
            result_url: cached.resultUrl,
            credits_remaining: await getCurrentCredits(userId, userTier),
            cache_hit: true,
        }
    }

    const requestKey = `video:${fingerprint}`
    return await withInFlightGenerationRequest(requestKey, async () => {
        const provider = getModelProvider(modelId, 'video')
        if (!provider) return { error: `Unknown video model ${modelId}.` }
        if (getActiveProviders().length === 0) {
            return { error: 'No configured providers are available for video generation.' }
        }

        const preflightCost = resolveVideoReservedCost(modelId, normalizedDuration === 10 ? 100 : 50)
        const check = await withCreditCheck(userId, userTier, preflightCost)
        if (!check.ok) return { error: check.error }

        const providerJobId = await createProviderJob({
            type: 'video',
            provider,
            modelId,
            userId,
            userTier,
            prompt: normalizedPrompt,
            metadata: {
                duration: normalizedDuration,
                resolution: normalizedResolution,
                hasImageReference: Boolean(imageFingerprint),
                hasVideoReference: Boolean(videoFingerprint),
                preflight_warnings: preflight.warnings,
            },
        })
        if (providerJobId && typeof onProgress === 'function') {
            onProgress({
                status: 'queued',
                message: 'Provider job accepted.',
                provider_job_id: providerJobId,
            })
        }

        const relayProgress = (event) => {
            if (typeof onProgress === 'function') onProgress(event)
            if (!providerJobId) return
            queueProviderJobEvent(providerJobId, {
                status: event?.status || 'running',
                message: normalizeText(event?.message || '', 240) || null,
                metadata: event || null,
            })
        }

        try {
            const output = await providerGenerateVideo({
                modelId,
                prompt: normalizedPrompt,
                style: normalizedStyle,
                duration: normalizedDuration,
                resolution: normalizedResolution,
                imageFile,
                videoFile,
                onProgress: relayProgress,
            })
            const { resultUrl, releaseResult, usedProvider, usedModelId, failoverUsed } = normalizeProviderOutput(output)
            if (!resultUrl) return { error: 'Generation completed without output URL' }
            const billedModelId = usedModelId || modelId
            const finalCost = resolveGenerationCost(billedModelId, preflightCost)
            if (check.current < finalCost) {
                return {
                    error: `Failover selected a higher-cost model (${billedModelId}) requiring ${finalCost} credits, but only ${check.current} are available.`,
                }
            }
            const creditsRemaining = await applyCreditCharge({
                userId,
                userTier,
                current: check.current,
                cost: finalCost,
                modelId: billedModelId,
                operation: 'video_generation',
                provider: usedProvider || provider,
                idempotencyKey: requestKey,
                metadata: {
                    request_fingerprint: fingerprint,
                    failover_used: Boolean(failoverUsed),
                },
            })
            storeCachedGeneration(userId, fingerprint, resultUrl, {
                type: 'video',
                modelId: billedModelId,
                provider: usedProvider || provider,
            })
            queueProviderJobEvent(providerJobId, {
                status: 'succeeded',
                message: 'Generation completed',
                result_url: resultUrl,
                metadata: {
                    model_id: billedModelId,
                    provider: usedProvider || provider,
                    failover_used: Boolean(failoverUsed),
                },
            })
            return {
                result_url: resultUrl,
                credits_remaining: creditsRemaining,
                release_result: releaseResult,
                cache_hit: false,
                model_id_used: billedModelId,
                provider_used: usedProvider || provider,
                failover_used: Boolean(failoverUsed),
                provider_job_id: providerJobId,
            }
        } catch (error) {
            queueProviderJobEvent(providerJobId, {
                status: 'failed',
                message: error instanceof Error ? error.message : 'Video generation failed',
            })
            return { error: error instanceof Error ? error.message : 'Video generation failed' }
        }
    }, onProgress)
}

export async function generateImage({
    userId,
    userTier,
    ageVerified,
    contentConsentAccepted,
    isAdmin,
    modelId,
    prompt,
    style,
    width,
    height,
    onProgress,
}) {
    const normalizedPrompt = normalizeText(prompt, 1200)
    const normalizedStyle = normalizeText(style, 160)
    const normalizedWidth = Number(width) || 1024
    const normalizedHeight = Number(height) || 1024
    const preflight = validateGenerationPreflight({
        type: 'image',
        modelId,
        prompt: normalizedPrompt,
        width: normalizedWidth,
        height: normalizedHeight,
    })
    if (!preflight.ok) return { error: preflight.errors.join(' ') }

    const access = ensureModelAccess(userTier, modelId)
    if (!access.ok) return { error: access.error }
    const compliance = ensureComplianceAccess({
        modelTier: access.modelTier,
        ageVerified,
        contentConsentAccepted,
        isAdmin,
    })
    if (!compliance.ok) return { error: compliance.error }

    const fingerprint = makeGenerationFingerprint({
        type: 'image',
        modelId,
        prompt: normalizedPrompt,
        style: normalizedStyle,
        width: normalizedWidth,
        height: normalizedHeight,
    })
    const cached = getCachedGeneration(userId, fingerprint)
    if (cached?.resultUrl) {
        if (typeof onProgress === 'function') onProgress({ status: 'cached' })
        return {
            result_url: cached.resultUrl,
            credits_remaining: await getCurrentCredits(userId, userTier),
            cache_hit: true,
        }
    }

    const requestKey = `image:${fingerprint}`
    return await withInFlightGenerationRequest(requestKey, async () => {
        const providerStatus = ensureProviderAvailable(modelId, 'image')
        if (!providerStatus.ok) return { error: providerStatus.error }

        const cost = resolveGenerationCost(modelId, 10)
        const check = await withCreditCheck(userId, userTier, cost)
        if (!check.ok) return { error: check.error }

        const providerJobId = await createProviderJob({
            type: 'image',
            provider: providerStatus.provider,
            modelId,
            userId,
            userTier,
            prompt: normalizedPrompt,
            metadata: {
                width: normalizedWidth,
                height: normalizedHeight,
                preflight_warnings: preflight.warnings,
            },
        })
        if (providerJobId && typeof onProgress === 'function') {
            onProgress({
                status: 'queued',
                message: 'Provider job accepted.',
                provider_job_id: providerJobId,
            })
        }

        const relayProgress = (event) => {
            if (typeof onProgress === 'function') onProgress(event)
            if (!providerJobId) return
            queueProviderJobEvent(providerJobId, {
                status: event?.status || 'running',
                message: normalizeText(event?.message || '', 240) || null,
                metadata: event || null,
            })
        }

        try {
            const output = await providerGenerateImage({
                modelId,
                prompt: normalizedPrompt,
                style: normalizedStyle,
                width: normalizedWidth,
                height: normalizedHeight,
                onProgress: relayProgress,
            })
            const { resultUrl, releaseResult } = normalizeProviderOutput(output)
            if (!resultUrl) return { error: 'Generation completed without output URL' }
            const creditsRemaining = await applyCreditCharge({
                userId,
                userTier,
                current: check.current,
                cost,
                modelId,
                operation: 'image_generation',
                provider: providerStatus.provider,
                idempotencyKey: requestKey,
                metadata: { request_fingerprint: fingerprint },
            })
            storeCachedGeneration(userId, fingerprint, resultUrl, {
                type: 'image',
                modelId,
            })
            queueProviderJobEvent(providerJobId, {
                status: 'succeeded',
                message: 'Image generation completed',
                result_url: resultUrl,
                metadata: { model_id: modelId, provider: providerStatus.provider },
            })
            return {
                result_url: resultUrl,
                credits_remaining: creditsRemaining,
                release_result: releaseResult,
                cache_hit: false,
                provider_job_id: providerJobId,
            }
        } catch (error) {
            queueProviderJobEvent(providerJobId, {
                status: 'failed',
                message: error instanceof Error ? error.message : 'Image generation failed',
            })
            return { error: error instanceof Error ? error.message : 'Image generation failed' }
        }
    }, onProgress)
}

export async function generate3DAsset({
    userId,
    userTier,
    ageVerified,
    contentConsentAccepted,
    isAdmin,
    modelId,
    prompt,
    style,
    imageFile,
    maxTriangles,
    maxTexture,
    onProgress,
}) {
    const normalizedPrompt = normalizeText(prompt, 1200)
    const normalizedStyle = normalizeText(style, 160)
    const fileFingerprint = normalizeFileFingerprint(imageFile)
    const preflight = validateGenerationPreflight({
        type: '3d',
        modelId,
        prompt: normalizedPrompt,
        imageFile,
        maxTriangles,
        maxTexture,
    })
    if (!preflight.ok) return { error: preflight.errors.join(' ') }
    if (!fileFingerprint) return { error: 'Upload a source image for 3D asset generation.' }

    const access = ensureModelAccess(userTier, modelId)
    if (!access.ok) return { error: access.error }
    const compliance = ensureComplianceAccess({
        modelTier: access.modelTier,
        ageVerified,
        contentConsentAccepted,
        isAdmin,
    })
    if (!compliance.ok) return { error: compliance.error }

    const fingerprint = makeGenerationFingerprint({
        type: '3d',
        modelId,
        prompt: normalizedPrompt,
        style: normalizedStyle,
        fileFingerprint,
        maxTriangles: Number(maxTriangles) || null,
        maxTexture: Number(maxTexture) || null,
    })
    const cached = getCachedGeneration(userId, fingerprint)
    if (cached?.resultUrl) {
        if (typeof onProgress === 'function') onProgress({ status: 'cached' })
        return {
            result_url: cached.resultUrl,
            credits_remaining: await getCurrentCredits(userId, userTier),
            cache_hit: true,
        }
    }

    const requestKey = `3d:${fingerprint}`
    return await withInFlightGenerationRequest(requestKey, async () => {
        const providerStatus = ensureProviderAvailable(modelId, '3d')
        if (!providerStatus.ok) return { error: providerStatus.error }

        const cost = resolveGenerationCost(modelId, 120)
        const check = await withCreditCheck(userId, userTier, cost)
        if (!check.ok) return { error: check.error }

        const providerJobId = await createProviderJob({
            type: '3d',
            provider: providerStatus.provider,
            modelId,
            userId,
            userTier,
            prompt: normalizedPrompt,
            metadata: {
                maxTriangles: Number(maxTriangles) || null,
                maxTexture: Number(maxTexture) || null,
                hasSourceImage: Boolean(fileFingerprint),
                preflight_warnings: preflight.warnings,
            },
        })
        if (providerJobId && typeof onProgress === 'function') {
            onProgress({
                status: 'queued',
                message: 'Provider job accepted.',
                provider_job_id: providerJobId,
            })
        }

        const relayProgress = (event) => {
            if (typeof onProgress === 'function') onProgress(event)
            if (!providerJobId) return
            queueProviderJobEvent(providerJobId, {
                status: event?.status || 'running',
                message: normalizeText(event?.message || '', 240) || null,
                metadata: event || null,
            })
        }

        try {
            const output = await providerGenerate3DAsset({
                modelId,
                imageFile,
                maxTriangles: Number(maxTriangles) || null,
                maxTexture: Number(maxTexture) || null,
                onProgress: relayProgress,
            })
            const { resultUrl, releaseResult } = normalizeProviderOutput(output)
            if (!resultUrl) return { error: '3D generation completed without output URL' }
            const creditsRemaining = await applyCreditCharge({
                userId,
                userTier,
                current: check.current,
                cost,
                modelId,
                operation: '3d_generation',
                provider: providerStatus.provider,
                idempotencyKey: requestKey,
                metadata: { request_fingerprint: fingerprint },
            })
            storeCachedGeneration(userId, fingerprint, resultUrl, {
                type: '3d',
                modelId,
            })
            queueProviderJobEvent(providerJobId, {
                status: 'succeeded',
                message: '3D generation completed',
                result_url: resultUrl,
                metadata: { model_id: modelId, provider: providerStatus.provider },
            })
            return {
                result_url: resultUrl,
                credits_remaining: creditsRemaining,
                release_result: releaseResult,
                cache_hit: false,
                provider_job_id: providerJobId,
            }
        } catch (error) {
            queueProviderJobEvent(providerJobId, {
                status: 'failed',
                message: error instanceof Error ? error.message : '3D generation failed',
            })
            return { error: error instanceof Error ? error.message : '3D generation failed' }
        }
    }, onProgress)
}

function classifyMood(energy, bpm) {
    if (bpm >= 140 || energy >= 0.75) return 'Peak Energy'
    if (bpm >= 120 || energy >= 0.55) return 'Driving'
    if (bpm <= 95 || energy <= 0.3) return 'Ambient'
    return 'Balanced'
}

function getVisualSuggestions(mood) {
    if (mood === 'Peak Energy') {
        return [
            { type: 'Intro', duration: 16, style: 'Aggressive strobe geometry', assetType: 'Loop', intensity: 0.9 },
            { type: 'Build', duration: 32, style: 'Neon tunnel acceleration', assetType: 'Shader', intensity: 0.95 },
            { type: 'Drop', duration: 48, style: 'Glitch burst with chromatic trails', assetType: 'Overlay', intensity: 1.0 },
        ]
    }
    if (mood === 'Ambient') {
        return [
            { type: 'Intro', duration: 16, style: 'Soft particulate haze', assetType: 'Loop', intensity: 0.3 },
            { type: 'Middle', duration: 32, style: 'Slow fractal bloom', assetType: 'Shader', intensity: 0.4 },
            { type: 'Outro', duration: 32, style: 'Minimal gradient drift', assetType: 'Overlay', intensity: 0.35 },
        ]
    }
    return [
        { type: 'Intro', duration: 16, style: 'Pulsing abstract geometry', assetType: 'Loop', intensity: 0.55 },
        { type: 'Middle', duration: 32, style: 'Rhythmic line displacement', assetType: 'Shader', intensity: 0.65 },
        { type: 'Drop', duration: 32, style: 'Color-shifted texture sweep', assetType: 'Overlay', intensity: 0.7 },
    ]
}

export async function analyzeAudio({ userId, userTier, tracks }) {
    const trackList = Array.isArray(tracks) ? tracks : []
    const cost = trackList.length * 20
    const check = await withCreditCheck(userId, userTier, cost)
    if (!check.ok) return { error: check.error }

    const enrichedTracks = trackList.map((track, index) => {
        const bpm = Number(track.bpm) || 120
        const energy = Number(track.energy) || 0.5
        const mood = classifyMood(energy, bpm)
        return {
            ...track,
            id: `track-${index + 1}`,
            mood,
            visualSuggestions: getVisualSuggestions(mood),
        }
    })

    const totalDuration = enrichedTracks.reduce((sum, track) => sum + (Number(track.duration) || 0), 0)
    const creditsRemaining = await applyCreditCharge({
        userId,
        userTier,
        current: check.current,
        cost,
        operation: 'audio_analysis',
        provider: 'unknown',
        idempotencyKey: `audio:${makeGenerationFingerprint({ userId, tracks: trackList })}`,
    })

    return {
        setlist_id: `setlist-${Date.now()}`,
        tracks: enrichedTracks,
        total_duration: totalDuration,
        credits_remaining: creditsRemaining,
    }
}
