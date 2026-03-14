const QUEUE_ANALYTICS_STORAGE_KEY = 'vfx_pro_queue_analytics'
const MAX_QUEUE_ANALYTICS_EVENTS = 800

function storageKey(userId) {
    return `${QUEUE_ANALYTICS_STORAGE_KEY}:${userId || 'guest'}`
}

function normalizeText(value, maxLength = 120) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, maxLength)
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

function readEvents(userId) {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed
            .filter((event) => event && typeof event === 'object')
            .map((event) => ({
                id: normalizeText(event.id, 120),
                created_at: normalizeText(event.created_at, 80),
                lane: normalizeText(event.lane, 60) || 'Community',
                model_id: normalizeText(event.model_id, 200) || null,
                provider: normalizeText(event.provider, 80) || null,
                status: normalizeText(event.status, 30) || 'unknown',
                queue_position: toNumber(event.queue_position, 0),
                queue_wait_ms: toNumber(event.queue_wait_ms, 0),
                total_elapsed_ms: toNumber(event.total_elapsed_ms, 0),
            }))
            .filter((event) => event.id && event.created_at)
            .slice(0, MAX_QUEUE_ANALYTICS_EVENTS)
    } catch {
        return []
    }
}

function writeEvents(userId, events) {
    localStorage.setItem(storageKey(userId), JSON.stringify(events.slice(0, MAX_QUEUE_ANALYTICS_EVENTS)))
}

function buildId() {
    return `queue_evt_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

export function recordQueueAnalyticsEvent(userId, payload = {}) {
    const event = {
        id: payload.id || buildId(),
        created_at: payload.created_at || new Date().toISOString(),
        lane: normalizeText(payload.lane, 60) || 'Community',
        model_id: normalizeText(payload.model_id, 200) || null,
        provider: normalizeText(payload.provider, 80) || null,
        status: normalizeText(payload.status, 30) || 'unknown',
        queue_position: Math.max(0, Math.floor(toNumber(payload.queue_position, 0))),
        queue_wait_ms: Math.max(0, Math.floor(toNumber(payload.queue_wait_ms, 0))),
        total_elapsed_ms: Math.max(0, Math.floor(toNumber(payload.total_elapsed_ms, 0))),
    }
    const current = readEvents(userId)
    writeEvents(userId, [event, ...current])
    return event
}

function percentile(values, pct) {
    if (!Array.isArray(values) || values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((pct / 100) * sorted.length)))
    return sorted[index] || 0
}

export function getQueueAnalyticsSummary(userId, { days = 30 } = {}) {
    const events = readEvents(userId)
    const cutoff = Date.now() - Math.max(1, Number(days) || 30) * 24 * 60 * 60 * 1000
    const filtered = events.filter((event) => {
        const ts = Date.parse(event.created_at)
        return Number.isFinite(ts) && ts >= cutoff
    })

    const lanes = new Map()
    for (const event of filtered) {
        const lane = event.lane || 'Community'
        const current = lanes.get(lane) || {
            lane,
            attempts: 0,
            succeeded: 0,
            failed: 0,
            queueWaitMs: [],
            totalElapsedMs: [],
            peakQueuePosition: 0,
        }
        current.attempts += 1
        if (event.status === 'succeeded') current.succeeded += 1
        if (event.status === 'failed') current.failed += 1
        if (event.queue_wait_ms > 0) current.queueWaitMs.push(event.queue_wait_ms)
        if (event.total_elapsed_ms > 0) current.totalElapsedMs.push(event.total_elapsed_ms)
        current.peakQueuePosition = Math.max(current.peakQueuePosition, event.queue_position || 0)
        lanes.set(lane, current)
    }

    const laneSummaries = Array.from(lanes.values())
        .map((item) => ({
            lane: item.lane,
            attempts: item.attempts,
            succeeded: item.succeeded,
            failed: item.failed,
            success_rate_pct: item.attempts > 0 ? Math.round((item.succeeded / item.attempts) * 100) : 0,
            avg_queue_wait_sec:
                item.queueWaitMs.length > 0
                    ? Number((item.queueWaitMs.reduce((sum, value) => sum + value, 0) / item.queueWaitMs.length / 1000).toFixed(1))
                    : 0,
            p95_queue_wait_sec: Number((percentile(item.queueWaitMs, 95) / 1000).toFixed(1)),
            avg_total_sec:
                item.totalElapsedMs.length > 0
                    ? Number((item.totalElapsedMs.reduce((sum, value) => sum + value, 0) / item.totalElapsedMs.length / 1000).toFixed(1))
                    : 0,
            peak_queue_position: item.peakQueuePosition,
        }))
        .sort((a, b) => b.attempts - a.attempts)

    return {
        window_days: Math.max(1, Number(days) || 30),
        total_attempts: filtered.length,
        lanes: laneSummaries,
        recent_events: filtered.slice(0, 20),
    }
}
