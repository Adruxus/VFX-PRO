import crypto from 'node:crypto'
import { badRequest, json, methodNotAllowed, noContent, parseJsonBody, validationFailed } from './lib/http.js'
import {
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
    if (!configuredToken) return true

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

export async function handler(event) {
    if (event.httpMethod === 'OPTIONS') return noContent()

    const pathParts = getPathParts(event)
    const [resource, idOrAction, action] = pathParts

    if (resource === 'generate') return handleGenerate(event)
    if (resource === 'jobs') return handleJob(event, pathParts)
    if (resource === 'assets' && action === 'manifest') return handleAssetManifest(event, pathParts)
    if (resource === 'assets' && action === 'download') return handleAssetDownload(event, pathParts)
    if (resource === 'engine' && idOrAction === 'push') return handleEnginePush(event)
    if (resource === 'pipeline' && idOrAction === 'execute') return handlePipelineExecute(event)
    if (resource === 'pipeline' && idOrAction === 'runs') return handlePipelineRun(event, pathParts)
    if (resource === 'provider-jobs' && pathParts.length === 1) return handleProviderJobsCreate(event)
    if (resource === 'provider-jobs' && action === 'events') return handleProviderJobEvent(event, pathParts)
    if (resource === 'provider-jobs') return handleProviderJob(event, pathParts)
    if (resource === 'webhooks' && idOrAction === 'provider') return handleProviderWebhook(event)
    if (resource === 'billing' && idOrAction === 'ledger' && action === 'entries') return handleBillingLedgerEntry(event)
    if (resource === 'billing' && idOrAction === 'ledger') return handleBillingLedger(event)

    return routeNotFound(pathParts)
}
