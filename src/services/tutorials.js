const COMMUNITY_TUTORIALS_STORAGE_KEY = 'vfx_pro_community_tutorials'
const MAX_COMMUNITY_TUTORIALS = 400
const MAX_EMBEDDED_VIDEO_BYTES = 2_200_000

function readStorage() {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(COMMUNITY_TUTORIALS_STORAGE_KEY)
    if (!raw) return []
    try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

function writeStorage(entries) {
    if (typeof localStorage === 'undefined') return
    const normalized = Array.isArray(entries) ? entries.slice(0, MAX_COMMUNITY_TUTORIALS) : []
    localStorage.setItem(COMMUNITY_TUTORIALS_STORAGE_KEY, JSON.stringify(normalized))
}

function normalizeText(value, maxLength = 800) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, maxLength)
}

function createId(prefix = 'tutorial') {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

function toSafeSourceUrl(value) {
    const source = String(value || '').trim()
    if (!source) return ''
    if (/^data:video\//i.test(source)) return source
    if (!/^https?:\/\//i.test(source)) return ''
    return source.slice(0, 4096)
}

function normalizeTutorial(payload = {}) {
    const title = normalizeText(payload.title, 120)
    const sourceUrl = toSafeSourceUrl(payload.video_url || payload.videoUrl)
    if (!title || !sourceUrl) return null
    const createdAt = payload.created_at || payload.createdAt || new Date().toISOString()
    return {
        id: normalizeText(payload.id, 120) || createId('tutorial'),
        title,
        description: normalizeText(payload.description, 600),
        category: normalizeText(payload.category, 80) || 'general',
        difficulty: normalizeText(payload.difficulty, 40) || 'intermediate',
        duration: normalizeText(payload.duration, 40) || 'Unknown',
        video_url: sourceUrl,
        owner_user_id: normalizeText(payload.owner_user_id || payload.ownerUserId, 120) || 'guest',
        owner_name: normalizeText(payload.owner_name || payload.ownerName, 120) || 'Community Member',
        likes: Math.max(0, Number(payload.likes || 0)),
        created_at: createdAt,
        updated_at: payload.updated_at || payload.updatedAt || createdAt,
        tags: Array.isArray(payload.tags)
            ? payload.tags
                .map((item) => normalizeText(item, 30))
                .filter(Boolean)
                .slice(0, 8)
            : [],
    }
}

export async function getCommunityTutorials() {
    return readStorage()
        .map((item) => normalizeTutorial(item))
        .filter(Boolean)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export async function saveCommunityTutorial(payload = {}) {
    const normalized = normalizeTutorial(payload)
    if (!normalized) {
        return { ok: false, error: 'Title and video source are required.' }
    }
    const current = await getCommunityTutorials()
    const deduped = current.filter((item) => item.id !== normalized.id)
    const next = [normalized, ...deduped].slice(0, MAX_COMMUNITY_TUTORIALS)
    writeStorage(next)
    return { ok: true, tutorial: normalized, tutorials: next }
}

export async function deleteCommunityTutorial({
    tutorialId,
    requesterUserId,
    isAdmin = false,
}) {
    const id = normalizeText(tutorialId, 120)
    if (!id) return { ok: false, error: 'Tutorial id is required.' }
    const current = await getCommunityTutorials()
    const target = current.find((item) => item.id === id)
    if (!target) return { ok: false, error: 'Tutorial not found.' }
    const ownerId = normalizeText(target.owner_user_id, 120) || 'guest'
    const requesterId = normalizeText(requesterUserId, 120) || 'guest'
    if (!isAdmin && ownerId !== requesterId) {
        return { ok: false, error: 'Only the uploader or admin can delete this tutorial.' }
    }
    const next = current.filter((item) => item.id !== id)
    writeStorage(next)
    return { ok: true, tutorials: next }
}

export async function tutorialFileToDataUrl(file) {
    if (typeof File === 'undefined' || !(file instanceof File)) {
        return { ok: false, error: 'Select a valid video file.' }
    }
    if (!String(file.type || '').startsWith('video/')) {
        return { ok: false, error: 'Upload must be a video file.' }
    }
    if (file.size > MAX_EMBEDDED_VIDEO_BYTES) {
        return {
            ok: false,
            error: `Video is too large for in-browser community storage. Keep file under ${Math.round(MAX_EMBEDDED_VIDEO_BYTES / 1000000)} MB or use an external video URL.`,
        }
    }

    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            if (typeof reader.result === 'string' && reader.result.startsWith('data:video/')) {
                resolve(reader.result)
                return
            }
            reject(new Error('Could not read uploaded video.'))
        }
        reader.onerror = () => reject(new Error('Could not read uploaded video.'))
        reader.readAsDataURL(file)
    })
    return { ok: true, dataUrl }
}

export function resolveTutorialPlaybackSource(videoUrl) {
    const url = String(videoUrl || '').trim()
    if (!url) return null
    if (/^data:video\//i.test(url)) return { type: 'video', src: url }
    const ytWatch = url.match(/^https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([^&]+)/i)
    if (ytWatch?.[1]) return { type: 'embed', src: `https://www.youtube.com/embed/${ytWatch[1]}` }
    const ytShort = url.match(/^https?:\/\/youtu\.be\/([^?]+)/i)
    if (ytShort?.[1]) return { type: 'embed', src: `https://www.youtube.com/embed/${ytShort[1]}` }
    const vimeo = url.match(/^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/i)
    if (vimeo?.[1]) return { type: 'embed', src: `https://player.vimeo.com/video/${vimeo[1]}` }
    if (/^https?:\/\/.+\.(mp4|mov|webm|ogg)(\?|#|$)/i.test(url)) return { type: 'video', src: url }
    if (/^https?:\/\//i.test(url)) return { type: 'link', src: url }
    return null
}
