const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
        'Content-Type, Authorization, X-Request-Id, X-Orchestrator-Token, X-Webhook-Signature, X-Provider-Signature, X-Webhook-Timestamp, X-Provider-Timestamp',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export function json(statusCode, payload, extraHeaders = {}) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
            ...extraHeaders,
        },
        body: JSON.stringify(payload),
    }
}

export function noContent() {
    return {
        statusCode: 204,
        headers: {
            ...CORS_HEADERS,
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
