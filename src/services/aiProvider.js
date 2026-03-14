/**
 * Multi-Provider AI Service
 * Supports Replicate + Hugging Face APIs + Hugging Face Spaces (Gradio)
 */
import providers from '@/config/ai-providers.json'

const PROVIDER_PROXY_BASE = '/api/v1/provider'
const ALLOW_DIRECT_PROVIDER_CALLS_LOCAL =
    import.meta.env.DEV && String(import.meta.env.VITE_ALLOW_DIRECT_PROVIDER_CALLS || '').toLowerCase() === 'true'
const REQUEST_TIMEOUT_MS = 120000
const HEALTH_TIMEOUT_MS = 8000
const HEALTH_CACHE_TTL_MS = 60 * 1000
const HUGGINGFACE_SPACE_URL = 'https://huggingface.co/spaces/'
const SPACE_HOST_SUFFIX = '.hf.space'
const WAN21_STATUS_POLL_MS = 2500
const WAN21_STATUS_MAX_ATTEMPTS = 360
const WAN21_MAX_WAIT_MS = 8 * 60 * 1000
const WAN21_QUEUE_FAILOVER_THRESHOLD = 120
const WAN21_QUEUE_FAILOVER_STREAK = 3
const SPACE_PREDICT_TIMEOUT_MS = 8 * 60 * 1000
const MAX_REPLICATE_IMAGE_BYTES = 4 * 1024 * 1024
const DEFAULT_VIDEO_SECONDS = 5
const REPLICATE_POLL_DEFAULT_OPTIONS = Object.freeze({
    maxAttempts: 120,
    intervalMs: 2000,
    requestTimeoutMs: 25000,
    maxTransientErrors: 5,
})
const REPLICATE_POLL_MODEL_OPTIONS = {
    'seedance-1-lite': {
        maxAttempts: 96,
        intervalMs: 2000,
        requestTimeoutMs: 20000,
        maxTransientErrors: 4,
    },
    'seedance-1-pro': {
        maxAttempts: 120,
        intervalMs: 2000,
        requestTimeoutMs: 22000,
        maxTransientErrors: 5,
    },
    'runway-gen4-turbo': {
        maxAttempts: 100,
        intervalMs: 2000,
        requestTimeoutMs: 20000,
        maxTransientErrors: 4,
    },
    'kling-2.1': {
        maxAttempts: 150,
        intervalMs: 2200,
        requestTimeoutMs: 24000,
        maxTransientErrors: 5,
    },
    'hailuo-02-fast': {
        maxAttempts: 140,
        intervalMs: 2200,
        requestTimeoutMs: 24000,
        maxTransientErrors: 5,
    },
    'hailuo-02': {
        maxAttempts: 180,
        intervalMs: 2200,
        requestTimeoutMs: 24000,
        maxTransientErrors: 6,
    },
    'veo-3-fast': {
        maxAttempts: 180,
        intervalMs: 2500,
        requestTimeoutMs: 28000,
        maxTransientErrors: 6,
    },
    'veo-3': {
        maxAttempts: 220,
        intervalMs: 2500,
        requestTimeoutMs: 30000,
        maxTransientErrors: 6,
    },
}
const REPLICATE_VIDEO_MODEL_CONSTRAINTS = {
    'seedance-1-lite': {
        durationValues: [5, 10],
        resolutionValues: ['480p', '720p', '1080p'],
    },
    'seedance-1-pro': {
        durationValues: [5, 10],
        resolutionValues: ['480p', '720p', '1080p'],
    },
    'veo-3-fast': {
        durationValues: [4, 6, 8],
        resolutionValues: ['720p', '1080p'],
    },
    'veo-3': {
        durationValues: [4, 6, 8],
        resolutionValues: ['720p', '1080p'],
    },
}
let gradioClientModulePromise = null
const providerHealthCache = new Map()
let providerProxyHealthSnapshot = null
let providerProxyHealthCachedAt = 0

function shouldUseServerProviderProxy() {
    if (typeof window === 'undefined') return true
    const host = String(window.location.hostname || '').toLowerCase()
    const isLocal = host === 'localhost' || host === '127.0.0.1'
    if (isLocal && ALLOW_DIRECT_PROVIDER_CALLS_LOCAL) return false
    return true
}

async function parseProxyError(res, fallback) {
    try {
        const payload = await res.json()
        const detail = payload?.message || payload?.error || payload?.detail
        return detail ? `${fallback}: ${detail}` : fallback
    } catch {
        return fallback
    }
}

function hasKey(provider) {
    if (provider === 'replicate') return true
    if (provider === 'huggingface') return true
    return false
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function clampNumber(value, { min, max, fallback }) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback
    return Math.min(max, Math.max(min, parsed))
}

function randomSeed(max = 2147483647) {
    return Math.floor(Math.random() * max)
}

function looksLikeMediaFileReference(value) {
    const text = String(value || '').trim()
    if (!text) return false
    if (/^(file=|gradio_api\/file=|\/?gradio_api\/file=)/i.test(text)) return true
    if (/\.(mp4|mov|webm|mkv|gif|png|jpe?g|webp|bmp|tiff|glb|gltf|fbx|obj|stl|ply|dae|zip|wav|mp3|ogg|json)(\?|#|$)/i.test(text)) {
        return true
    }
    if (/^\/tmp\//i.test(text)) return true
    if (/^[^/\s]+\/[^/\s]+\.[a-z0-9]{2,8}(\?|#|$)/i.test(text)) return true
    return false
}

function toSpaceUrl(spaceId) {
    return `${HUGGINGFACE_SPACE_URL}${spaceId}`
}

function toSpaceHostUrl(spaceId) {
    if (!spaceId) return ''
    const normalized = String(spaceId)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    return `https://${normalized}${SPACE_HOST_SUFFIX}`
}

function normalizeResolution(resolution, fallbackWidth = 1280, fallbackHeight = 720) {
    const match = String(resolution || '').match(/^(\d{3,5})x(\d{3,5})$/)
    if (!match) {
        return { width: fallbackWidth, height: fallbackHeight }
    }
    return {
        width: clampNumber(match[1], { min: 256, max: 4096, fallback: fallbackWidth }),
        height: clampNumber(match[2], { min: 256, max: 4096, fallback: fallbackHeight }),
    }
}

const WAN21_ALLOWED_SIZES = ['1280*720', '960*960', '720*1280', '1088*832', '832*1088']

function resolveWan21Size(resolution) {
    const { width, height } = normalizeResolution(resolution, 1280, 720)
    const sourceRatio = width / Math.max(1, height)
    const sourceArea = width * height
    let best = WAN21_ALLOWED_SIZES[0]
    let bestScore = Number.POSITIVE_INFINITY
    for (const choice of WAN21_ALLOWED_SIZES) {
        const [choiceWidthRaw, choiceHeightRaw] = choice.split('*')
        const choiceWidth = Number(choiceWidthRaw)
        const choiceHeight = Number(choiceHeightRaw)
        if (!Number.isFinite(choiceWidth) || !Number.isFinite(choiceHeight)) continue
        const ratio = choiceWidth / Math.max(1, choiceHeight)
        const area = choiceWidth * choiceHeight
        const ratioPenalty = Math.abs(sourceRatio - ratio) * 100000
        const areaPenalty = Math.abs(sourceArea - area)
        const score = ratioPenalty + areaPenalty
        if (score < bestScore) {
            bestScore = score
            best = choice
        }
    }
    return best
}

function toSafeUrlPath(value) {
    const normalized = String(value || '').trim().replace(/\\/g, '/')
    if (!normalized) return ''
    return encodeURI(normalized)
}

function buildSpaceFileUrl(pathValue, spaceHostUrl = '') {
    const base = String(spaceHostUrl || '').replace(/\/+$/, '')
    const safePath = toSafeUrlPath(pathValue)
    if (!base || !safePath) return null

    const withoutLeadingSlash = safePath.replace(/^\/+/, '')
    if (withoutLeadingSlash.startsWith('gradio_api/file=')) {
        return `${base}/${withoutLeadingSlash}`
    }
    if (withoutLeadingSlash.startsWith('file=')) {
        return `${base}/${withoutLeadingSlash}`
    }
    return `${base}/gradio_api/file=${safePath}`
}

function stripNilValues(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
    const entries = Object.entries(payload).filter(([, value]) => value !== null && value !== undefined)
    return Object.fromEntries(entries)
}

function asErrorMessage(error, fallback = 'generation failed') {
    if (error instanceof Error && error.message) return error.message
    if (typeof error === 'string' && error.trim()) return error.trim()
    if (error && typeof error === 'object') {
        const candidateKeys = ['message', 'error', 'detail', 'status', 'statusText']
        for (const key of candidateKeys) {
            const value = error[key]
            if (typeof value === 'string' && value.trim()) return value.trim()
        }
        try {
            const serialized = JSON.stringify(error)
            if (serialized && serialized !== '{}') return serialized
        } catch {
            // no-op
        }
    }
    return fallback
}

function clampProgressPercent(value) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return null
    return Math.max(0, Math.min(100, Math.round(numeric)))
}

function normalizeProgressPercentText(text) {
    const source = String(text || '')
    if (!source) return ''
    return source.replace(/(-?\d+(?:\.\d+)?)\s*%/g, (match, rawValue) => {
        const clamped = clampProgressPercent(rawValue)
        if (!Number.isFinite(clamped)) return match
        return `${clamped}%`
    })
}

function extractFileUrlFromValue(value, spaceHostUrl = '') {
    if (!value) return null
    if (typeof value === 'string') {
        const trimmed = value.trim()
        if (!trimmed) return null
        if (/^(https?:\/\/|blob:|data:)/i.test(trimmed)) return trimmed
        if (!looksLikeMediaFileReference(trimmed)) return null
        if (spaceHostUrl) return buildSpaceFileUrl(trimmed, spaceHostUrl)
        return null
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const nested = extractFileUrlFromValue(item, spaceHostUrl)
            if (nested) return nested
        }
        return null
    }
    if (typeof value === 'object') {
        if (typeof value.url === 'string') {
            const nestedUrl = extractFileUrlFromValue(value.url, spaceHostUrl)
            if (nestedUrl) return nestedUrl
        }
        if (typeof value.path === 'string') {
            const nestedPath = extractFileUrlFromValue(value.path, spaceHostUrl)
            if (nestedPath) return nestedPath
        }
        for (const nestedValue of Object.values(value)) {
            const nested = extractFileUrlFromValue(nestedValue, spaceHostUrl)
            if (nested) return nested
        }
    }
    return null
}

function normalizeHealth(provider, ok, message, metadata = null) {
    return {
        provider,
        ok: Boolean(ok),
        message: message || '',
        checkedAt: new Date().toISOString(),
        metadata,
    }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = HEALTH_TIMEOUT_MS) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
        })
    } finally {
        clearTimeout(timeout)
    }
}

async function fetchProviderProxyHealthSnapshot() {
    const now = Date.now()
    if (providerProxyHealthSnapshot && now - providerProxyHealthCachedAt < HEALTH_CACHE_TTL_MS) {
        return providerProxyHealthSnapshot
    }

    const res = await fetchWithTimeout(`${PROVIDER_PROXY_BASE}/health`, { method: 'GET' })
    if (!res.ok) {
        throw new Error(await parseProxyError(res, `Provider health check failed (${res.status})`))
    }
    const payload = await res.json().catch(() => null)
    const providersSnapshot = payload?.providers || null
    providerProxyHealthSnapshot = providersSnapshot
    providerProxyHealthCachedAt = now
    return providersSnapshot
}

async function checkReplicateHealth() {
    if (!shouldUseServerProviderProxy()) return normalizeHealth('replicate', false, 'Direct browser provider mode disabled')
    try {
        const snapshot = await fetchProviderProxyHealthSnapshot()
        const provider = snapshot?.replicate
        if (!provider || typeof provider !== 'object') {
            return normalizeHealth('replicate', true, 'Using server-side provider proxy')
        }
        return normalizeHealth('replicate', Boolean(provider.ok), provider.message || '', provider)
    } catch (error) {
        if (error?.name === 'AbortError') {
            return normalizeHealth('replicate', false, 'Provider health check timed out')
        }
        return normalizeHealth('replicate', false, error instanceof Error ? error.message : 'Provider health check failed')
    }
}

async function checkHuggingFaceHealth() {
    if (!shouldUseServerProviderProxy()) return normalizeHealth('huggingface', false, 'Direct browser provider mode disabled')
    try {
        const snapshot = await fetchProviderProxyHealthSnapshot()
        const provider = snapshot?.huggingface
        if (!provider || typeof provider !== 'object') {
            return normalizeHealth('huggingface', true, 'Using server-side provider proxy')
        }
        return normalizeHealth('huggingface', Boolean(provider.ok), provider.message || '', provider)
    } catch (error) {
        if (error?.name === 'AbortError') {
            return normalizeHealth('huggingface', false, 'Provider health check timed out')
        }
        return normalizeHealth('huggingface', false, error instanceof Error ? error.message : 'Provider health check failed')
    }
}

// Get all available models
export function getVideoModels() { return providers.videoModels }
export function getImageModels() { return providers.imageModels }
export function getThreeDModels() { return providers.threeDModels || [] }
export function getProviders() { return providers.providers }

// Filter models by tier
export function getModelsByTier(tier) {
    return {
        video: providers.videoModels.filter((model) => model.tier === tier),
        image: providers.imageModels.filter((model) => model.tier === tier),
        threeD: (providers.threeDModels || []).filter((model) => model.tier === tier),
    }
}

// Check which providers have valid keys
export function getActiveProviders() {
    const active = []
    if (hasKey('replicate')) active.push('replicate')
    if (hasKey('huggingface')) active.push('huggingface')
    return active
}

export async function getProviderHealth(provider, { forceRefresh = false } = {}) {
    if (forceRefresh) {
        providerProxyHealthSnapshot = null
        providerProxyHealthCachedAt = 0
    }
    const cacheEntry = providerHealthCache.get(provider)
    const now = Date.now()
    if (!forceRefresh && cacheEntry && now - cacheEntry.cachedAt < HEALTH_CACHE_TTL_MS) {
        return cacheEntry.health
    }

    let health
    if (provider === 'replicate') health = await checkReplicateHealth()
    else if (provider === 'huggingface') health = await checkHuggingFaceHealth()
    else health = normalizeHealth(provider, false, 'Unknown provider')

    providerHealthCache.set(provider, {
        cachedAt: now,
        health,
    })
    return health
}

export async function getProviderHealthSnapshot({ forceRefresh = false } = {}) {
    const replicate = await getProviderHealth('replicate', { forceRefresh })
    const huggingface = await getProviderHealth('huggingface', { forceRefresh })
    return {
        replicate,
        huggingface,
        checkedAt: new Date().toISOString(),
    }
}

async function loadGradioClient() {
    if (!gradioClientModulePromise) {
        gradioClientModulePromise = import('@gradio/client')
    }
    return gradioClientModulePromise
}

async function predictSpace(app, endpoint, payload, timeoutMs = SPACE_PREDICT_TIMEOUT_MS) {
    let timeoutHandle = null
    try {
        const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => {
                reject(new Error(`Space request timed out after ${Math.round(timeoutMs / 1000)} seconds (${endpoint})`))
            }, timeoutMs)
        })
        return await Promise.race([app.predict(endpoint, payload), timeoutPromise])
    } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle)
    }
}

async function connectSpace(spaceId, onProgress) {
    const { Client } = await loadGradioClient()
    const app = await Client.connect(spaceId, {
        status_callback: (spaceStatus) => {
            if (typeof onProgress !== 'function') return
            const status = String(spaceStatus?.status || 'starting').toLowerCase()
            onProgress({ status, message: spaceStatus?.message || '' })
        },
    })
    return app
}

// ---- REPLICATE API ----

async function replicateRequest(path, body) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
        if (!shouldUseServerProviderProxy()) {
            throw new Error('Direct browser provider mode is disabled. Use server provider proxy.')
        }
        if (path !== '/predictions') {
            throw new Error(`Replicate proxy path not supported: ${path}`)
        }
        const res = await fetch(`${PROVIDER_PROXY_BASE}/replicate/predictions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ input: body?.input, model: body?.model }),
            signal: controller.signal,
        })
        if (!res.ok) throw new Error(await parseProxyError(res, `Replicate proxy error (${res.status})`))
        return res.json()
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error(`Replicate proxy request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`)
        }
        throw error
    } finally {
        clearTimeout(timeout)
    }
}

async function replicateGenerate(modelId, input, options = {}) {
    const { onProgress, pollOptions } = options
    const prediction = await replicateRequest('/predictions', {
        model: modelId,
        input,
    })
    if (typeof onProgress === 'function') {
        onProgress({ status: prediction.status || 'starting' })
    }

    if (prediction.status === 'succeeded') return prediction.output

    if (!prediction?.urls?.get) {
        throw new Error('Replicate response did not include a polling URL.')
    }
    return pollReplicate(prediction.urls.get, {
        onProgress,
        ...(pollOptions || {}),
    })
}

function normalizeHailuoDuration(duration) {
    const numeric = Number(duration)
    if (!Number.isFinite(numeric)) return 6
    return numeric >= 8 ? 10 : 6
}

function parseResolutionLabelHeight(label) {
    const match = String(label || '').match(/(\d{3,4})p/i)
    if (!match) return null
    const height = Number(match[1])
    return Number.isFinite(height) ? height : null
}

function normalizeDurationToAllowed(duration, allowedValues, fallback = DEFAULT_VIDEO_SECONDS) {
    const allowed = Array.isArray(allowedValues) ? allowedValues.filter((value) => Number.isFinite(Number(value))).map(Number) : []
    if (!allowed.length) return fallback
    const requested = Number(duration)
    if (!Number.isFinite(requested)) return allowed[0]
    let best = allowed[0]
    let bestDistance = Number.POSITIVE_INFINITY
    for (const candidate of allowed) {
        const distance = Math.abs(requested - candidate)
        if (distance < bestDistance) {
            bestDistance = distance
            best = candidate
        }
    }
    return best
}

function normalizeResolutionToAllowed(resolution, allowedLabels, fallback = '720p') {
    const allowed = Array.isArray(allowedLabels) ? allowedLabels.filter((value) => typeof value === 'string' && value.trim()) : []
    if (!allowed.length) return fallback
    const { height } = normalizeResolution(resolution, 1280, 720)
    let best = allowed[0]
    let bestDistance = Number.POSITIVE_INFINITY
    for (const candidate of allowed) {
        const candidateHeight = parseResolutionLabelHeight(candidate)
        if (!Number.isFinite(candidateHeight)) continue
        const distance = Math.abs(height - candidateHeight)
        if (distance < bestDistance) {
            bestDistance = distance
            best = candidate
        }
    }
    return best
}

function normalizeHailuoResolution(resolution) {
    const { height } = normalizeResolution(resolution, 1280, 720)
    const options = [512, 768, 1080]
    let best = options[0]
    let distance = Number.POSITIVE_INFINITY
    for (const candidate of options) {
        const delta = Math.abs(height - candidate)
        if (delta < distance) {
            distance = delta
            best = candidate
        }
    }
    return `${best}p`
}

function loadImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('Failed to decode uploaded image.'))
        image.src = dataUrl
    })
}

async function optimizeImageDataUrl(dataUrl, { maxDimension = 1280, quality = 0.88 } = {}) {
    if (typeof document === 'undefined') return dataUrl
    const image = await loadImageFromDataUrl(dataUrl)
    const sourceWidth = Number(image.naturalWidth || image.width || 0)
    const sourceHeight = Number(image.naturalHeight || image.height || 0)
    if (!sourceWidth || !sourceHeight) return dataUrl

    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight))
    if (scale >= 0.999) return dataUrl

    const width = Math.max(2, Math.round(sourceWidth * scale))
    const height = Math.max(2, Math.round(sourceHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(image, 0, 0, width, height)
    const optimized = canvas.toDataURL('image/jpeg', quality)
    return typeof optimized === 'string' && optimized.length < dataUrl.length ? optimized : dataUrl
}

async function fileToDataUrl(file, modelName = 'This model', options = {}) {
    if (typeof File === 'undefined' || !(file instanceof File)) {
        throw new Error(`${modelName} requires an image upload.`)
    }
    if (file.size > MAX_REPLICATE_IMAGE_BYTES) {
        throw new Error(`${modelName} reference image must be 4MB or smaller.`)
    }
    const sourceDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            if (typeof reader.result === 'string' && reader.result.trim()) {
                resolve(reader.result)
                return
            }
            reject(new Error(`Unable to read image upload for ${modelName}.`))
        }
        reader.onerror = () => reject(new Error(`Unable to read image upload for ${modelName}.`))
        reader.readAsDataURL(file)
    })
    if (!String(file.type || '').startsWith('image/')) return sourceDataUrl
    try {
        return await optimizeImageDataUrl(sourceDataUrl, options)
    } catch {
        return sourceDataUrl
    }
}

async function buildReplicateVideoInput({
    model,
    prompt,
    duration,
    resolution,
    imageFile,
}) {
    if (model.id === 'hailuo-02-fast') {
        const firstFrameImage = await fileToDataUrl(imageFile, model.name, { maxDimension: 1024, quality: 0.86 })
        return {
            prompt,
            first_frame_image: firstFrameImage,
            duration: normalizeHailuoDuration(duration),
            resolution: '512P',
            prompt_optimizer: true,
        }
    }

    if (model.id === 'hailuo-02') {
        const payload = {
            prompt,
            duration: normalizeHailuoDuration(duration),
            resolution: normalizeHailuoResolution(resolution),
            prompt_optimizer: true,
        }
        if (typeof File !== 'undefined' && imageFile instanceof File) {
            payload.first_frame_image = await fileToDataUrl(imageFile, model.name, { maxDimension: 1280, quality: 0.9 })
        }
        return payload
    }

    const constraints = REPLICATE_VIDEO_MODEL_CONSTRAINTS[model.id]
    if (constraints) {
        return {
            prompt,
            duration: normalizeDurationToAllowed(duration, constraints.durationValues, DEFAULT_VIDEO_SECONDS),
            resolution: normalizeResolutionToAllowed(resolution, constraints.resolutionValues, '720p'),
        }
    }

    return {
        prompt,
        duration: duration || DEFAULT_VIDEO_SECONDS,
        resolution: resolution || '1280x720',
    }
}

function resolveReplicatePollOptions(model) {
    if (!model || model.provider !== 'replicate') return REPLICATE_POLL_DEFAULT_OPTIONS
    const modelOptions = model.id ? REPLICATE_POLL_MODEL_OPTIONS[model.id] : null
    return {
        ...REPLICATE_POLL_DEFAULT_OPTIONS,
        ...(modelOptions || {}),
    }
}

async function pollReplicate(url, {
    maxAttempts = REPLICATE_POLL_DEFAULT_OPTIONS.maxAttempts,
    intervalMs = REPLICATE_POLL_DEFAULT_OPTIONS.intervalMs,
    requestTimeoutMs = REPLICATE_POLL_DEFAULT_OPTIONS.requestTimeoutMs,
    maxTransientErrors = REPLICATE_POLL_DEFAULT_OPTIONS.maxTransientErrors,
    onProgress,
} = {}) {
    const safeMaxAttempts = clampNumber(maxAttempts, { min: 10, max: 720, fallback: REPLICATE_POLL_DEFAULT_OPTIONS.maxAttempts })
    const safeIntervalMs = clampNumber(intervalMs, { min: 500, max: 30000, fallback: REPLICATE_POLL_DEFAULT_OPTIONS.intervalMs })
    const safeRequestTimeoutMs = clampNumber(requestTimeoutMs, { min: 3000, max: 120000, fallback: REPLICATE_POLL_DEFAULT_OPTIONS.requestTimeoutMs })
    const safeMaxTransientErrors = clampNumber(maxTransientErrors, { min: 1, max: 20, fallback: REPLICATE_POLL_DEFAULT_OPTIONS.maxTransientErrors })
    let transientErrors = 0

    for (let i = 0; i < safeMaxAttempts; i += 1) {
        await sleep(safeIntervalMs)
        if (!shouldUseServerProviderProxy()) {
            throw new Error('Direct browser provider mode is disabled. Use server provider proxy.')
        }

        let res
        try {
            res = await fetchWithTimeout(`${PROVIDER_PROXY_BASE}/replicate/poll`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ poll_url: url }),
            }, safeRequestTimeoutMs)
        } catch (error) {
            transientErrors += 1
            const message = asErrorMessage(error, 'Replicate polling failed')
            if (typeof onProgress === 'function') {
                onProgress({
                    status: 'running',
                    message: `Replicate poll retry ${transientErrors}/${safeMaxTransientErrors}: ${message}`,
                })
            }
            if (transientErrors >= safeMaxTransientErrors) {
                throw new Error(`Replicate polling failed after ${safeMaxTransientErrors} retries: ${message}`)
            }
            continue
        }

        if (!res.ok) {
            const message = await parseProxyError(res, `Replicate poll error (${res.status})`)
            const isTransientStatus = res.status === 408 || res.status === 409 || res.status === 425 || res.status === 429 || res.status >= 500
            if (!isTransientStatus) {
                throw new Error(message)
            }
            transientErrors += 1
            if (typeof onProgress === 'function') {
                onProgress({
                    status: 'running',
                    message: `Replicate poll retry ${transientErrors}/${safeMaxTransientErrors}: ${message}`,
                })
            }
            if (transientErrors >= safeMaxTransientErrors) {
                throw new Error(message)
            }
            continue
        }

        const data = await res.json()
        transientErrors = 0
        if (typeof onProgress === 'function') {
            const progressMessage = data.status === 'succeeded' ? undefined : `Polling Replicate (${i + 1}/${safeMaxAttempts})`
            onProgress({
                status: data.status || 'running',
                metrics: data.metrics || null,
                ...(progressMessage ? { message: progressMessage } : {}),
            })
        }
        if (data.status === 'succeeded') return data.output
        if (data.status === 'failed') throw new Error(data.error || 'Generation failed')
        if (data.status === 'canceled' || data.status === 'aborted') {
            throw new Error(data.error || `Generation ${data.status}`)
        }
    }
    throw new Error(`Generation timed out after ${Math.round((safeMaxAttempts * safeIntervalMs) / 1000)} seconds`)
}

// ---- HUGGING FACE API ----

async function huggingfaceGenerate(modelId, input, options = {}) {
    const { onProgress } = options
    if (typeof onProgress === 'function') onProgress({ status: 'starting' })
    const promptText = String(input?.prompt || '').trim()
    const parameters = { ...(input || {}) }
    delete parameters.prompt
    const requestBody = { inputs: promptText, parameters }
    if (!shouldUseServerProviderProxy()) {
        throw new Error('Direct browser provider mode is disabled. Use server provider proxy.')
    }
    const res = await fetch(`${PROVIDER_PROXY_BASE}/huggingface/infer`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model_id: modelId,
            request: requestBody,
        }),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HuggingFace error: ${res.status}`)
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    if (typeof onProgress === 'function') onProgress({ status: 'succeeded' })
    return { url, revoke: () => URL.revokeObjectURL(url) }
}

function assertFileUpload(file, message) {
    if (typeof File === 'undefined' || !(file instanceof File)) {
        throw new Error(message)
    }
}

async function toGradioUpload(file) {
    const { handle_file } = await loadGradioClient()
    return handle_file(file)
}

function ensureVideoModelMedia(model, imageFile, videoFile) {
    if (model.requiresImageInput) {
        assertFileUpload(imageFile, `${model.name} requires a source image upload.`)
    }
    if (model.requiresVideoInput) {
        assertFileUpload(videoFile, `${model.name} requires a source video upload.`)
    }
}

function extractSpaceResultUrl(result, spaceHostUrl, modelName) {
    const url = extractFileUrlFromValue(result?.data, spaceHostUrl)
    if (url) return url
    throw new Error(`${modelName} finished without returning a downloadable media URL.`)
}

async function generateWithWan21Space({
    app,
    prompt,
    resolution,
    spaceHostUrl,
    onProgress,
}) {
    const size = resolveWan21Size(resolution)
    const start = await predictSpace(app, '/t2v_generation_async', {
        prompt,
        size,
        watermark_wan: false,
        seed: randomSeed(),
    })
    const directUrl = extractFileUrlFromValue(start?.data, spaceHostUrl)
    if (directUrl) return directUrl

    const waitStartedAt = Date.now()
    let highQueueStreak = 0

    for (let attempt = 0; attempt < WAN21_STATUS_MAX_ATTEMPTS; attempt += 1) {
        await sleep(WAN21_STATUS_POLL_MS)
        if (Date.now() - waitStartedAt > WAN21_MAX_WAIT_MS) {
            throw new Error('Wan 2.1 queue wait exceeded 8 minutes. Trying failover model.')
        }
        const statusResult = await predictSpace(app, '/status_refresh', [null, null, null], 45000)
        const data = Array.isArray(statusResult?.data) ? statusResult.data : []
        const url = extractFileUrlFromValue(data, spaceHostUrl)
        if (url) return url

        const queuePosition = Number(data[6])
        const phaseLabelRaw = typeof data[7]?.label === 'string' ? data[7].label : ''
        const phaseLabel = normalizeProgressPercentText(phaseLabelRaw).replace(/\s{2,}/g, ' ').trim()
        if (Number.isFinite(queuePosition) && queuePosition > WAN21_QUEUE_FAILOVER_THRESHOLD) {
            highQueueStreak += 1
        } else {
            highQueueStreak = 0
        }
        if (highQueueStreak >= WAN21_QUEUE_FAILOVER_STREAK) {
            throw new Error(`Wan 2.1 queue is overloaded (position ${Math.round(queuePosition)}). Trying failover model.`)
        }
        if (typeof onProgress === 'function') {
            const queueSuffix = Number.isFinite(queuePosition) ? ` | queue position ${Math.max(0, queuePosition)}` : ''
            const phaseSuffix = phaseLabel ? ` | ${phaseLabel}` : ''
            onProgress({ status: 'running', message: `Polling Wan 2.1 (${attempt + 1}/${WAN21_STATUS_MAX_ATTEMPTS})${queueSuffix}${phaseSuffix}` })
        }

        const asText = JSON.stringify(data || {})
        if (/failed|error|aborted|cancel|denied|moderation/i.test(asText) && !/generating/i.test(asText)) {
            throw new Error('Wan 2.1 status endpoint reported failure.')
        }
    }

    throw new Error('Wan 2.1 timed out while waiting for output from the Space queue.')
}

async function generateWithVideoSpace({
    model,
    prompt,
    duration,
    resolution,
    imageFile,
    videoFile,
    onProgress,
}) {
    ensureVideoModelMedia(model, imageFile, videoFile)
    const app = await connectSpace(model.spaceId, onProgress)
    const spaceHostUrl = app?.config?.root || toSpaceHostUrl(model.spaceId)
    const imageUpload = imageFile instanceof File ? await toGradioUpload(imageFile) : null
    const videoUpload = videoFile instanceof File ? await toGradioUpload(videoFile) : null
    const seconds = clampNumber(duration, { min: 2, max: 16, fallback: DEFAULT_VIDEO_SECONDS })
    const { width, height } = normalizeResolution(resolution)

    if (typeof onProgress === 'function') {
        onProgress({ status: 'running', message: `Running ${model.name}` })
    }

    if (model.id === 'wan-2.2-animate') {
        if (!imageUpload && !videoUpload) {
            throw new Error('Wan2.2 Animate requires at least one reference input (image or video).')
        }
        const result = await predictSpace(app, '/predict', stripNilValues({
            ref_img: imageUpload,
            video: videoUpload,
            model_id: 'Wan2.2-TI2V-5B',
            model: 'Wan2.2-TI2V-5B',
        }))
        return extractSpaceResultUrl(result, spaceHostUrl, model.name)
    }

    if (model.id === 'live-portrait') {
        if (!imageUpload || !videoUpload) {
            throw new Error('Live Portrait requires both source image and driving video.')
        }
        const result = await predictSpace(app, '/gpu_wrapped_execute_video', {
            param_0: imageUpload,
            param_1: videoUpload,
            param_2: true,
            param_3: true,
            param_4: true,
        })
        return extractSpaceResultUrl(result, spaceHostUrl, model.name)
    }

    if (model.id === 'wan-2.2-14b-fast') {
        const result = await predictSpace(app, '/generate_video_with_upload', stripNilValues({
            input_image: imageUpload,
            prompt,
            height,
            width,
            negative_prompt: '',
            duration_seconds: seconds,
            guidance_scale: 5,
            steps: 30,
            seed: randomSeed(),
            randomize_seed: true,
        }))
        return extractSpaceResultUrl(result, spaceHostUrl, model.name)
    }

    if (model.id === 'wan-2.1-space' || model.id === 'wan-2.1-t2v') {
        return generateWithWan21Space({
            app,
            prompt,
            resolution: `${width}x${height}`,
            spaceHostUrl,
            onProgress,
        })
    }

    if (model.id === 'stable-video-diffusion-1.1') {
        if (!imageUpload) {
            throw new Error('Stable Video Diffusion 1.1 requires a source image upload.')
        }
        const result = await predictSpace(app, '/video', {
            image: imageUpload,
            seed: randomSeed(),
            randomize_seed: true,
            motion_bucket_id: 127,
            fps_id: 6,
        })
        return extractSpaceResultUrl(result, spaceHostUrl, model.name)
    }

    if (model.id === 'ltx-video-fast') {
        const ltxDuration = clampNumber(seconds, { min: 0.3, max: 8.5, fallback: DEFAULT_VIDEO_SECONDS })
        const payload = stripNilValues({
            prompt,
            negative_prompt: '',
            input_image_filepath: imageUpload,
            input_video_filepath: videoUpload,
            height_ui: height,
            width_ui: width,
            mode: 'text-to-video',
            duration_ui: ltxDuration,
            ui_frames_to_use: 81,
            seed_ui: randomSeed(),
            randomize_seed: true,
            ui_guidance_scale: 3,
            improve_texture_flag: false,
        })
        const result = await predictSpace(app, '/text_to_video', payload)
        return extractSpaceResultUrl(result, spaceHostUrl, model.name)
    }

    if (model.id === 'nsfw-uncensored-video') {
        const result = await predictSpace(app, '/generate_video', stripNilValues({
            input_image: imageUpload,
            prompt,
            steps: 30,
            negative_prompt: '',
            duration_seconds: seconds,
            guidance_scale: 5,
            guidance_scale_2: 1,
            seed: randomSeed(),
            randomize_seed: true,
        }))
        return extractSpaceResultUrl(result, spaceHostUrl, model.name)
    }

    if (model.id === 'ai-video-composer') {
        const fileList = []
        if (imageUpload) fileList.push(imageUpload)
        if (videoUpload) fileList.push(videoUpload)
        const result = await predictSpace(app, '/update', {
            files: fileList,
            prompt,
            top_p: 0.8,
            temperature: 0.7,
            model_choice: 'Qwen2.5-7B-Instruct',
        })
        return extractSpaceResultUrl(result, spaceHostUrl, model.name)
    }

    throw new Error(`No Hugging Face Space adapter configured for ${model.name}.`)
}

async function generateWithTrellisSpace({ model, imageFile, maxTriangles, maxTexture, onProgress }) {
    assertFileUpload(imageFile, 'TRELLIS.2 requires a source image upload.')
    const app = await connectSpace(model.spaceId, onProgress)
    const sourceImage = await toGradioUpload(imageFile)
    const seed = randomSeed()
    const decimationTarget = clampNumber(maxTriangles, {
        min: 100000,
        max: 500000,
        fallback: 200000,
    })
    const textureSize = clampNumber(maxTexture, {
        min: 1024,
        max: 4096,
        fallback: 2048,
    })
    const spaceHostUrl = app?.config?.root || toSpaceHostUrl(model.spaceId)

    if (typeof onProgress === 'function') onProgress({ status: 'running', message: 'Preparing TRELLIS session' })
    await predictSpace(app, '/start_session', {})

    if (typeof onProgress === 'function') onProgress({ status: 'running', message: 'Generating 3D representation' })
    await predictSpace(app, '/image_to_3d', {
        image: sourceImage,
        seed,
        resolution: '512',
        ss_guidance_strength: 7.5,
        ss_guidance_rescale: 0,
        ss_sampling_steps: 12,
        ss_rescale_t: 3,
        shape_slat_guidance_strength: 3,
        shape_slat_guidance_rescale: 0,
        shape_slat_sampling_steps: 12,
        shape_slat_rescale_t: 3,
        tex_slat_guidance_strength: 3,
        tex_slat_guidance_rescale: 0,
        tex_slat_sampling_steps: 12,
        tex_slat_rescale_t: 3,
    })

    if (typeof onProgress === 'function') onProgress({ status: 'running', message: 'Exporting GLB asset' })
    const extractResult = await predictSpace(app, '/extract_glb', {
        decimation_target: decimationTarget,
        texture_size: textureSize,
    })
    const resultUrl = extractFileUrlFromValue(extractResult?.data, spaceHostUrl)
    if (!resultUrl) {
        throw new Error('TRELLIS.2 generation completed but did not return a downloadable asset URL.')
    }
    if (typeof onProgress === 'function') onProgress({ status: 'succeeded' })
    return resultUrl
}

async function generateWithHunyuanSpace({ model, imageFile, onProgress }) {
    assertFileUpload(imageFile, 'Hunyuan3D-2.1 requires a source image upload.')
    const app = await connectSpace(model.spaceId, onProgress)
    const sourceImage = await toGradioUpload(imageFile)
    const seed = randomSeed(10000000)
    const spaceHostUrl = app?.config?.root || toSpaceHostUrl(model.spaceId)

    if (typeof onProgress === 'function') onProgress({ status: 'running', message: 'Generating 3D asset in Hunyuan3D-2.1' })
    const result = await predictSpace(app, '/generation_all', {
        null: null,
        image: sourceImage,
        mv_image_front: null,
        mv_image_back: null,
        mv_image_left: null,
        mv_image_right: null,
        steps: 30,
        guidance_scale: 5,
        seed,
        octree_resolution: 256,
        check_box_rembg: true,
        num_chunks: 8000,
        randomize_seed: true,
    })
    const resultUrl = extractFileUrlFromValue(result?.data, spaceHostUrl)
    if (!resultUrl) {
        throw new Error('Hunyuan3D-2.1 generation completed but did not return a downloadable asset URL.')
    }
    if (typeof onProgress === 'function') onProgress({ status: 'succeeded' })
    return resultUrl
}

function getVideoFailoverChain(modelId) {
    const primaryModel = providers.videoModels.find((model) => model.id === modelId)
    if (!primaryModel) return []
    const failovers = Array.isArray(primaryModel.failoverModelIds) ? primaryModel.failoverModelIds : []
    const chain = [primaryModel.id, ...failovers]
    return Array.from(new Set(chain))
}

async function generateVideoWithModel({
    model,
    prompt,
    style,
    duration,
    resolution,
    imageFile,
    videoFile,
    onProgress,
}) {
    const fullPrompt = style ? `${prompt}, ${style} style, seamless loop, VJ visual` : prompt

    if (model.provider === 'replicate') {
        const replicateInput = await buildReplicateVideoInput({
            model,
            prompt: fullPrompt,
            duration,
            resolution,
            imageFile,
        })
        return replicateGenerate(
            model.modelId,
            replicateInput,
            {
                onProgress,
                pollOptions: resolveReplicatePollOptions(model),
            }
        )
    }

    if (model.provider === 'huggingface' && model.spaceId) {
        return generateWithVideoSpace({
            model,
            prompt: fullPrompt,
            duration,
            resolution,
            imageFile,
            videoFile,
            onProgress,
        })
    }

    throw new Error(`Provider not supported for video: ${model.provider}`)
}

// ---- UNIFIED GENERATE FUNCTIONS ----

export async function generateVideo({
    modelId,
    prompt,
    style,
    duration,
    resolution,
    imageFile,
    videoFile,
    onProgress,
}) {
    if (!hasKey('replicate') && !hasKey('huggingface')) {
        throw new Error('No supported provider route configured.')
    }

    const attemptIds = getVideoFailoverChain(modelId)
    if (attemptIds.length === 0) throw new Error(`Unknown model: ${modelId}`)

    if (typeof onProgress === 'function') onProgress({ status: 'submitting' })

    const failures = []
    for (const attemptId of attemptIds) {
        const model = providers.videoModels.find((candidate) => candidate.id === attemptId)
        if (!model) continue
        if (!hasKey(model.provider)) {
            failures.push(`${model.name}: provider key missing`)
            continue
        }

        const health = await getProviderHealth(model.provider)
        if (!health.ok) {
            failures.push(`${model.name}: provider unhealthy (${health.message})`)
            if (typeof onProgress === 'function') {
                onProgress({
                    status: 'running',
                    message: `Skipping ${model.name} because ${model.provider} is unhealthy (${health.message})`,
                })
            }
            continue
        }

        try {
            if (attemptId !== modelId && typeof onProgress === 'function') {
                onProgress({ status: 'running', message: `Automatic failover to ${model.name}` })
            }
            const output = await generateVideoWithModel({
                model,
                prompt,
                style,
                duration,
                resolution,
                imageFile,
                videoFile,
                onProgress,
            })
            if (typeof onProgress === 'function') {
                onProgress({
                    status: 'succeeded',
                    message: attemptId === modelId ? `Generated with ${model.name}` : `Generated via failover model ${model.name}`,
                })
            }
            return {
                output,
                used_provider: model.provider,
                used_model_id: model.id,
                failover_used: attemptId !== modelId,
            }
        } catch (error) {
            const message = asErrorMessage(error, 'generation failed')
            failures.push(`${model.name}: ${message}`)
            if (typeof onProgress === 'function') {
                onProgress({ status: 'failed', message: `${model.name} failed: ${message}` })
            }
        }
    }

    throw new Error(`All video model attempts failed. ${failures.join(' | ')}`)
}

export async function generateImage({ modelId, prompt, style, width, height, onProgress }) {
    if (!hasKey('replicate') && !hasKey('huggingface')) {
        throw new Error('No supported provider route configured.')
    }
    const model = providers.imageModels.find((candidate) => candidate.id === modelId)
    if (!model) throw new Error(`Unknown model: ${modelId}`)
    if (!hasKey(model.provider)) {
        throw new Error(`Provider ${model.provider} is not configured for image generation.`)
    }

    const fullPrompt = style ? `${prompt}, ${style} style, VJ visual overlay` : prompt
    if (typeof onProgress === 'function') onProgress({ status: 'submitting' })

    if (model.provider === 'replicate') {
        return replicateGenerate(
            model.modelId,
            {
                prompt: fullPrompt,
                width: width || 1024,
                height: height || 1024,
            },
            { onProgress }
        )
    }

    if (model.provider === 'huggingface') {
        return huggingfaceGenerate(
            model.modelId,
            {
                prompt: fullPrompt,
                width: width || 1024,
                height: height || 1024,
            },
            { onProgress }
        )
    }

    throw new Error(`Provider not supported: ${model.provider}`)
}

export async function generate3DAsset({ modelId, imageFile, maxTriangles, maxTexture, onProgress }) {
    if (!hasKey('huggingface')) {
        throw new Error('Hugging Face route is not configured for 3D generation.')
    }
    const model = (providers.threeDModels || []).find((candidate) => candidate.id === modelId)
    if (!model) throw new Error(`Unknown 3D model: ${modelId}`)
    if (!hasKey(model.provider)) {
        throw new Error(`Provider ${model.provider} is not configured for 3D generation.`)
    }

    if (!model.supportedInApp) {
        throw new Error(`${model.supportNote || 'This model cannot be generated in-app right now.'} Open ${toSpaceUrl(model.spaceId)}.`)
    }

    if (model.id === 'trellis-2') {
        return generateWithTrellisSpace({ model, imageFile, maxTriangles, maxTexture, onProgress })
    }
    if (model.id === 'hunyuan3d-2.1') {
        return generateWithHunyuanSpace({ model, imageFile, onProgress })
    }

    throw new Error(`No 3D generation pipeline configured for ${model.name}.`)
}

// ---- COST ESTIMATOR ----

export function estimateCost(modelId, type) {
    if (type === 'video') {
        const model = providers.videoModels.find((candidate) => candidate.id === modelId)
        return model ? model.price : 'Unknown'
    }
    if (type === '3d') {
        const model = (providers.threeDModels || []).find((candidate) => candidate.id === modelId)
        return model ? model.price : 'Unknown'
    }
    const model = providers.imageModels.find((candidate) => candidate.id === modelId)
    return model ? model.price : 'Unknown'
}
