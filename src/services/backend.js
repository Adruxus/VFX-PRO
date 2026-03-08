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
const MAX_LEDGER_ENTRIES = 200
const MAX_GENERATION_CACHE_ENTRIES = 80
const GENERATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const ORCHESTRATOR_BASE_URL = '/api/v1'
const ORCHESTRATOR_DEFAULT_ATTEMPTS = 4
const ORCHESTRATOR_DEFAULT_TIMEOUT_MS = 12000
const ORCHESTRATOR_RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])
const PROVIDER_JOB_TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'canceled', 'aborted', 'completed'])
const ORCHESTRATOR_API_TOKEN = import.meta.env.VITE_ORCHESTRATOR_API_TOKEN || ''

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

function queueProviderJobEvent(providerJobId, payload) {
    if (!providerJobId) return
    void postOrchestratorJson(`/provider-jobs/${providerJobId}/events`, payload, { attempts: 3 })
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
    const result = await postOrchestratorJson('/provider-jobs', {
        type,
        provider,
        model_id: modelId,
        user_id: userId || 'guest',
        user_tier: userTier || 'free',
        prompt_excerpt: normalizeText(prompt, 180),
        metadata: metadata || null,
    })
    return result?.provider_job_id || null
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

function withCreditCheck(userId, userTier, cost) {
    const current = ensureTierCredits(userId, userTier)
    if (current < cost) {
        return { ok: false, error: `Insufficient credits. Need ${cost}, have ${current}` }
    }
    return { ok: true, current }
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
    return readFallbackLedger(normalizedUserId)
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

async function applyCreditCharge({ userId, current, cost, modelId, operation, provider }) {
    const remaining = Math.max(0, current - cost)
    writeCredits(userId, remaining)
    const breakdown = buildChargeBreakdown(modelId, cost, provider)
    await appendLedgerEntry(userId, {
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
    })
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
    return { credits: ensureTierCredits(userId, userTier) }
}

export async function getBillingLedger(userId) {
    return await readLedger(userId)
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
    if (!providerJobId) return null
    const result = await getOrchestratorJson(`/provider-jobs/${encodeURIComponent(providerJobId)}`, { attempts })
    return normalizeProviderJobSnapshot(result)
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
    if (!providerJobId) return null
    let delayMs = Math.max(250, Number(initialDelayMs) || 900)
    let lastSnapshot = null

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (signal?.aborted) break
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
    if (!normalizedPrompt) return { error: 'Prompt cannot be empty.' }

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
            credits_remaining: ensureTierCredits(userId, userTier),
            cache_hit: true,
        }
    }

    const provider = getModelProvider(modelId, 'video')
    if (!provider) return { error: `Unknown video model ${modelId}.` }
    if (getActiveProviders().length === 0) {
        return { error: 'No configured providers are available for video generation.' }
    }

    const preflightCost = resolveVideoReservedCost(modelId, normalizedDuration === 10 ? 100 : 50)
    const check = withCreditCheck(userId, userTier, preflightCost)
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
            current: check.current,
            cost: finalCost,
            modelId: billedModelId,
            operation: 'video_generation',
            provider: usedProvider || provider,
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
    if (!normalizedPrompt) return { error: 'Prompt cannot be empty.' }

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
            credits_remaining: ensureTierCredits(userId, userTier),
            cache_hit: true,
        }
    }

    const providerStatus = ensureProviderAvailable(modelId, 'image')
    if (!providerStatus.ok) return { error: providerStatus.error }

    const cost = resolveGenerationCost(modelId, 10)
    const check = withCreditCheck(userId, userTier, cost)
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
            current: check.current,
            cost,
            modelId,
            operation: 'image_generation',
            provider: providerStatus.provider,
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
            credits_remaining: ensureTierCredits(userId, userTier),
            cache_hit: true,
        }
    }

    const providerStatus = ensureProviderAvailable(modelId, '3d')
    if (!providerStatus.ok) return { error: providerStatus.error }

    const cost = resolveGenerationCost(modelId, 120)
    const check = withCreditCheck(userId, userTier, cost)
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
            current: check.current,
            cost,
            modelId,
            operation: '3d_generation',
            provider: providerStatus.provider,
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
    const check = withCreditCheck(userId, userTier, cost)
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
        current: check.current,
        cost,
        operation: 'audio_analysis',
        provider: 'unknown',
    })

    return {
        setlist_id: `setlist-${Date.now()}`,
        tracks: enrichedTracks,
        total_duration: totalDuration,
        credits_remaining: creditsRemaining,
    }
}
