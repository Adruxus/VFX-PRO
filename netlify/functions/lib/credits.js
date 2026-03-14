const creditState = globalThis.__VFX_CREDITS__ || {
    balances: new Map(),
    processedCharges: new Map(),
}

if (!globalThis.__VFX_CREDITS__) {
    globalThis.__VFX_CREDITS__ = creditState
}

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ACCESS_TOKEN || '').trim()
const SUPABASE_CREDITS_TABLE = String(process.env.SUPABASE_CREDITS_TABLE || 'credit_balances').trim()
const MAX_PROCESSED_CHARGE_KEYS = 2000
const MAX_CREDITS_BALANCE = 10_000_000
const DEFAULT_PLAN_TIER = 'free'

function nowIso() {
    return new Date().toISOString()
}

function normalizeText(value, maxLength = 120) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, maxLength)
}

function toPositiveInt(value, fallback = 0, max = MAX_CREDITS_BALANCE) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return Math.max(0, Math.min(max, Math.floor(fallback)))
    return Math.max(0, Math.min(max, Math.floor(parsed)))
}

function normalizePlanTier(value) {
    const normalized = normalizeText(value || DEFAULT_PLAN_TIER, 80)
    return normalized || DEFAULT_PLAN_TIER
}

function normalizeUserId(userId) {
    const normalized = normalizeText(userId || 'guest', 200)
    return normalized || 'guest'
}

function normalizeIdempotencyKey(value) {
    const normalized = normalizeText(value || '', 200)
    return normalized || null
}

function normalizeSeedCredits(seedCredits) {
    return toPositiveInt(seedCredits, 0)
}

function buildBalanceRecord({
    userId,
    planTier = DEFAULT_PLAN_TIER,
    creditsBalance = 0,
    seededCredits = 0,
    seededAt = null,
    updatedAt = null,
    storage = 'memory_fallback',
    warning = null,
}) {
    const nextUpdatedAt = updatedAt || nowIso()
    return {
        user_id: normalizeUserId(userId),
        plan_tier: normalizePlanTier(planTier),
        credits_balance: toPositiveInt(creditsBalance, seededCredits),
        seeded_credits: normalizeSeedCredits(seededCredits),
        seeded_at: seededAt || nextUpdatedAt,
        updated_at: nextUpdatedAt,
        storage,
        warning: warning || null,
    }
}

function canUseSupabase() {
    return Boolean(SUPABASE_URL && SUPABASE_KEY && SUPABASE_CREDITS_TABLE)
}

async function supabaseRequest(path, { method = 'GET', payload = null, prefer = 'return=representation' } = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
        method,
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: prefer,
        },
        body: payload == null ? undefined : JSON.stringify(payload),
    })

    if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`Supabase credits request failed (${response.status}) ${detail}`.trim())
    }

    const isJson = (response.headers.get('content-type') || '').includes('application/json')
    if (!isJson) return null
    return response.json()
}

function toSupabaseBalanceRow(record) {
    return {
        user_id: record.user_id,
        plan_tier: record.plan_tier,
        credits_balance: toPositiveInt(record.credits_balance, 0),
        seeded_credits: normalizeSeedCredits(record.seeded_credits),
        seeded_at: normalizeText(record.seeded_at || nowIso(), 80) || nowIso(),
        updated_at: normalizeText(record.updated_at || nowIso(), 80) || nowIso(),
    }
}

function fromSupabaseBalanceRow(row) {
    if (!row || typeof row !== 'object') return null
    return buildBalanceRecord({
        userId: row.user_id,
        planTier: row.plan_tier || DEFAULT_PLAN_TIER,
        creditsBalance: row.credits_balance,
        seededCredits: row.seeded_credits,
        seededAt: row.seeded_at || nowIso(),
        updatedAt: row.updated_at || nowIso(),
        storage: 'supabase',
    })
}

async function readSupabaseBalance(userId) {
    const query = new URLSearchParams({
        select: 'user_id,plan_tier,credits_balance,seeded_credits,seeded_at,updated_at',
        user_id: `eq.${userId}`,
        limit: '1',
    })
    const rows = await supabaseRequest(`/${SUPABASE_CREDITS_TABLE}?${query.toString()}`, { method: 'GET' })
    if (!Array.isArray(rows) || rows.length === 0) return null
    return fromSupabaseBalanceRow(rows[0])
}

async function upsertSupabaseBalance(record) {
    const payload = [toSupabaseBalanceRow(record)]
    const rows = await supabaseRequest(`/${SUPABASE_CREDITS_TABLE}?on_conflict=user_id`, {
        method: 'POST',
        payload,
        prefer: 'resolution=merge-duplicates,return=representation',
    })
    if (!Array.isArray(rows) || rows.length === 0) return record
    return fromSupabaseBalanceRow(rows[0]) || record
}

function readMemoryBalance(userId, planTier, seededCredits) {
    const existing = creditState.balances.get(userId)
    if (!existing) {
        const created = buildBalanceRecord({
            userId,
            planTier,
            creditsBalance: seededCredits,
            seededCredits,
            storage: 'memory_fallback',
        })
        creditState.balances.set(userId, created)
        return created
    }

    let next = {
        ...existing,
        user_id: userId,
        plan_tier: planTier || existing.plan_tier || DEFAULT_PLAN_TIER,
    }

    if (toPositiveInt(seededCredits, 0) > toPositiveInt(existing.seeded_credits, 0) && toPositiveInt(existing.credits_balance, 0) < seededCredits) {
        next = buildBalanceRecord({
            ...next,
            userId,
            planTier: next.plan_tier,
            creditsBalance: seededCredits,
            seededCredits,
            seededAt: existing.seeded_at || nowIso(),
            storage: 'memory_fallback',
        })
    } else {
        next = buildBalanceRecord({
            ...next,
            userId,
            planTier: next.plan_tier,
            creditsBalance: existing.credits_balance,
            seededCredits: Math.max(toPositiveInt(existing.seeded_credits, 0), toPositiveInt(seededCredits, 0)),
            seededAt: existing.seeded_at || nowIso(),
            updatedAt: existing.updated_at || nowIso(),
            storage: 'memory_fallback',
        })
    }

    creditState.balances.set(userId, next)
    return next
}

function writeMemoryBalance(record) {
    const normalized = buildBalanceRecord({
        ...record,
        userId: record.user_id,
        planTier: record.plan_tier,
        storage: 'memory_fallback',
    })
    creditState.balances.set(normalized.user_id, normalized)
    return normalized
}

function buildProcessedChargeKey(userId, idempotencyKey) {
    const normalizedKey = normalizeIdempotencyKey(idempotencyKey)
    if (!normalizedKey) return null
    return `${normalizeUserId(userId)}:${normalizedKey}`
}

function readProcessedCharge(userId, idempotencyKey) {
    const key = buildProcessedChargeKey(userId, idempotencyKey)
    if (!key) return null
    return creditState.processedCharges.get(key) || null
}

function writeProcessedCharge(userId, idempotencyKey, payload) {
    const key = buildProcessedChargeKey(userId, idempotencyKey)
    if (!key) return
    creditState.processedCharges.set(key, payload)
    if (creditState.processedCharges.size > MAX_PROCESSED_CHARGE_KEYS) {
        const first = creditState.processedCharges.keys().next().value
        if (first) creditState.processedCharges.delete(first)
    }
}

async function getOrCreateSupabaseBalance(userId, planTier, seededCredits) {
    const existing = await readSupabaseBalance(userId)
    if (existing) {
        const currentBalance = toPositiveInt(existing.credits_balance, 0)
        const currentSeed = toPositiveInt(existing.seeded_credits, 0)
        const nextSeed = Math.max(currentSeed, seededCredits)
        const shouldRaiseCredits = nextSeed > currentSeed && currentBalance < nextSeed
        if (!shouldRaiseCredits && existing.plan_tier === planTier) {
            return existing
        }
        const updated = buildBalanceRecord({
            userId,
            planTier,
            creditsBalance: shouldRaiseCredits ? nextSeed : currentBalance,
            seededCredits: nextSeed,
            seededAt: existing.seeded_at || nowIso(),
            updatedAt: nowIso(),
            storage: 'supabase',
        })
        return await upsertSupabaseBalance(updated)
    }
    const created = buildBalanceRecord({
        userId,
        planTier,
        creditsBalance: seededCredits,
        seededCredits,
        storage: 'supabase',
    })
    return await upsertSupabaseBalance(created)
}

export async function getCreditBalanceForUser({ userId, planTier = DEFAULT_PLAN_TIER, seedCredits = 0 }) {
    const normalizedUserId = normalizeUserId(userId)
    const normalizedPlanTier = normalizePlanTier(planTier)
    const normalizedSeedCredits = normalizeSeedCredits(seedCredits)

    if (canUseSupabase()) {
        try {
            return await getOrCreateSupabaseBalance(normalizedUserId, normalizedPlanTier, normalizedSeedCredits)
        } catch (error) {
            const memory = readMemoryBalance(normalizedUserId, normalizedPlanTier, normalizedSeedCredits)
            return {
                ...memory,
                warning: error instanceof Error ? error.message : 'Supabase credits read failed',
            }
        }
    }

    const memory = readMemoryBalance(normalizedUserId, normalizedPlanTier, normalizedSeedCredits)
    return {
        ...memory,
        warning: 'Supabase credits table is not configured',
    }
}

async function persistUpdatedBalance(record) {
    if (canUseSupabase() && record.storage === 'supabase') {
        try {
            return await upsertSupabaseBalance(record)
        } catch (error) {
            const memory = writeMemoryBalance({
                ...record,
                storage: 'memory_fallback',
                warning: error instanceof Error ? error.message : 'Supabase credits write failed',
            })
            return memory
        }
    }
    return writeMemoryBalance(record)
}

export async function chargeCreditBalanceForUser({
    userId,
    planTier = DEFAULT_PLAN_TIER,
    seedCredits = 0,
    cost,
    idempotencyKey = null,
    metadata = null,
}) {
    const normalizedUserId = normalizeUserId(userId)
    const normalizedPlanTier = normalizePlanTier(planTier)
    const normalizedSeedCredits = normalizeSeedCredits(seedCredits)
    const normalizedCost = toPositiveInt(cost, 0)
    const normalizedIdempotencyKey = normalizeIdempotencyKey(idempotencyKey)

    if (normalizedCost <= 0) {
        return {
            ok: false,
            code: 'invalid_cost',
            message: 'Charge cost must be greater than 0 credits.',
        }
    }

    const cached = readProcessedCharge(normalizedUserId, normalizedIdempotencyKey)
    if (cached) {
        return {
            ...cached,
            idempotent: true,
        }
    }

    const currentBalance = await getCreditBalanceForUser({
        userId: normalizedUserId,
        planTier: normalizedPlanTier,
        seedCredits: normalizedSeedCredits,
    })
    const before = toPositiveInt(currentBalance.credits_balance, 0)
    if (before < normalizedCost) {
        return {
            ok: false,
            code: 'insufficient_credits',
            message: `Insufficient credits. Need ${normalizedCost}, have ${before}.`,
            credits_before: before,
            credits_required: normalizedCost,
            balance: currentBalance,
        }
    }

    const after = Math.max(0, before - normalizedCost)
    const updated = buildBalanceRecord({
        ...currentBalance,
        userId: normalizedUserId,
        planTier: normalizedPlanTier,
        creditsBalance: after,
        seededCredits: Math.max(toPositiveInt(currentBalance.seeded_credits, 0), normalizedSeedCredits),
        seededAt: currentBalance.seeded_at || nowIso(),
        updatedAt: nowIso(),
        storage: currentBalance.storage || (canUseSupabase() ? 'supabase' : 'memory_fallback'),
    })
    const persisted = await persistUpdatedBalance(updated)

    const result = {
        ok: true,
        charged: true,
        idempotent: false,
        credits_charged: normalizedCost,
        credits_before: before,
        credits_after: toPositiveInt(persisted.credits_balance, after),
        idempotency_key: normalizedIdempotencyKey,
        plan_tier: normalizedPlanTier,
        user_id: normalizedUserId,
        storage: persisted.storage,
        warning: persisted.warning || null,
        metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : null,
    }

    writeProcessedCharge(normalizedUserId, normalizedIdempotencyKey, result)
    return result
}
