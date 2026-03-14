const ENGINE_DEFAULT_ENDPOINTS = {
    unreal: 'ws://127.0.0.1:7777/vfx-runtime',
    unity: 'ws://127.0.0.1:7000/vfx-runtime',
}

const bridgeSessions = new Map()

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeSessionId(target) {
    const suffix = Math.random().toString(36).slice(2, 10)
    return `${target}-session-${suffix}`
}

function makeRequestId(prefix = 'req') {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function hashText(text) {
    let hash = 0
    for (let index = 0; index < text.length; index += 1) {
        hash = (hash << 5) - hash + text.charCodeAt(index)
        hash |= 0
    }
    return Math.abs(hash).toString(16)
}

function safeParse(text) {
    try {
        return JSON.parse(text)
    } catch {
        return null
    }
}

function buildSessionResult({ target, endpoint, mode, reason }) {
    return {
        sessionId: makeSessionId(target),
        target,
        endpoint,
        mode,
        reason,
        connectedAt: new Date().toISOString(),
    }
}

function createSocketEntry(socket) {
    return {
        socket,
        pendingAcks: new Map(),
        messages: [],
        connectionState: 'open',
        lastError: null,
        lastClose: null,
    }
}

function rejectPendingAck(entry, errorMessage) {
    entry.pendingAcks.forEach(({ reject, timer }) => {
        clearTimeout(timer)
        reject(new Error(errorMessage))
    })
    entry.pendingAcks.clear()
}

function pushMessage(entry, message) {
    entry.messages.unshift(message)
    if (entry.messages.length > 30) entry.messages.length = 30
}

function waitForAck(sessionId, requestId, timeoutMs = 2200) {
    const entry = bridgeSessions.get(sessionId)
    if (!entry) return Promise.reject(new Error('Bridge session not found'))

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            entry.pendingAcks.delete(requestId)
            reject(new Error(`Timed out waiting for ack (${requestId})`))
        }, timeoutMs)

        entry.pendingAcks.set(requestId, {
            resolve,
            reject,
            timer,
        })
    })
}

function registerSocketHandlers(session, entry) {
    entry.socket.onmessage = (event) => {
        const message = safeParse(event.data)
        pushMessage(entry, {
            receivedAt: new Date().toISOString(),
            payload: message || event.data,
        })

        if (!message || typeof message !== 'object') return

        const requestId = message.requestId || message.id
        if (requestId && entry.pendingAcks.has(requestId)) {
            const pending = entry.pendingAcks.get(requestId)
            clearTimeout(pending.timer)
            entry.pendingAcks.delete(requestId)
            pending.resolve(message)
        }
    }

    entry.socket.onerror = () => {
        entry.lastError = 'Socket transport error'
        pushMessage(entry, {
            receivedAt: new Date().toISOString(),
            payload: { type: 'bridge.error', message: 'Socket transport error' },
        })
    }

    entry.socket.onclose = (event) => {
        entry.connectionState = 'closed'
        entry.lastClose = {
            at: new Date().toISOString(),
            code: event?.code ?? null,
            reason: event?.reason || '',
            wasClean: Boolean(event?.wasClean),
        }
        pushMessage(entry, {
            receivedAt: new Date().toISOString(),
            payload: {
                type: 'bridge.closed',
                code: event?.code ?? null,
                reason: event?.reason || '',
                wasClean: Boolean(event?.wasClean),
            },
        })
        rejectPendingAck(entry, 'Bridge socket closed')
    }
}

function createMockResult(target, endpoint, reason) {
    return buildSessionResult({
        target,
        endpoint,
        mode: 'mock',
        reason,
    })
}

export function getDefaultRuntimeEndpoint(target) {
    return ENGINE_DEFAULT_ENDPOINTS[target] || ENGINE_DEFAULT_ENDPOINTS.unreal
}

export function serializeSceneForRuntime(scene) {
    return {
        version: 'editor-bridge-v2',
        generatedAt: new Date().toISOString(),
        scene: {
            name: scene.name,
            duration: scene.duration,
            fps: scene.fps,
            engineTarget: scene.engineTarget,
            layers: (scene.layers || []).map((layer) => ({
                id: layer.id,
                name: layer.name,
                type: layer.type,
                blendMode: layer.blendMode || 'normal',
                visible: layer.visible !== false,
                muted: layer.muted === true,
                keyframes: layer.keyframes || [],
            })),
            nodes: scene.nodes || [],
            links: scene.links || [],
        },
    }
}

export async function connectRuntimeBridge({
    target,
    endpoint,
    timeoutMs = 2800,
    allowMockFallback = true,
} = {}) {
    const resolvedTarget = target || 'unreal'
    const resolvedEndpoint = endpoint || getDefaultRuntimeEndpoint(resolvedTarget)

    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
        await wait(100)
        return createMockResult(resolvedTarget, resolvedEndpoint, 'WebSocket unavailable in this environment')
    }

    const session = buildSessionResult({
        target: resolvedTarget,
        endpoint: resolvedEndpoint,
        mode: 'live',
    })

    try {
        const socket = await new Promise((resolve, reject) => {
            let settled = false
            const ws = new WebSocket(resolvedEndpoint)
            const timer = setTimeout(() => {
                if (settled) return
                settled = true
                try { ws.close() } catch {}
                reject(new Error(`Connect timeout after ${timeoutMs}ms`))
            }, timeoutMs)

            ws.onopen = () => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                resolve(ws)
            }

            ws.onerror = () => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                reject(new Error('Socket connection failed'))
            }
        })

        const entry = createSocketEntry(socket)
        bridgeSessions.set(session.sessionId, entry)
        registerSocketHandlers(session, entry)

        return session
    } catch (error) {
        if (!allowMockFallback) throw error
        const reason = error instanceof Error ? error.message : 'Unknown connection error'
        return createMockResult(resolvedTarget, resolvedEndpoint, reason)
    }
}

export async function syncRuntimeScene({
    sessionId,
    target,
    endpoint,
    scene,
    timeoutMs = 2400,
} = {}) {
    const payload = serializeSceneForRuntime(scene || {})
    const payloadText = JSON.stringify(payload)
    const payloadHash = hashText(payloadText)

    const baseResult = {
        sessionId,
        target,
        endpoint,
        payloadHash,
        payloadSize: payloadText.length,
        layersSent: (scene?.layers || []).length,
        nodesSent: (scene?.nodes || []).length,
        syncedAt: new Date().toISOString(),
    }

    if (!sessionId) {
        await wait(320)
        return {
            ...baseResult,
            ok: false,
            mode: 'mock',
            ack: 'offline-no-session',
            error: 'No active bridge session',
        }
    }

    const entry = bridgeSessions.get(sessionId)
    if (!entry) {
        await wait(220)
        return {
            ...baseResult,
            ok: false,
            mode: 'mock',
            ack: 'offline-missing-session',
            error: 'Bridge session not found',
        }
    }

    if (!entry.socket || entry.socket.readyState !== WebSocket.OPEN) {
        await wait(320)
        return {
            ...baseResult,
            ok: false,
            mode: 'mock',
            ack: 'offline-socket-not-open',
            error: entry.lastError || `Bridge socket is not open (state ${entry?.socket?.readyState ?? 'missing'})`,
            connectionState: entry.connectionState,
            lastClose: entry.lastClose,
        }
    }

    const requestId = makeRequestId('sync')

    try {
        const frame = {
            type: 'scene.sync',
            requestId,
            payload,
        }
        entry.socket.send(JSON.stringify(frame))
        const ackPayload = await waitForAck(sessionId, requestId, timeoutMs)

        return {
            ...baseResult,
            ok: true,
            mode: 'live',
            ack: ackPayload?.status || ackPayload?.type || 'ack',
            runtimeMessage: ackPayload,
            connectionState: entry.connectionState,
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Sync completed without ack'
        return {
            ...baseResult,
            ok: false,
            mode: 'live',
            ack: 'sent-no-ack',
            error: message,
            warning: message,
            connectionState: entry.connectionState,
            lastClose: entry.lastClose,
        }
    }
}

export async function disconnectRuntimeBridge({ sessionId } = {}) {
    const entry = bridgeSessions.get(sessionId)
    if (entry?.socket) {
        try {
            entry.socket.close(1000, 'Client disconnect')
        } catch {}
        rejectPendingAck(entry, 'Bridge disconnected by client')
        bridgeSessions.delete(sessionId)
    }

    await wait(120)

    return {
        ok: true,
        sessionId,
        disconnectedAt: new Date().toISOString(),
    }
}

export function getRuntimeSessionMessages(sessionId) {
    const entry = bridgeSessions.get(sessionId)
    return entry ? [...entry.messages] : []
}
