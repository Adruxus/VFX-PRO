const TEAM_WORKSPACE_STORAGE_KEY = 'vfx_pro_team_workspace'
const MAX_ORGS = 20
const MAX_MEMBERS = 200
const MAX_INVITES = 200

function normalizeText(value, maxLength = 140) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, maxLength)
}

function toPositiveInt(value, fallback = 0) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return Math.max(0, Math.floor(fallback))
    return Math.max(0, Math.floor(parsed))
}

function toPositiveNumber(value, fallback = 0) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return Math.max(0, fallback)
    return Math.max(0, parsed)
}

function nowIso() {
    return new Date().toISOString()
}

function createId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

function storageKey(userId) {
    return `${TEAM_WORKSPACE_STORAGE_KEY}:${userId || 'guest'}`
}

function readRaw(userId) {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    try {
        return JSON.parse(raw)
    } catch {
        return null
    }
}

function writeRaw(userId, payload) {
    localStorage.setItem(storageKey(userId), JSON.stringify(payload))
}

function normalizeMember(member) {
    if (!member || typeof member !== 'object') return null
    return {
        id: normalizeText(member.id || createId('member'), 120),
        email: normalizeText(member.email || '', 200).toLowerCase(),
        role: normalizeText(member.role || 'editor', 40) || 'editor',
        status: normalizeText(member.status || 'active', 40) || 'active',
        seat_type: normalizeText(member.seat_type || 'paid', 40) || 'paid',
        invited_at: normalizeText(member.invited_at || nowIso(), 80) || nowIso(),
    }
}

function normalizeInvite(invite) {
    if (!invite || typeof invite !== 'object') return null
    return {
        id: normalizeText(invite.id || createId('invite'), 120),
        email: normalizeText(invite.email || '', 200).toLowerCase(),
        role: normalizeText(invite.role || 'editor', 40) || 'editor',
        status: normalizeText(invite.status || 'pending', 40) || 'pending',
        sent_at: normalizeText(invite.sent_at || nowIso(), 80) || nowIso(),
    }
}

function normalizeOrg(org, ownerUserId) {
    if (!org || typeof org !== 'object') return null
    const owner = normalizeText(org.owner_user_id || ownerUserId || 'guest', 200) || 'guest'
    const members = Array.isArray(org.members)
        ? org.members.map((item) => normalizeMember(item)).filter(Boolean).slice(0, MAX_MEMBERS)
        : []
    const invites = Array.isArray(org.invites)
        ? org.invites.map((item) => normalizeInvite(item)).filter(Boolean).slice(0, MAX_INVITES)
        : []
    const orgId = normalizeText(org.id || createId('org'), 120)
    if (members.length === 0) {
        members.push(
            normalizeMember({
                id: createId('member'),
                email: `${owner || 'owner'}@local`,
                role: 'owner',
                status: 'active',
                seat_type: 'paid',
                invited_at: nowIso(),
            })
        )
    }
    return {
        id: orgId,
        name: normalizeText(org.name || 'Studio Team', 120) || 'Studio Team',
        owner_user_id: owner,
        seats_included: toPositiveInt(org.seats_included, 5),
        seat_price_monthly: toPositiveNumber(org.seat_price_monthly, 29),
        members,
        invites,
        created_at: normalizeText(org.created_at || nowIso(), 80) || nowIso(),
        updated_at: normalizeText(org.updated_at || nowIso(), 80) || nowIso(),
    }
}

function ensureWorkspace(userId) {
    const payload = readRaw(userId)
    const orgs = Array.isArray(payload?.orgs)
        ? payload.orgs.map((org) => normalizeOrg(org, userId)).filter(Boolean).slice(0, MAX_ORGS)
        : []

    if (orgs.length === 0) {
        const org = normalizeOrg(
            {
                id: createId('org'),
                name: 'Studio Team',
                owner_user_id: userId || 'guest',
                seats_included: 5,
                seat_price_monthly: 29,
                members: [],
                invites: [],
                created_at: nowIso(),
                updated_at: nowIso(),
            },
            userId
        )
        orgs.push(org)
    }

    const activeId = normalizeText(payload?.active_org_id || orgs[0]?.id, 120)
    const resolvedActiveId = orgs.some((org) => org.id === activeId) ? activeId : orgs[0]?.id
    const workspace = {
        orgs,
        active_org_id: resolvedActiveId,
        updated_at: nowIso(),
    }
    writeRaw(userId, workspace)
    return workspace
}

function mutateWorkspace(userId, mutate) {
    const current = ensureWorkspace(userId)
    const next = mutate({
        orgs: current.orgs.slice(),
        active_org_id: current.active_org_id,
        updated_at: nowIso(),
    })
    const orgs = Array.isArray(next?.orgs)
        ? next.orgs.map((org) => normalizeOrg(org, userId)).filter(Boolean).slice(0, MAX_ORGS)
        : current.orgs
    const activeId = normalizeText(next?.active_org_id || current.active_org_id, 120)
    const resolvedActiveId = orgs.some((org) => org.id === activeId) ? activeId : orgs[0]?.id
    const workspace = {
        orgs,
        active_org_id: resolvedActiveId,
        updated_at: nowIso(),
    }
    writeRaw(userId, workspace)
    return workspace
}

export function listTeamOrganizations(userId) {
    return ensureWorkspace(userId).orgs.slice()
}

export function getActiveTeamOrganization(userId) {
    const workspace = ensureWorkspace(userId)
    return workspace.orgs.find((org) => org.id === workspace.active_org_id) || workspace.orgs[0] || null
}

export function setActiveTeamOrganization(userId, orgId) {
    return mutateWorkspace(userId, (workspace) => ({
        ...workspace,
        active_org_id: orgId,
    }))
}

export function createTeamOrganization(userId, payload = {}) {
    const org = normalizeOrg(
        {
            id: payload.id || createId('org'),
            name: payload.name || 'Studio Team',
            owner_user_id: userId || 'guest',
            seats_included: payload.seats_included ?? 5,
            seat_price_monthly: payload.seat_price_monthly ?? 29,
            members: [],
            invites: [],
            created_at: nowIso(),
            updated_at: nowIso(),
        },
        userId
    )
    return mutateWorkspace(userId, (workspace) => ({
        ...workspace,
        orgs: [org, ...workspace.orgs].slice(0, MAX_ORGS),
        active_org_id: org.id,
    }))
}

export function inviteTeamMember(userId, orgId, payload = {}) {
    const email = normalizeText(payload.email || '', 200).toLowerCase()
    if (!email) return ensureWorkspace(userId)
    const role = normalizeText(payload.role || 'editor', 40) || 'editor'
    return mutateWorkspace(userId, (workspace) => ({
        ...workspace,
        orgs: workspace.orgs.map((org) => {
            if (org.id !== orgId) return org
            const duplicateMember = org.members.some((member) => member.email === email)
            const duplicateInvite = org.invites.some((invite) => invite.email === email && invite.status === 'pending')
            if (duplicateMember || duplicateInvite) return org
            const invite = normalizeInvite({
                id: createId('invite'),
                email,
                role,
                status: 'pending',
                sent_at: nowIso(),
            })
            return {
                ...org,
                invites: [invite, ...org.invites].slice(0, MAX_INVITES),
                updated_at: nowIso(),
            }
        }),
    }))
}

export function updateTeamSeatPlan(userId, orgId, payload = {}) {
    return mutateWorkspace(userId, (workspace) => ({
        ...workspace,
        orgs: workspace.orgs.map((org) => {
            if (org.id !== orgId) return org
            return {
                ...org,
                seats_included: toPositiveInt(payload.seats_included, org.seats_included),
                seat_price_monthly: toPositiveNumber(payload.seat_price_monthly, org.seat_price_monthly),
                updated_at: nowIso(),
            }
        }),
    }))
}

export function removeTeamMember(userId, orgId, memberId) {
    return mutateWorkspace(userId, (workspace) => ({
        ...workspace,
        orgs: workspace.orgs.map((org) => {
            if (org.id !== orgId) return org
            return {
                ...org,
                members: org.members.filter((member) => member.id !== memberId),
                updated_at: nowIso(),
            }
        }),
    }))
}

export function updateTeamMemberRole(userId, orgId, memberId, role) {
    return mutateWorkspace(userId, (workspace) => ({
        ...workspace,
        orgs: workspace.orgs.map((org) => {
            if (org.id !== orgId) return org
            return {
                ...org,
                members: org.members.map((member) => (member.id === memberId ? { ...member, role: normalizeText(role, 40) || 'editor' } : member)),
                updated_at: nowIso(),
            }
        }),
    }))
}

export function cancelTeamInvite(userId, orgId, inviteId) {
    return mutateWorkspace(userId, (workspace) => ({
        ...workspace,
        orgs: workspace.orgs.map((org) => {
            if (org.id !== orgId) return org
            return {
                ...org,
                invites: org.invites.filter((invite) => invite.id !== inviteId),
                updated_at: nowIso(),
            }
        }),
    }))
}

export function getTeamBillingSummary(org) {
    if (!org) {
        return {
            seats_included: 0,
            seats_used: 0,
            seats_overage: 0,
            seat_price_monthly: 0,
            included_monthly_usd: 0,
            overage_monthly_usd: 0,
            estimated_total_monthly_usd: 0,
        }
    }
    const seatsIncluded = toPositiveInt(org.seats_included, 0)
    const seatPrice = toPositiveNumber(org.seat_price_monthly, 0)
    const seatsUsed = Array.isArray(org.members) ? org.members.filter((member) => member.status !== 'inactive').length : 0
    const seatsOverage = Math.max(0, seatsUsed - seatsIncluded)
    const includedMonthly = seatsIncluded * seatPrice
    const overageMonthly = seatsOverage * seatPrice
    return {
        seats_included: seatsIncluded,
        seats_used: seatsUsed,
        seats_overage: seatsOverage,
        seat_price_monthly: seatPrice,
        included_monthly_usd: includedMonthly,
        overage_monthly_usd: overageMonthly,
        estimated_total_monthly_usd: includedMonthly + overageMonthly,
    }
}
