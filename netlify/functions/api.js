import crypto from 'node:crypto'
import { badRequest, corsHeadersForEvent, json, methodNotAllowed, noContent, parseJsonBody, validationFailed, withCors } from './lib/http.js'
import {
    BillingCreditsChargeSchema,
    BillingLedgerEntrySchema,
    EnginePushSchema,
    GenerationRequestSchema,
    PipelineExecuteSchema,
    ProviderJobCreateSchema,
    ProviderJobEventSchema,
    ProviderWebhookSchema,
    validateSchema,
} from './lib/schema.js'
import { appendBillingLedgerEntry, getBillingLedgerForUser } from './lib/billing.js'
import { chargeCreditBalanceForUser, getCreditBalanceForUser } from './lib/credits.js'
import {
    appendProviderJobEvent,
    appendProviderWebhookEvent,
    createProviderJob,
    createEnginePush,
    createGenerationJob,
    createPipelineExecution,
    getAsset,
    getDownloadTicket,
    getJob,
    getProviderJob,
    getPipelineExecution,
} from './lib/store.js'

function getPathParts(event) {
    const splat = event?.pathParameters?.splat
    if (splat) return splat.split('/').filter(Boolean)

    const rawUrl = event?.rawUrl
    if (rawUrl) {
        try {
            const pathname = new URL(rawUrl).pathname
            const apiMarker = '/api/v1/'
            const apiIndex = pathname.indexOf(apiMarker)
            if (apiIndex !== -1) {
                return pathname.slice(apiIndex + apiMarker.length).split('/').filter(Boolean)
            }
        } catch {
            // fall through
        }
    }

    const path = event?.path || ''
    const marker = '/.netlify/functions/api/'
    const index = path.indexOf(marker)
    if (index === -1) return []
    return path.slice(index + marker.length).split('/').filter(Boolean)
}

function routeNotFound(pathParts) {
    return json(404, {
        error: 'route_not_found',
        message: `No API route for /api/v1/${pathParts.join('/')}`,
    })
}

function getHeaderValue(event, name) {
    const headers = event?.headers || {}
    if (headers[name] != null) return String(headers[name]).trim()
    const target = String(name || '').toLowerCase()
    for (const [key, value] of Object.entries(headers)) {
        if (String(key).toLowerCase() === target) {
            return String(value || '').trim()
        }
    }
    return ''
}

function isLocalRequest(event) {
    const hostHeader = getHeaderValue(event, 'x-forwarded-host') || getHeaderValue(event, 'host')
    const host = String(hostHeader || '').toLowerCase()
    if (!host) return false
    return host.startsWith('localhost') || host.startsWith('127.0.0.1')
}

function secureCompare(a, b) {
    const left = Buffer.from(String(a || ''), 'utf8')
    const right = Buffer.from(String(b || ''), 'utf8')
    if (left.length !== right.length || left.length === 0) return false
    return crypto.timingSafeEqual(left, right)
}

function getWebhookSecret(provider) {
    const normalized = String(provider || '').toLowerCase()
    if (normalized === 'replicate') {
        return process.env.REPLICATE_WEBHOOK_SECRET || process.env.PROVIDER_WEBHOOK_SECRET || ''
    }
    if (normalized === 'huggingface') {
        return process.env.HUGGINGFACE_WEBHOOK_SECRET || process.env.PROVIDER_WEBHOOK_SECRET || ''
    }
    return process.env.PROVIDER_WEBHOOK_SECRET || ''
}

function verifyWebhookSignature(event, provider) {
    const secret = String(getWebhookSecret(provider) || '').trim()
    if (!secret) {
        return { ok: true, mode: 'skipped_no_secret' }
    }

    const rawBody = typeof event?.body === 'string' ? event.body : JSON.stringify(event?.body || {})
    const receivedSignature =
        getHeaderValue(event, 'x-provider-signature') ||
        getHeaderValue(event, 'x-webhook-signature') ||
        getHeaderValue(event, 'x-replicate-signature') ||
        getHeaderValue(event, 'x-hub-signature-256')
    if (!receivedSignature) {
        return { ok: false, error: 'Missing webhook signature header' }
    }

    const providedToken = receivedSignature.includes('=')
        ? receivedSignature.split('=').pop().trim()
        : receivedSignature.trim()
    const expectedToken = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    if (!secureCompare(providedToken.toLowerCase(), expectedToken.toLowerCase())) {
        return { ok: false, error: 'Webhook signature mismatch' }
    }

    const timestampHeader = getHeaderValue(event, 'x-provider-timestamp') || getHeaderValue(event, 'x-webhook-timestamp')
    if (timestampHeader) {
        const numeric = Number(timestampHeader)
        const parsedMs = Number.isFinite(numeric)
            ? (numeric > 1_000_000_000_000 ? numeric : numeric * 1000)
            : Date.parse(timestampHeader)
        if (Number.isFinite(parsedMs)) {
            const maxAgeMs = Number(process.env.WEBHOOK_MAX_AGE_MS || 10 * 60 * 1000)
            if (Math.abs(Date.now() - parsedMs) > maxAgeMs) {
                return { ok: false, error: 'Webhook timestamp outside allowed window' }
            }
        }
    }

    return { ok: true, mode: 'verified' }
}

function isInternalAuthorized(event) {
    const configuredToken = String(process.env.ORCHESTRATOR_API_TOKEN || '').trim()
    if (!configuredToken) {
        // Fail closed by default. Explicitly allow only local unsecured development when requested.
        const allowUnauthLocal = String(process.env.INTERNAL_API_ALLOW_UNAUTH || '').toLowerCase() === 'true'
        return allowUnauthLocal && isLocalRequest(event)
    }

    const authHeader = getHeaderValue(event, 'authorization')
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
    const headerToken = getHeaderValue(event, 'x-orchestrator-token')

    return secureCompare(bearerToken, configuredToken) || secureCompare(headerToken, configuredToken)
}

function getQueryParam(event, key) {
    if (event?.queryStringParameters?.[key] != null) {
        return String(event.queryStringParameters[key])
    }
    if (event?.rawUrl) {
        try {
            const url = new URL(event.rawUrl)
            const value = url.searchParams.get(key)
            if (value != null) return value
        } catch {
            // ignore parse errors
        }
    }
    return ''
}

const REQUIRE_SERVER_BILLING_DB = String(process.env.REQUIRE_SERVER_BILLING_DB || 'true').toLowerCase() !== 'false'

function hasServerBillingDbConfig() {
    const supabaseUrl = String(process.env.SUPABASE_URL || '').trim()
    const supabaseKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ACCESS_TOKEN || '').trim()
    return Boolean(supabaseUrl && supabaseKey)
}

function billingDbUnavailableResponse() {
    return json(503, {
        error: 'billing_db_unconfigured',
        message: 'Server billing database is required but not configured.',
    })
}

const PROVIDER_PROXY_TIMEOUT_MS = 120000
function providerProxyCorsHeaders(event) {
    return corsHeadersForEvent(event)
}

const RATE_LIMIT_WINDOW_MS = Math.max(1000, Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60_000))
const RATE_LIMIT_MAX_REQUESTS = Math.max(1, Number(process.env.API_RATE_LIMIT_MAX_REQUESTS || 120))
const RATE_LIMIT_STORE = new Map()

function getClientAddress(event) {
    const direct = getHeaderValue(event, 'x-nf-client-connection-ip') || getHeaderValue(event, 'client-ip')
    if (direct) return direct
    const forwarded = getHeaderValue(event, 'x-forwarded-for')
    if (forwarded) {
        const first = forwarded.split(',')[0]?.trim()
        if (first) return first
    }
    return 'unknown'
}

function consumeRateLimit(event, { bucket = 'global', limit = RATE_LIMIT_MAX_REQUESTS, windowMs = RATE_LIMIT_WINDOW_MS } = {}) {
    const now = Date.now()
    const safeLimit = Math.max(1, Math.floor(Number(limit) || RATE_LIMIT_MAX_REQUESTS))
    const safeWindow = Math.max(1000, Math.floor(Number(windowMs) || RATE_LIMIT_WINDOW_MS))
    const client = getClientAddress(event)
    const key = `${bucket}:${client}`
    const current = RATE_LIMIT_STORE.get(key)

    if (!current || now >= current.resetAt) {
        RATE_LIMIT_STORE.set(key, {
            count: 1,
            resetAt: now + safeWindow,
        })
        return { ok: true }
    }

    if (current.count >= safeLimit) {
        const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
        return { ok: false, retryAfterSec }
    }

    current.count += 1
    RATE_LIMIT_STORE.set(key, current)

    // Opportunistic cleanup to prevent unbounded growth in long-lived containers.
    if (RATE_LIMIT_STORE.size > 5000) {
        for (const [entryKey, entry] of RATE_LIMIT_STORE.entries()) {
            if (now >= entry.resetAt) RATE_LIMIT_STORE.delete(entryKey)
        }
    }

    return { ok: true }
}

function maybeRateLimit(event, config) {
    const verdict = consumeRateLimit(event, config)
    if (verdict.ok) return null
    return json(
        429,
        {
            error: 'rate_limited',
            message: 'Too many requests. Retry later.',
            retry_after_seconds: verdict.retryAfterSec,
        },
        { 'Retry-After': String(verdict.retryAfterSec) }
    )
}

function getReplicateToken() {
    return String(process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY || '').trim()
}

function getHuggingFaceToken() {
    return String(
        process.env.HUGGINGFACE_API_KEY ||
            process.env.HUGGINGFACEHUB_API_TOKEN ||
            process.env.HF_TOKEN ||
            ''
    ).trim()
}

async function fetchWithTimeout(url, options = {}, timeoutMs = PROVIDER_PROXY_TIMEOUT_MS) {
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

async function parseUpstreamError(response, fallbackMessage) {
    try {
        const payload = await response.json()
        const detail = payload?.detail || payload?.error || payload?.message
        return detail ? `${fallbackMessage}: ${detail}` : fallbackMessage
    } catch {
        return fallbackMessage
    }
}

function providerFileCorsHeaders(event) {
    return corsHeadersForEvent(event)
}

function isAllowedProviderFileHost(hostname) {
    const host = String(hostname || '').toLowerCase()
    if (!host) return false
    const defaultAllow = [
        'replicate.delivery',
        'api.replicate.com',
        'huggingface.co',
        'cdn-lfs.huggingface.co',
    ]
    if (host.endsWith('.hf.space')) return true
    if (defaultAllow.includes(host)) return true
    const configured = String(process.env.PROVIDER_FILE_PROXY_ALLOWLIST || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    return configured.includes(host)
}

function getProviderFileAuthToken(hostname) {
    const host = String(hostname || '').toLowerCase()
    if (!host) return ''
    if (host.includes('replicate')) {
        return String(process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY || '').trim()
    }
    if (host.endsWith('.hf.space') || host.includes('huggingface.co')) {
        return String(
            process.env.HUGGINGFACE_API_KEY ||
                process.env.HUGGINGFACEHUB_API_TOKEN ||
                process.env.HF_TOKEN ||
                ''
        ).trim()
    }
    return ''
}

async function handleProviderFileFetch(event) {
    if (event.httpMethod !== 'GET') return methodNotAllowed(['GET', 'OPTIONS'])
    const rateLimited = maybeRateLimit(event, { bucket: 'provider_file', limit: Number(process.env.RATE_LIMIT_PROVIDER_FILE || 90) })
    if (rateLimited) return rateLimited
    const rawUrl = getQueryParam(event, 'url')
    if (!rawUrl) return badRequest('Query parameter url is required')

    let parsed
    try {
        parsed = new URL(rawUrl)
    } catch {
        return badRequest('Query parameter url must be a valid absolute URL')
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        return badRequest('Only http/https provider file URLs are supported')
    }
    if (!isAllowedProviderFileHost(parsed.hostname)) {
        return json(403, {
            error: 'provider_file_host_not_allowed',
            message: `Host is not allow-listed for provider file proxy: ${parsed.hostname}`,
        })
    }

    const headers = {}
    const token = getProviderFileAuthToken(parsed.hostname)
    if (token) headers.Authorization = `Bearer ${token}`

    try {
        const upstream = await fetch(parsed.toString(), {
            method: 'GET',
            headers,
            redirect: 'follow',
        })
        if (!upstream.ok) {
            return json(upstream.status, {
                error: 'provider_file_fetch_failed',
                message: `Provider file request failed (${upstream.status})`,
                status: upstream.status,
            })
        }

        const payload = Buffer.from(await upstream.arrayBuffer())
        const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
        const contentDisposition = upstream.headers.get('content-disposition') || ''
        const cacheControl = upstream.headers.get('cache-control') || 'private, max-age=60'

        return {
            statusCode: 200,
            isBase64Encoded: true,
            headers: {
                ...providerFileCorsHeaders(event),
                'Content-Type': contentType,
                'Cache-Control': cacheControl,
                ...(contentDisposition ? { 'Content-Disposition': contentDisposition } : {}),
            },
            body: payload.toString('base64'),
        }
    } catch (error) {
        return json(502, {
            error: 'provider_file_fetch_error',
            message: error instanceof Error ? error.message : 'Failed to fetch provider file',
        })
    }
}

async function handleProviderReplicatePrediction(event) {
    if (event.httpMethod !== 'POST') return methodNotAllowed(['POST', 'OPTIONS'])
    const rateLimited = maybeRateLimit(event, { bucket: 'replicate_prediction', limit: Number(process.env.RATE_LIMIT_REPLICATE_PREDICTION || 30) })
    if (rateLimited) return rateLimited
    const token = getReplicateToken()
    if (!token) {
        return json(503, {
            error: 'replicate_token_missing',
            message: 'Replicate token is not configured in server environment.',
        })
    }

    const parsedBody = parseJsonBody(event)
    if (!parsedBody.ok) return badRequest(parsedBody.message)
    const model = String(parsedBody.value?.model || '').trim()
    const input = parsedBody.value?.input
    if (!model || !input || typeof input !== 'object') {
        return badRequest('Body requires model and input object')
    }

    try {
        const modelParts = model.split(':')
        const modelSlug = String(modelParts[0] || '').trim()
        const explicitVersion = String(modelParts[1] || '').trim()

        let replicateUrl = 'https://api.replicate.com/v1/predictions'
        let replicateBody = { input }
        if (modelSlug.includes('/')) {
            const encodedSlug = modelSlug
                .split('/')
                .map((segment) => encodeURIComponent(segment))
                .join('/')
            replicateUrl = `https://api.replicate.com/v1/models/${encodedSlug}/predictions`
            replicateBody = explicitVersion ? { input, version: explicitVersion } : { input }
        } else {
            // Legacy path: when caller passes a Replicate version id directly.
            replicateBody = { input, version: modelSlug }
        }

        const upstream = await fetchWithTimeout(replicateUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                // Use async prediction creation to keep serverless requests short and avoid gateway timeouts.
                'Cancel-After': '5m',
            },
            body: JSON.stringify(replicateBody),
        })
        if (!upstream.ok) {
            return json(upstream.status, {
                error: 'replicate_request_failed',
                message: await parseUpstreamError(upstream, `Replicate error (${upstream.status})`),
            })
        }
        const payload = await upstream.json()
        return json(200, payload)
    } catch (error) {
        if (error?.name === 'AbortError') {
            return json(504, {
                error: 'replicate_timeout',
                message: `Replicate proxy timed out after ${Math.round(PROVIDER_PROXY_TIMEOUT_MS / 1000)}s`,
            })
        }
        return json(502, {
            error: 'replicate_proxy_error',
            message: error instanceof Error ? error.message : 'Replicate proxy request failed',
        })
    }
}

async function handleProviderReplicatePoll(event) {
    if (event.httpMethod !== 'POST') return methodNotAllowed(['POST', 'OPTIONS'])
    const rateLimited = maybeRateLimit(event, { bucket: 'replicate_poll', limit: Number(process.env.RATE_LIMIT_REPLICATE_POLL || 180) })
    if (rateLimited) return rateLimited
    const token = getReplicateToken()
    if (!token) {
        return json(503, {
            error: 'replicate_token_missing',
            message: 'Replicate token is not configured in server environment.',
        })
    }

    const parsedBody = parseJsonBody(event)
    if (!parsedBody.ok) return badRequest(parsedBody.message)
    const pollUrl = String(parsedBody.value?.poll_url || '').trim()
    if (!pollUrl) return badRequest('Body requires poll_url')

    let parsed
    try {
        parsed = new URL(pollUrl)
    } catch {
        return badRequest('poll_url must be a valid absolute URL')
    }
    if (!['api.replicate.com', 'replicate.com'].includes(parsed.hostname)) {
        return json(403, {
            error: 'replicate_poll_host_not_allowed',
            message: `Replicate poll host is not allowed: ${parsed.hostname}`,
        })
    }

    try {
        const upstream = await fetchWithTimeout(parsed.toString(), {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        })
        if (!upstream.ok) {
            return json(upstream.status, {
                error: 'replicate_poll_failed',
                message: await parseUpstreamError(upstream, `Replicate poll error (${upstream.status})`),
            })
        }
        const payload = await upstream.json()
        return json(200, payload)
    } catch (error) {
        if (error?.name === 'AbortError') {
            return json(504, {
                error: 'replicate_poll_timeout',
                message: `Replicate poll timed out after ${Math.round(PROVIDER_PROXY_TIMEOUT_MS / 1000)}s`,
            })
        }
        return json(502, {
            error: 'replicate_poll_proxy_error',
            message: error instanceof Error ? error.message : 'Replicate poll proxy request failed',
        })
    }
}

async function handleProviderHuggingFaceInfer(event) {
    if (event.httpMethod !== 'POST') return methodNotAllowed(['POST', 'OPTIONS'])
    const rateLimited = maybeRateLimit(event, { bucket: 'huggingface_infer', limit: Number(process.env.RATE_LIMIT_HUGGINGFACE_INFER || 30) })
    if (rateLimited) return rateLimited
    const token = getHuggingFaceToken()
    if (!token) {
        return json(503, {
            error: 'huggingface_token_missing',
            message: 'Hugging Face token is not configured in server environment.',
        })
    }

    const parsedBody = parseJsonBody(event)
    if (!parsedBody.ok) return badRequest(parsedBody.message)
    const modelId = String(parsedBody.value?.model_id || '').trim()
    const requestPayload = parsedBody.value?.request
    if (!modelId || !requestPayload || typeof requestPayload !== 'object') {
        return badRequest('Body requires model_id and request object')
    }

    try {
        const upstream = await fetchWithTimeout(`https://router.huggingface.co/hf-inference/models/${modelId}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestPayload),
        })

        const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
        if (!upstream.ok) {
            if (contentType.includes('application/json')) {
                const payload = await upstream.json().catch(() => ({}))
                return json(upstream.status, {
                    error: payload?.error || 'huggingface_request_failed',
                    message: payload?.error || `Hugging Face error (${upstream.status})`,
                    estimated_time: payload?.estimated_time ?? null,
                })
            }
            const text = await upstream.text().catch(() => '')
            return json(upstream.status, {
                error: 'huggingface_request_failed',
                message: text || `Hugging Face error (${upstream.status})`,
            })
        }

        const payload = Buffer.from(await upstream.arrayBuffer())
        return {
            statusCode: 200,
            isBase64Encoded: true,
            headers: {
                ...providerProxyCorsHeaders(event),
                'Content-Type': contentType,
                'Cache-Control': 'private, max-age=30',
            },
            body: payload.toString('base64'),
        }
    } catch (error) {
        if (error?.name === 'AbortError') {
            return json(504, {
                error: 'huggingface_timeout',
                message: `Hugging Face proxy timed out after ${Math.round(PROVIDER_PROXY_TIMEOUT_MS / 1000)}s`,
            })
        }
        return json(502, {
            error: 'huggingface_proxy_error',
            message: error instanceof Error ? error.message : 'Hugging Face proxy request failed',
        })
    }
}

async function handleProviderHealth(event) {
    if (event.httpMethod !== 'GET') return methodNotAllowed(['GET', 'OPTIONS'])

    const replicateConfigured = Boolean(getReplicateToken())
    const huggingfaceConfigured = Boolean(getHuggingFaceToken())

    return json(200, {
        ok: true,
        checked_at: new Date().toISOString(),
        providers: {
            replicate: {
                ok: replicateConfigured,
                token_configured: replicateConfigured,
                message: replicateConfigured ? 'Configured' : 'Server token missing',
            },
            huggingface: {
                ok: huggingfaceConfigured,
                token_configured: huggingfaceConfigured,
                message: huggingfaceConfigured ? 'Configured' : 'Server token missing',
            },
        },
    })
}

async function handleGenerate(event) {
    if (event.httpMethod !== 'POST') return methodNotAllowed(['POST', 'OPTIONS'])
    const parsedBody = parseJsonBody(event)
    if (!parsedBody.ok) return badRequest(parsedBody.message)

    const validated = validateSchema(GenerationRequestSchema, parsedBody.value)
    if (!validated.ok) return validationFailed(validated.errors)

    const job = createGenerationJob(validated.value)
    return json(202, {
        job_id: job.id,
        status: job.status,
        progress: job.progress,
        estimated_seconds: job.estimated_seconds,
        result_asset_ids: job.result_asset_ids,
        links: {
            self: `/api/v1/jobs/${job.id}`,
            websocket: '/ws/jobs',
        },
    })
}

async function handleJob(event, pathParts) {
    if (event.httpMethod !== 'GET') return methodNotAllowed(['GET', 'OPTIONS'])
    const jobId = pathParts[1]
    if (!jobId) return badRequest('Job id is required in /api/v1/jobs/{job_id}')
    const job = getJob(jobId)
    if (!job) return json(404, { error: 'not_found', message: 'job not found', id: jobId })
    return json(200, job)
}

async function handleAssetManifest(event, pathParts) {
    if (event.httpMethod !== 'GET') return methodNotAllowed(['GET', 'OPTIONS'])
    const assetId = pathParts[1]
    if (!assetId) return badRequest('Asset id is required in /api/v1/assets/{asset_id}/manifest')
    const asset = getAsset(assetId)
    if (!asset) return json(404, { error: 'not_found', message: 'asset not found', id: assetId })
    return json(200, asset)
}

async function handleAssetDownload(event, pathParts) {
    if (event.httpMethod !== 'GET') return methodNotAllowed(['GET', 'OPTIONS'])
    const assetId = pathParts[1]
    if (!assetId) return badRequest('Asset id is required in /api/v1/assets/{asset_id}/download')
    const ticket = getDownloadTicket(assetId)
    if (!ticket) return json(404, { error: 'not_found', message: 'asset not found', id: assetId })
    return json(200, ticket)
}

async function handleEnginePush(event) {
    if (event.httpMethod !== 'POST') return methodNotAllowed(['POST', 'OPTIONS'])
    const parsedBody = parseJsonBody(event)
    if (!parsedBody.ok) return badRequest(parsedBody.message)

    const validated = validateSchema(EnginePushSchema, parsedBody.value)
    if (!validated.ok) return validationFailed(validated.errors)

    const body = validated.value
    const asset = getAsset(body.asset_id)
    if (!asset) {
        return json(404, {
            error: 'asset_not_found',
            message: 'Cannot push a missing asset',
            asset_id: body.asset_id,
        })
    }

    const push = createEnginePush({
        asset_id: body.asset_id,
        target: body.target,
        endpoint: body.endpoint || null,
        hot_reload: body.hot_reload,
        fidelity_mode: body.fidelity_mode,
    })

    return json(202, {
        push_id: push.id,
        status: push.status,
        target: push.target,
        asset_id: push.asset_id,
        message: 'Engine push accepted by prototype orchestrator',
    })
}

async function handlePipelineExecute(event) {
    if (event.httpMethod !== 'POST') return methodNotAllowed(['POST', 'OPTIONS'])
    const parsedBody = parseJsonBody(event)
    if (!parsedBody.ok) return badRequest(parsedBody.message)

    const validated = validateSchema(PipelineExecuteSchema, parsedBody.value)
    if (!validated.ok) return validationFailed(validated.errors)

    const execution = createPipelineExecution(validated.value)
    return json(202, {
        run_id: execution.id,
        status: execution.status,
        request_id: execution.request_id,
        scene_name: execution.scene_name,
        target: execution.target,
        step_logs: execution.step_logs,
        summary: execution.summary,
        links: {
            self: `/api/v1/pipeline/runs/${execution.id}`,
        },
    })
}

async function handlePipelineRun(event, pathParts) {
    if (event.httpMethod !== 'GET') return methodNotAllowed(['GET', 'OPTIONS'])
    const runId = pathParts[2]
    if (!runId) return badRequest('Run id is required in /api/v1/pipeline/runs/{run_id}')
    const run = getPipelineExecution(runId)
    if (!run) return json(404, { error: 'not_found', message: 'pipeline run not found', id: runId })
    return json(200, run)
}

async function handleProviderJobsCreate(event) {
    if (event.httpMethod !== 'POST') return methodNotAllowed(['POST', 'OPTIONS'])
    if (!isInternalAuthorized(event)) {
        return json(401, {
            error: 'unauthorized',
            message: 'Missing or invalid orchestrator token',
        })
    }
    const parsedBody = parseJsonBody(event)
    if (!parsedBody.ok) return badRequest(parsedBody.message)

    const validated = validateSchema(ProviderJobCreateSchema, parsedBody.value)
    if (!validated.ok) return validationFailed(validated.errors)

    const record = createProviderJob(validated.value)
    return json(202, {
        ...record,
        links: {
            self: `/api/v1/provider-jobs/${record.provider_job_id}`,
            events: `/api/v1/provider-jobs/${record.provider_job_id}/events`,
        },
    })
}

async function handleProviderJob(event, pathParts) {
    if (event.httpMethod !== 'GET') return methodNotAllowed(['GET', 'OPTIONS'])
    const providerJobId = pathParts[1]
    if (!providerJobId) return badRequest('Provider job id is required in /api/v1/provider-jobs/{provider_job_id}')
    const job = getProviderJob(providerJobId)
    if (!job) return json(404, { error: 'not_found', message: 'provider job not found', id: providerJobId })
    return json(200, job)
}

async function handleProviderJobEvent(event, pathParts) {
    if (event.httpMethod !== 'POST') return methodNotAllowed(['POST', 'OPTIONS'])
    if (!isInternalAuthorized(event)) {
        return json(401, {
            error: 'unauthorized',
            message: 'Missing or invalid orchestrator token',
        })
    }
    const providerJobId = pathParts[1]
    if (!providerJobId) return badRequest('Provider job id is required in /api/v1/provider-jobs/{provider_job_id}/events')

    const parsedBody = parseJsonBody(event)
    if (!parsedBody.ok) return badRequest(parsedBody.message)

    const validated = validateSchema(ProviderJobEventSchema, parsedBody.value)
    if (!validated.ok) return validationFailed(validated.errors)

    const updated = appendProviderJobEvent(providerJobId, validated.value)
    if (!updated) return json(404, { error: 'not_found', message: 'provider job not found', id: providerJobId })
    return json(200, updated)
}

async function handleProviderWebhook(event) {
    if (event.httpMethod !== 'POST') return methodNotAllowed(['POST', 'OPTIONS'])
    const parsedBody = parseJsonBody(event)
    if (!parsedBody.ok) return badRequest(parsedBody.message)

    const validated = validateSchema(ProviderWebhookSchema, parsedBody.value)
    if (!validated.ok) return validationFailed(validated.errors)

    const signature = verifyWebhookSignature(event, validated.value.provider)
    if (!signature.ok) {
        return json(401, {
            error: 'invalid_webhook_signature',
            message: signature.error || 'Webhook signature validation failed',
        })
    }

    const payload = {
        ...validated.value,
        metadata: {
            ...(validated.value.metadata || {}),
            signature_verification: signature.mode,
        },
    }

    const updated = appendProviderWebhookEvent(payload)
    if (!updated) {
        return json(404, {
            error: 'provider_job_not_found',
            message: 'No provider job matched webhook payload',
        })
    }
    return json(200, {
        ok: true,
        provider_job_id: updated.provider_job_id,
        status: updated.status,
        updated_at: updated.updated_at,
    })
}

async function handleBillingLedger(event) {
    if (event.httpMethod !== 'GET') return methodNotAllowed(['GET', 'OPTIONS'])
    if (!isInternalAuthorized(event)) {
        return json(401, {
            error: 'unauthorized',
            message: 'Missing or invalid orchestrator token',
        })
    }
    if (REQUIRE_SERVER_BILLING_DB && !hasServerBillingDbConfig()) {
        return billingDbUnavailableResponse()
    }
    const userId = getQueryParam(event, 'user_id')
    if (!userId) return badRequest('Query parameter user_id is required')

    const ledger = await getBillingLedgerForUser(userId)
    return json(200, {
        ok: true,
        ledger,
    })
}

async function handleBillingLedgerEntry(event) {
    if (event.httpMethod !== 'POST') return methodNotAllowed(['POST', 'OPTIONS'])
    if (!isInternalAuthorized(event)) {
        return json(401, {
            error: 'unauthorized',
            message: 'Missing or invalid orchestrator token',
        })
    }
    if (REQUIRE_SERVER_BILLING_DB && !hasServerBillingDbConfig()) {
        return billingDbUnavailableResponse()
    }
    const rateLimited = maybeRateLimit(event, { bucket: 'billing_ledger_entry', limit: Number(process.env.RATE_LIMIT_BILLING_ENTRIES || 80) })
    if (rateLimited) return rateLimited
    const parsedBody = parseJsonBody(event)
    if (!parsedBody.ok) return badRequest(parsedBody.message)

    const validated = validateSchema(BillingLedgerEntrySchema, parsedBody.value)
    if (!validated.ok) return validationFailed(validated.errors)

    const ledger = await appendBillingLedgerEntry(validated.value)
    return json(201, {
        ok: true,
        ledger,
    })
}

async function handleBillingCredits(event) {
    if (event.httpMethod !== 'GET') return methodNotAllowed(['GET', 'OPTIONS'])
    if (!isInternalAuthorized(event)) {
        return json(401, {
            error: 'unauthorized',
            message: 'Missing or invalid orchestrator token',
        })
    }
    if (REQUIRE_SERVER_BILLING_DB && !hasServerBillingDbConfig()) {
        return billingDbUnavailableResponse()
    }

    const userId = getQueryParam(event, 'user_id')
    if (!userId) return badRequest('Query parameter user_id is required')
    const planTier = getQueryParam(event, 'plan_tier') || 'free'
    const seedCredits = Number(getQueryParam(event, 'seed_credits') || 0)

    const balance = await getCreditBalanceForUser({
        userId,
        planTier,
        seedCredits: Number.isFinite(seedCredits) ? seedCredits : 0,
    })

    return json(200, {
        ok: true,
        balance,
    })
}

async function handleBillingCreditsCharge(event) {
    if (event.httpMethod !== 'POST') return methodNotAllowed(['POST', 'OPTIONS'])
    if (!isInternalAuthorized(event)) {
        return json(401, {
            error: 'unauthorized',
            message: 'Missing or invalid orchestrator token',
        })
    }
    if (REQUIRE_SERVER_BILLING_DB && !hasServerBillingDbConfig()) {
        return billingDbUnavailableResponse()
    }
    const rateLimited = maybeRateLimit(event, {
        bucket: 'billing_credit_charge',
        limit: Number(process.env.RATE_LIMIT_BILLING_CREDITS || 120),
    })
    if (rateLimited) return rateLimited

    const parsedBody = parseJsonBody(event)
    if (!parsedBody.ok) return badRequest(parsedBody.message)

    const validated = validateSchema(BillingCreditsChargeSchema, parsedBody.value)
    if (!validated.ok) return validationFailed(validated.errors)

    const result = await chargeCreditBalanceForUser({
        userId: validated.value.user_id,
        planTier: validated.value.plan_tier || 'free',
        seedCredits: validated.value.seed_credits || 0,
        cost: validated.value.cost,
        idempotencyKey: validated.value.idempotency_key || null,
        metadata: validated.value.metadata || null,
    })

    if (!result.ok) {
        if (result.code === 'insufficient_credits') {
            return json(409, {
                error: 'insufficient_credits',
                message: result.message,
                details: {
                    credits_before: result.credits_before,
                    credits_required: result.credits_required,
                },
            })
        }
        return json(400, {
            error: result.code || 'credit_charge_failed',
            message: result.message || 'Unable to charge credits',
        })
    }

    return json(200, {
        ok: true,
        charge: result,
    })
}

export async function handler(event) {
    if (event.httpMethod === 'OPTIONS') {
        return withCors(event, noContent())
    }

    const pathParts = getPathParts(event)
    const [resource, idOrAction, action] = pathParts

    let response
    if (resource === 'generate') response = await handleGenerate(event)
    else if (resource === 'provider' && idOrAction === 'health') response = await handleProviderHealth(event)
    else if (resource === 'provider' && idOrAction === 'replicate' && action === 'predictions') response = await handleProviderReplicatePrediction(event)
    else if (resource === 'provider' && idOrAction === 'replicate' && action === 'poll') response = await handleProviderReplicatePoll(event)
    else if (resource === 'provider' && idOrAction === 'huggingface' && action === 'infer') response = await handleProviderHuggingFaceInfer(event)
    else if (resource === 'provider-file') response = await handleProviderFileFetch(event)
    else if (resource === 'jobs') response = await handleJob(event, pathParts)
    else if (resource === 'assets' && action === 'manifest') response = await handleAssetManifest(event, pathParts)
    else if (resource === 'assets' && action === 'download') response = await handleAssetDownload(event, pathParts)
    else if (resource === 'engine' && idOrAction === 'push') response = await handleEnginePush(event)
    else if (resource === 'pipeline' && idOrAction === 'execute') response = await handlePipelineExecute(event)
    else if (resource === 'pipeline' && idOrAction === 'runs') response = await handlePipelineRun(event, pathParts)
    else if (resource === 'provider-jobs' && pathParts.length === 1) response = await handleProviderJobsCreate(event)
    else if (resource === 'provider-jobs' && action === 'events') response = await handleProviderJobEvent(event, pathParts)
    else if (resource === 'provider-jobs') response = await handleProviderJob(event, pathParts)
    else if (resource === 'webhooks' && idOrAction === 'provider') response = await handleProviderWebhook(event)
    else if (resource === 'billing' && idOrAction === 'ledger' && action === 'entries') response = await handleBillingLedgerEntry(event)
    else if (resource === 'billing' && idOrAction === 'ledger') response = await handleBillingLedger(event)
    else if (resource === 'billing' && idOrAction === 'credits' && action === 'charge') response = await handleBillingCreditsCharge(event)
    else if (resource === 'billing' && idOrAction === 'credits') response = await handleBillingCredits(event)
    else response = routeNotFound(pathParts)

    return withCors(event, response)
}
