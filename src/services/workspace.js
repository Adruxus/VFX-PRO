const WORKSPACE_STORAGE_KEY = 'vfx_pro_workspace'
const MAX_PROJECTS = 40
const MAX_PROJECT_ASSETS = 240

function normalizeText(value, maxLength = 200) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, maxLength)
}

function nowIso() {
    return new Date().toISOString()
}

function createId(prefix = 'project') {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

function storageKey(userId) {
    return `${WORKSPACE_STORAGE_KEY}:${userId || 'guest'}`
}

function readRawWorkspace(userId) {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    try {
        return JSON.parse(raw)
    } catch {
        return null
    }
}

function writeRawWorkspace(userId, value) {
    localStorage.setItem(storageKey(userId), JSON.stringify(value))
}

function normalizeProjectAsset(asset) {
    if (!asset || typeof asset !== 'object') return null
    const sourceUrl = normalizeText(asset.source_url || asset.sourceUrl || asset.result_url || '', 4096)
    if (!sourceUrl) return null
    return {
        id: normalizeText(asset.id || createId('project_asset'), 120),
        source_url: sourceUrl,
        kind: normalizeText(asset.kind || asset.type || 'unknown', 40) || 'unknown',
        model_id: normalizeText(asset.model_id || asset.modelId || '', 200) || null,
        provider: normalizeText(asset.provider || '', 120) || null,
        created_at: normalizeText(asset.created_at || nowIso(), 80) || nowIso(),
    }
}

function normalizeProject(value) {
    if (!value || typeof value !== 'object') return null
    const id = normalizeText(value.id || createId('project'), 120)
    const createdAt = normalizeText(value.created_at || value.createdAt || nowIso(), 80) || nowIso()
    const updatedAt = normalizeText(value.updated_at || value.updatedAt || createdAt, 80) || createdAt
    const assets = Array.isArray(value.assets)
        ? value.assets.map((asset) => normalizeProjectAsset(asset)).filter(Boolean).slice(0, MAX_PROJECT_ASSETS)
        : []
    return {
        id,
        name: normalizeText(value.name || 'Untitled Project', 120) || 'Untitled Project',
        description: normalizeText(value.description || '', 320) || '',
        tags: Array.isArray(value.tags)
            ? value.tags.map((tag) => normalizeText(tag, 32).toLowerCase()).filter(Boolean).slice(0, 12)
            : [],
        generator_mode: normalizeText(value.generator_mode || value.generatorMode || 'image', 20) || 'image',
        prompt: normalizeText(value.prompt || '', 1200) || '',
        style: normalizeText(value.style || '', 160) || '',
        resolution: normalizeText(value.resolution || '', 32) || '',
        duration: Number(value.duration) > 0 ? Number(value.duration) : null,
        model_id: normalizeText(value.model_id || value.modelId || '', 200) || null,
        settings: value.settings && typeof value.settings === 'object' && !Array.isArray(value.settings)
            ? JSON.parse(JSON.stringify(value.settings))
            : {},
        assets,
        created_at: createdAt,
        updated_at: updatedAt,
    }
}

function ensureWorkspace(userId) {
    const payload = readRawWorkspace(userId)
    const projects = Array.isArray(payload?.projects)
        ? payload.projects.map((project) => normalizeProject(project)).filter(Boolean).slice(0, MAX_PROJECTS)
        : []

    if (projects.length === 0) {
        const seed = normalizeProject({
            id: createId('project'),
            name: 'Neon Session',
            description: 'Default workspace',
            generator_mode: 'image',
            created_at: nowIso(),
            updated_at: nowIso(),
        })
        projects.push(seed)
    }

    const activeId = normalizeText(payload?.active_id || payload?.activeId || projects[0].id, 120)
    const resolvedActiveId = projects.some((project) => project.id === activeId) ? activeId : projects[0].id
    const workspace = {
        projects,
        active_id: resolvedActiveId,
        updated_at: nowIso(),
    }
    writeRawWorkspace(userId, workspace)
    return workspace
}

function mutateWorkspace(userId, mutate) {
    const current = ensureWorkspace(userId)
    const next = mutate({
        projects: current.projects.slice(),
        active_id: current.active_id,
        updated_at: nowIso(),
    })
    const projects = Array.isArray(next?.projects)
        ? next.projects.map((project) => normalizeProject(project)).filter(Boolean).slice(0, MAX_PROJECTS)
        : current.projects
    const activeId = normalizeText(next?.active_id || current.active_id, 120)
    const resolvedActiveId = projects.some((project) => project.id === activeId) ? activeId : projects[0]?.id || ''
    const workspace = {
        projects,
        active_id: resolvedActiveId,
        updated_at: nowIso(),
    }
    writeRawWorkspace(userId, workspace)
    return workspace
}

export function listWorkspaceProjects(userId) {
    return ensureWorkspace(userId).projects.slice()
}

export function getActiveWorkspaceProject(userId) {
    const workspace = ensureWorkspace(userId)
    return workspace.projects.find((project) => project.id === workspace.active_id) || workspace.projects[0] || null
}

export function setActiveWorkspaceProject(userId, projectId) {
    return mutateWorkspace(userId, (workspace) => ({
        ...workspace,
        active_id: projectId,
    }))
}

export function createWorkspaceProject(userId, payload = {}) {
    const project = normalizeProject({
        id: payload.id || createId('project'),
        name: payload.name || 'Untitled Project',
        description: payload.description || '',
        tags: payload.tags || [],
        generator_mode: payload.generator_mode || payload.generatorMode || 'image',
        prompt: payload.prompt || '',
        style: payload.style || '',
        resolution: payload.resolution || '',
        duration: payload.duration || null,
        model_id: payload.model_id || payload.modelId || null,
        settings: payload.settings || {},
        created_at: nowIso(),
        updated_at: nowIso(),
    })

    return mutateWorkspace(userId, (workspace) => ({
        ...workspace,
        projects: [project, ...workspace.projects].slice(0, MAX_PROJECTS),
        active_id: project.id,
    }))
}

export function updateWorkspaceProject(userId, projectId, updates = {}) {
    return mutateWorkspace(userId, (workspace) => ({
        ...workspace,
        projects: workspace.projects.map((project) => {
            if (project.id !== projectId) return project
            return normalizeProject({
                ...project,
                ...updates,
                id: project.id,
                created_at: project.created_at,
                updated_at: nowIso(),
            })
        }),
    }))
}

export function deleteWorkspaceProject(userId, projectId) {
    return mutateWorkspace(userId, (workspace) => {
        const projects = workspace.projects.filter((project) => project.id !== projectId)
        return {
            ...workspace,
            projects: projects.length > 0 ? projects : workspace.projects.slice(0, 1),
            active_id: projects[0]?.id || workspace.active_id,
        }
    })
}

export function saveWorkspaceSnapshot(userId, projectId, snapshot = {}) {
    return updateWorkspaceProject(userId, projectId, {
        ...snapshot,
        updated_at: nowIso(),
    })
}

export function addProjectAsset(userId, projectId, asset) {
    const normalizedAsset = normalizeProjectAsset(asset)
    if (!normalizedAsset) return ensureWorkspace(userId)
    return mutateWorkspace(userId, (workspace) => ({
        ...workspace,
        projects: workspace.projects.map((project) => {
            if (project.id !== projectId) return project
            const deduped = (project.assets || []).filter((item) => item.id !== normalizedAsset.id && item.source_url !== normalizedAsset.source_url)
            return normalizeProject({
                ...project,
                assets: [normalizedAsset, ...deduped].slice(0, MAX_PROJECT_ASSETS),
                updated_at: nowIso(),
            })
        }),
    }))
}

export function importPresetToWorkspace(userId, preset) {
    const normalized = normalizeText(preset?.name || preset?.title || 'Preset Project', 120) || 'Preset Project'
    return createWorkspaceProject(userId, {
        name: normalized,
        description: normalizeText(preset?.description || 'Imported from marketplace preset.', 320),
        tags: Array.isArray(preset?.tags) ? preset.tags : [],
        generator_mode: preset?.generator_mode || preset?.generatorMode || 'video',
        prompt: preset?.prompt || '',
        style: preset?.style || '',
        resolution: preset?.resolution || '1920x1080',
        duration: Number(preset?.duration) || null,
        model_id: preset?.model_id || preset?.modelId || null,
        settings: preset?.settings || {},
    })
}
