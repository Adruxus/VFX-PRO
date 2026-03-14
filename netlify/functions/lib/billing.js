const MAX_LEDGER_ENTRIES = 200

const billingState = globalThis.__VJ_STUDIO_BILLING__ || {
    ledgerEntries: new Map(),
}

if (!globalThis.__VJ_STUDIO_BILLING__) {
    globalThis.__VJ_STUDIO_BILLING__ = billingState
}

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ACCESS_TOKEN || ''
const SUPABASE_TABLE = process.env.SUPABASE_BILLING_LEDGER_TABLE || 'billing_ledger_entries'

function toNumeric(value) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function normalizeText(value, maxLength = 200) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, maxLength)
}

function normalizeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function nowIso() {
    return new Date().toISOString()
}

function canUseSupabase() {
    return Boolean(SUPABASE_URL && SUPABASE_KEY)
}

function toEntryRecord(payload) {
    return {
        user_id: normalizeText(payload?.user_id || 'guest', 200) || 'guest',
        timestamp: normalizeText(payload?.timestamp || nowIso(), 80) || nowIso(),
        operation: normalizeText(payload?.operation || 'generation', 120) || 'generation',
        model_id: normalizeText(payload?.model_id || '', 200) || null,
        provider: normalizeText(payload?.provider || 'unknown', 120) || 'unknown',
        credits: toNumeric(payload?.credits),
        billed_usd: toNumeric(payload?.billed_usd),
        provider_reserve_usd: toNumeric(payload?.provider_reserve_usd),
        platform_profit_usd: toNumeric(payload?.platform_profit_usd),
        charge_multiplier: payload?.charge_multiplier == null ? null : toNumeric(payload.charge_multiplier),
        configured_provider_cost_usd:
            payload?.configured_provider_cost_usd == null ? null : toNumeric(payload.configured_provider_cost_usd),
        model_tier: normalizeText(payload?.model_tier || '', 80) || null,
        provider_settlement_bucket: normalizeText(payload?.provider_settlement_bucket || '', 120) || null,
        platform_settlement_bucket: normalizeText(payload?.platform_settlement_bucket || '', 120) || null,
        metadata: normalizeObject(payload?.metadata),
    }
}

function fromRow(row) {
    if (!row || typeof row !== 'object') return null
    return {
        user_id: normalizeText(row.user_id || 'guest', 200) || 'guest',
        timestamp: normalizeText(row.timestamp || nowIso(), 80) || nowIso(),
        operation: normalizeText(row.operation || 'generation', 120) || 'generation',
        model_id: normalizeText(row.model_id || '', 200) || null,
        provider: normalizeText(row.provider || 'unknown', 120) || 'unknown',
        credits: toNumeric(row.credits),
        billed_usd: toNumeric(row.billed_usd),
        provider_reserve_usd: toNumeric(row.provider_reserve_usd),
        platform_profit_usd: toNumeric(row.platform_profit_usd),
        charge_multiplier: row.charge_multiplier == null ? null : toNumeric(row.charge_multiplier),
        configured_provider_cost_usd:
            row.configured_provider_cost_usd == null ? null : toNumeric(row.configured_provider_cost_usd),
        model_tier: normalizeText(row.model_tier || '', 80) || null,
        provider_settlement_bucket: normalizeText(row.provider_settlement_bucket || '', 120) || null,
        platform_settlement_bucket: normalizeText(row.platform_settlement_bucket || '', 120) || null,
        metadata: normalizeObject(row.metadata),
    }
}

function toApiEntry(row) {
    const parsed = fromRow(row)
    if (!parsed) return null
    return {
        timestamp: parsed.timestamp,
        operation: parsed.operation,
        modelId: parsed.model_id,
        provider: parsed.provider,
        credits: parsed.credits,
        billedUsd: parsed.billed_usd,
        providerReserveUsd: parsed.provider_reserve_usd,
        platformProfitUsd: parsed.platform_profit_usd,
        chargeMultiplier: parsed.charge_multiplier,
        configuredProviderCostUsd: parsed.configured_provider_cost_usd,
        modelTier: parsed.model_tier,
        providerSettlementBucket: parsed.provider_settlement_bucket,
        platformSettlementBucket: parsed.platform_settlement_bucket,
        metadata: parsed.metadata,
    }
}

function summarizeLedger(userId, entries, storage, warning = null) {
    const providerReserveByProvider = { replicate: 0, huggingface: 0, unknown: 0 }
    let totalCreditsCharged = 0
    let totalBilledUsd = 0
    let totalProviderReserveUsd = 0
    let totalPlatformProfitUsd = 0

    const normalizedEntries = []
    for (const row of entries) {
        const entry = toApiEntry(row)
        if (!entry) continue
        normalizedEntries.push(entry)

        totalCreditsCharged += toNumeric(entry.credits)
        totalBilledUsd += toNumeric(entry.billedUsd)
        totalProviderReserveUsd += toNumeric(entry.providerReserveUsd)
        totalPlatformProfitUsd += toNumeric(entry.platformProfitUsd)

        const provider = normalizeText(entry.provider || 'unknown', 120) || 'unknown'
        if (!Object.prototype.hasOwnProperty.call(providerReserveByProvider, provider)) {
            providerReserveByProvider[provider] = 0
        }
        providerReserveByProvider[provider] += toNumeric(entry.providerReserveUsd)
    }

    return {
        user_id: userId,
        storage,
        warning,
        totalCreditsCharged,
        totalBilledUsd,
        totalProviderReserveUsd,
        totalPlatformProfitUsd,
        platformProfitAccountUsd: totalPlatformProfitUsd,
        providerReserveByProvider,
        entries: normalizedEntries.slice(0, MAX_LEDGER_ENTRIES),
    }
}

async function supabaseRequest(path, { method = 'GET', payload = null } = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
        method,
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
        },
        body: payload == null ? undefined : JSON.stringify(payload),
    })

    if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`Supabase ledger request failed (${response.status}) ${detail}`.trim())
    }

    const isJson = (response.headers.get('content-type') || '').includes('application/json')
    if (!isJson) return null
    return response.json()
}

async function readSupabaseEntries(userId) {
    const query = new URLSearchParams({
        select:
            'id,user_id,timestamp,operation,model_id,provider,credits,billed_usd,provider_reserve_usd,platform_profit_usd,charge_multiplier,configured_provider_cost_usd,model_tier,provider_settlement_bucket,platform_settlement_bucket,metadata',
        user_id: `eq.${userId}`,
        order: 'timestamp.desc',
        limit: String(MAX_LEDGER_ENTRIES),
    })
    const rows = await supabaseRequest(`/${SUPABASE_TABLE}?${query.toString()}`, { method: 'GET' })
    return Array.isArray(rows) ? rows : []
}

async function insertSupabaseEntry(entry) {
    const rows = await supabaseRequest(`/${SUPABASE_TABLE}`, {
        method: 'POST',
        payload: [entry],
    })
    if (!Array.isArray(rows) || rows.length === 0) return entry
    return rows[0]
}

function getMemoryEntries(userId) {
    const rows = billingState.ledgerEntries.get(userId)
    return Array.isArray(rows) ? rows : []
}

function pushMemoryEntry(entry) {
    const current = getMemoryEntries(entry.user_id)
    const next = [entry, ...current].slice(0, MAX_LEDGER_ENTRIES)
    billingState.ledgerEntries.set(entry.user_id, next)
    return next
}

export async function appendBillingLedgerEntry(payload) {
    const entry = toEntryRecord(payload)

    if (canUseSupabase()) {
        try {
            await insertSupabaseEntry(entry)
            const rows = await readSupabaseEntries(entry.user_id)
            return summarizeLedger(entry.user_id, rows, 'supabase')
        } catch (error) {
            const rows = pushMemoryEntry(entry)
            return summarizeLedger(
                entry.user_id,
                rows,
                'memory_fallback',
                error instanceof Error ? error.message : 'Supabase write failed'
            )
        }
    }

    const rows = pushMemoryEntry(entry)
    return summarizeLedger(entry.user_id, rows, 'memory_fallback', 'Supabase ledger is not configured')
}

export async function getBillingLedgerForUser(userId) {
    const normalizedUserId = normalizeText(userId || 'guest', 200) || 'guest'

    if (canUseSupabase()) {
        try {
            const rows = await readSupabaseEntries(normalizedUserId)
            return summarizeLedger(normalizedUserId, rows, 'supabase')
        } catch (error) {
            const rows = getMemoryEntries(normalizedUserId)
            return summarizeLedger(
                normalizedUserId,
                rows,
                'memory_fallback',
                error instanceof Error ? error.message : 'Supabase read failed'
            )
        }
    }

    const rows = getMemoryEntries(normalizedUserId)
    return summarizeLedger(normalizedUserId, rows, 'memory_fallback', 'Supabase ledger is not configured')
}
