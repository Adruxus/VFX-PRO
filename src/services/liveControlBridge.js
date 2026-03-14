const DEFAULT_OSC_ENDPOINT = 'ws://127.0.0.1:7010/osc'
const MAX_SESSION_MESSAGES = 30

const liveControlSessions = new Map()

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeSessionId(protocol) {
    const suffix = Math.random().toString(36).slice(2, 10)
    return `${protocol}-ctrl-${suffix}`
}

function safeParseJson(value) {
    try {
        return JSON.parse(value)
    } catch {
        return null
    }
}

function pushSessionMessage(entry, message) {
    if (!entry || !message) return
    entry.messages.unshift(message)
    if (entry.messages.length > MAX_SESSION_MESSAGES) entry.messages.length = MAX_SESSION_MESSAGES
    if (typeof entry.onMessage === 'function') {
        try {
            entry.onMessage(message)
        } catch {}
    }
}

function listInputsFromAccess(access) {
    const entries = []
    if (!access?.inputs) return entries
    access.inputs.forEach((input) => {
        entries.push({
            id: input.id,
            name: input.name || 'Unnamed MIDI Input',
            manufacturer: input.manufacturer || '',
            state: input.state || 'unknown',
            connection: input.connection || 'unknown',
        })
    })
    return entries
}

function normalizeMidiMessage(event) {
    const data = Array.from(event?.data || [])
    if (!data.length) return null

    const status = data[0]
    const command = status & 0xf0
    const channel = (status & 0x0f) + 1
    const byte1 = Number(data[1] ?? 0)
    const byte2 = Number(data[2] ?? 0)
    const receivedAt = new Date().toISOString()

    if (command === 0x90 && byte2 > 0) {
        return {
            receivedAt,
            protocol: 'midi',
            messageType: 'note_on',
            channel,
            note: byte1,
            velocity: byte2,
            normalized: Number((byte2 / 127).toFixed(4)),
            raw: data,
        }
    }
    if (command === 0x80 || (command === 0x90 && byte2 === 0)) {
        return {
            receivedAt,
            protocol: 'midi',
            messageType: 'note_off',
            channel,
            note: byte1,
            velocity: byte2,
            normalized: Number((byte2 / 127).toFixed(4)),
            raw: data,
        }
    }
    if (command === 0xb0) {
        return {
            receivedAt,
            protocol: 'midi',
            messageType: 'cc',
            channel,
            controller: byte1,
            value: byte2,
            normalized: Number((byte2 / 127).toFixed(4)),
            raw: data,
        }
    }
    if (command === 0xe0) {
        const pitch = ((byte2 << 7) | byte1) - 8192
        return {
            receivedAt,
            protocol: 'midi',
            messageType: 'pitch_bend',
            channel,
            value: pitch,
            normalized: Number((pitch / 8192).toFixed(4)),
            raw: data,
        }
    }

    return {
        receivedAt,
        protocol: 'midi',
        messageType: 'other',
        channel,
        raw: data,
    }
}

function buildSessionResult({
    protocol,
    mode,
    endpoint = null,
    reason = null,
    selectedInputId = null,
    selectedInputName = null,
    inputs = null,
}) {
    return {
        sessionId: makeSessionId(protocol),
        protocol,
        mode,
        endpoint,
        reason,
        connectedAt: new Date().toISOString(),
        selectedInputId,
        selectedInputName,
        inputs,
    }
}

export function getDefaultOscEndpoint() {
    return DEFAULT_OSC_ENDPOINT
}

export function getLiveControlSessionMessages(sessionId) {
    const entry = liveControlSessions.get(sessionId)
    return entry ? [...entry.messages] : []
}

export async function listMidiInputs() {
    if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') return []
    try {
        const access = await navigator.requestMIDIAccess({ sysex: false })
        return listInputsFromAccess(access)
    } catch {
        return []
    }
}

export async function connectMidiControl({ inputId, allowMockFallback = true, onMessage } = {}) {
    if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') {
        if (!allowMockFallback) throw new Error('Web MIDI API is unavailable in this browser')
        return buildSessionResult({
            protocol: 'midi',
            mode: 'mock',
            reason: 'Web MIDI API unavailable',
            inputs: [],
        })
    }

    try {
        const access = await navigator.requestMIDIAccess({ sysex: false })
        const inputs = listInputsFromAccess(access)
        if (!inputs.length) throw new Error('No MIDI inputs detected')

        const selectedInputMeta = inputs.find((item) => item.id === inputId) || inputs[0]
        const selectedInput = access.inputs.get(selectedInputMeta.id)
        if (!selectedInput) throw new Error('Selected MIDI input is unavailable')

        const session = buildSessionResult({
            protocol: 'midi',
            mode: 'live',
            selectedInputId: selectedInputMeta.id,
            selectedInputName: selectedInputMeta.name,
            inputs,
        })

        const entry = {
            protocol: 'midi',
            messages: [],
            onMessage,
            access,
            input: selectedInput,
            previousInputHandler: selectedInput.onmidimessage || null,
            previousAccessHandler: access.onstatechange || null,
        }

        selectedInput.onmidimessage = (event) => {
            const parsed = normalizeMidiMessage(event)
            if (!parsed) return
            pushSessionMessage(entry, parsed)
        }

        access.onstatechange = (event) => {
            const port = event?.port
            pushSessionMessage(entry, {
                receivedAt: new Date().toISOString(),
                protocol: 'midi',
                messageType: 'state_change',
                port: port
                    ? {
                          id: port.id,
                          name: port.name || 'Unknown',
                          state: port.state || 'unknown',
                          connection: port.connection || 'unknown',
                          type: port.type || 'unknown',
                      }
                    : null,
            })
        }

        liveControlSessions.set(session.sessionId, entry)
        return session
    } catch (error) {
        if (!allowMockFallback) throw error
        return buildSessionResult({
            protocol: 'midi',
            mode: 'mock',
            reason: error instanceof Error ? error.message : 'MIDI connection failed',
            inputs: [],
        })
    }
}

export async function connectOscControl({
    endpoint = DEFAULT_OSC_ENDPOINT,
    timeoutMs = 2600,
    allowMockFallback = true,
    onMessage,
} = {}) {
    const resolvedEndpoint = endpoint || DEFAULT_OSC_ENDPOINT
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
        if (!allowMockFallback) throw new Error('WebSocket API unavailable')
        return buildSessionResult({
            protocol: 'osc',
            mode: 'mock',
            endpoint: resolvedEndpoint,
            reason: 'WebSocket API unavailable',
        })
    }

    try {
        const socket = await new Promise((resolve, reject) => {
            let settled = false
            const ws = new WebSocket(resolvedEndpoint)
            const timer = setTimeout(() => {
                if (settled) return
                settled = true
                try {
                    ws.close()
                } catch {}
                reject(new Error(`OSC bridge connect timeout after ${timeoutMs}ms`))
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
                reject(new Error('OSC bridge socket error'))
            }
        })

        const session = buildSessionResult({
            protocol: 'osc',
            mode: 'live',
            endpoint: resolvedEndpoint,
        })

        const entry = {
            protocol: 'osc',
            messages: [],
            onMessage,
            socket,
        }

        socket.onmessage = (event) => {
            const payload = safeParseJson(event.data)
            pushSessionMessage(entry, {
                receivedAt: new Date().toISOString(),
                protocol: 'osc',
                messageType: 'incoming',
                payload: payload || event.data,
            })
        }

        socket.onerror = () => {
            pushSessionMessage(entry, {
                receivedAt: new Date().toISOString(),
                protocol: 'osc',
                messageType: 'socket_error',
            })
        }

        socket.onclose = () => {
            pushSessionMessage(entry, {
                receivedAt: new Date().toISOString(),
                protocol: 'osc',
                messageType: 'socket_closed',
            })
        }

        liveControlSessions.set(session.sessionId, entry)
        return session
    } catch (error) {
        if (!allowMockFallback) throw error
        return buildSessionResult({
            protocol: 'osc',
            mode: 'mock',
            endpoint: resolvedEndpoint,
            reason: error instanceof Error ? error.message : 'OSC connection failed',
        })
    }
}

export async function sendOscControl({ sessionId, address, args = [] } = {}) {
    const entry = liveControlSessions.get(sessionId)
    if (!entry || entry.protocol !== 'osc') {
        await wait(120)
        return {
            ok: false,
            mode: 'mock',
            error: 'OSC session not connected',
        }
    }

    const payload = {
        type: 'osc.send',
        address: address || '/vfx/ping',
        args: Array.isArray(args) ? args : [args],
    }

    if (!entry.socket || entry.socket.readyState !== WebSocket.OPEN) {
        pushSessionMessage(entry, {
            receivedAt: new Date().toISOString(),
            protocol: 'osc',
            messageType: 'outgoing',
            payload,
            warning: 'Socket closed, message not delivered',
        })
        return {
            ok: true,
            mode: 'mock',
            warning: 'Socket closed, captured locally only',
        }
    }

    entry.socket.send(JSON.stringify(payload))
    pushSessionMessage(entry, {
        receivedAt: new Date().toISOString(),
        protocol: 'osc',
        messageType: 'outgoing',
        payload,
    })
    return {
        ok: true,
        mode: 'live',
    }
}

export async function disconnectLiveControl({ sessionId } = {}) {
    const entry = liveControlSessions.get(sessionId)
    if (!entry) {
        await wait(60)
        return { ok: true, sessionId, disconnectedAt: new Date().toISOString() }
    }

    if (entry.protocol === 'osc' && entry.socket) {
        try {
            entry.socket.close(1000, 'Client disconnect')
        } catch {}
    }

    if (entry.protocol === 'midi') {
        if (entry.input) entry.input.onmidimessage = entry.previousInputHandler
        if (entry.access) entry.access.onstatechange = entry.previousAccessHandler
    }

    liveControlSessions.delete(sessionId)
    await wait(80)
    return {
        ok: true,
        sessionId,
        disconnectedAt: new Date().toISOString(),
    }
}
