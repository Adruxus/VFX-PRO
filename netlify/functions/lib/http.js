const DEFAULT_ALLOWED_ORIGINS = [
    'https://vfx-studios.com',
    'https://www.vfx-studios.com',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]

function parseAllowedOrigins() {
    const configured = String(process.env.CORS_ALLOW_ORIGINS || process.env.CORS_ALLOW_ORIGIN || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    return configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS
}

const ALLOWED_ORIGINS = parseAllowedOrigins()

function getHeaderValue(event, name) {
    const headers = event?.headers || {}
    if (headers[name] != null) return String(headers[name]).trim()
    const target = String(name || '').toLowerCase()
    for (const [key, value] of Object.entries(headers)) {
        if (String(key).toLowerCase() === target) return String(value || '').trim()
    }
    return ''
}

function pickAllowedOrigin(event) {
    const requestedOrigin = getHeaderValue(event, 'origin')
    if (!requestedOrigin) return ALLOWED_ORIGINS[0] || ''
    return ALLOWED_ORIGINS.includes(requestedOrigin) ? requestedOrigin : ''
}

export function corsHeadersForEvent(event) {
    const allowedOrigin = pickAllowedOrigin(event)
    return {
        'Access-Control-Allow-Origin': allowedOrigin || 'null',
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, X-Request-Id, X-Orchestrator-Token, X-Webhook-Signature, X-Provider-Signature, X-Webhook-Timestamp, X-Provider-Timestamp',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        Vary: 'Origin',
    }
}

export function withCors(event, response) {
    if (!response || typeof response !== 'object') return response
    return {
        ...response,
        headers: {
            ...(response.headers || {}),
            ...corsHeadersForEvent(event),
        },
    }
}

export function json(statusCode, payload, extraHeaders = {}) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeadersForEvent(null),
            ...extraHeaders,
        },
        body: JSON.stringify(payload),
    }
}

export function noContent() {
    return {
        statusCode: 204,
        headers: {
            ...corsHeadersForEvent(null),
        },
        body: '',
    }
}

export function methodNotAllowed(methods) {
    return json(405, {
        error: 'method_not_allowed',
        message: `Use one of: ${methods.join(', ')}`,
        allowed_methods: methods,
    })
}

export function notFound(resource, id) {
    return json(404, {
        error: 'not_found',
        message: `${resource} not found`,
        resource,
        id: id || null,
    })
}

export function badRequest(message, details = null) {
    return json(400, {
        error: 'bad_request',
        message,
        details,
    })
}

export function validationFailed(details) {
    return json(422, {
        error: 'validation_failed',
        message: 'Request payload does not match schema requirements',
        details,
    })
}

export function parseJsonBody(event) {
    const bodyText = event?.body || ''
    if (!bodyText) return { ok: true, value: {} }
    try {
        return { ok: true, value: JSON.parse(bodyText) }
    } catch {
        return { ok: false, message: 'Body must be valid JSON' }
    }
}

export function getPathTail(event) {
    const path = event?.path || event?.rawUrl || ''
    const parts = path.split('/').filter(Boolean)
    return decodeURIComponent(parts[parts.length - 1] || '')
}
