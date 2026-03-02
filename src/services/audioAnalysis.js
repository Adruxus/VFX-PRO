import * as mm from 'music-metadata-browser'

export async function parseMetadata(file) {
    try {
        const m = await mm.parseBlob(file, { native: true })
        return {
            title: m.common.title || file.name.replace(/\.(mp3|wav)$/i, ''),
            artist: m.common.artist || 'Unknown',
            bpm: m.common.bpm || null,
            key: m.common.key || null,
            duration: m.format.duration || 0,
            sampleRate: m.format.sampleRate || 44100,
        }
    } catch (e) {
        return { title: file.name, artist: 'Unknown', duration: 0 }
    }
}

export async function analyzeEnergy(file) {
    const buf = await file.arrayBuffer()
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const ab = await ctx.decodeAudioData(buf)
    const ch = ab.getChannelData(0)
    const sr = ab.sampleRate
    const map = []
    for (let i = 0; i < ch.length; i += sr) {
        const w = ch.slice(i, i + sr)
        map.push(Math.sqrt(w.reduce((s, v) => s + v * v, 0) / w.length))
    }
    const mx = Math.max(...map)
    const norm = map.map(e => e / (mx || 1))
    const avg = norm.reduce((a, b) => a + b, 0) / norm.length
    await ctx.close()
    return { energyMap: norm, avgEnergy: avg, duration: ab.duration }
}

export function classifyMood(energy, bpm) {
    if (bpm > 140 && energy > 0.6) return 'Energetic'
    if (bpm > 120 && energy > 0.4) return 'Uplifting'
    if (bpm < 100 && energy < 0.4) return 'Chill'
    if (energy < 0.3) return 'Ambient'
    return 'Balanced'
}