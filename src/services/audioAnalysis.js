function stripExtension(name = '') {
    return String(name).replace(/\.(mp3|wav)$/i, '')
}

function parseBpmFromName(name = '') {
    const match = String(name).match(/(?:^|[\s_-])(\d{2,3})\s*bpm(?:$|[\s_-])/i)
    if (!match) return null
    const bpm = Number(match[1])
    if (!Number.isFinite(bpm)) return null
    if (bpm < 60 || bpm > 220) return null
    return bpm
}

function parseKeyFromName(name = '') {
    const match = String(name).match(/(?:^|[\s_-])([A-G](?:#|b)?m?)(?:$|[\s_-])/i)
    return match ? match[1].toUpperCase() : null
}

async function readDuration(file) {
    if (typeof window === 'undefined') return 0
    return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file)
        const audio = new Audio()
        const cleanup = () => {
            audio.removeAttribute('src')
            URL.revokeObjectURL(objectUrl)
        }

        audio.preload = 'metadata'
        audio.onloadedmetadata = () => {
            const duration = Number(audio.duration)
            cleanup()
            resolve(Number.isFinite(duration) && duration > 0 ? duration : 0)
        }
        audio.onerror = () => {
            cleanup()
            resolve(0)
        }
        audio.src = objectUrl
    })
}

export async function parseMetadata(file) {
    const duration = await readDuration(file)
    const title = stripExtension(file?.name || '')
    return {
        title,
        artist: 'Unknown',
        bpm: parseBpmFromName(file?.name || ''),
        key: parseKeyFromName(file?.name || ''),
        duration,
        sampleRate: null,
    }
}

export async function analyzeEnergy(file) {
    const buf = await file.arrayBuffer()
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    try {
        const ab = await ctx.decodeAudioData(buf)
        const ch = ab.getChannelData(0)
        const sr = ab.sampleRate
        const map = []
        for (let i = 0; i < ch.length; i += sr) {
            const w = ch.slice(i, i + sr)
            map.push(Math.sqrt(w.reduce((s, v) => s + v * v, 0) / w.length))
        }
        const mx = Math.max(...map)
        const norm = map.map((e) => e / (mx || 1))
        const avg = norm.reduce((a, b) => a + b, 0) / norm.length
        return { energyMap: norm, avgEnergy: avg, duration: ab.duration }
    } finally {
        await ctx.close()
    }
}

export function classifyMood(energy, bpm) {
    if (bpm > 140 && energy > 0.6) return 'Energetic'
    if (bpm > 120 && energy > 0.4) return 'Uplifting'
    if (bpm < 100 && energy < 0.4) return 'Chill'
    if (energy < 0.3) return 'Ambient'
    return 'Balanced'
}
