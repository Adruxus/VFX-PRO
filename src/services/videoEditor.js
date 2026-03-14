import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

const FFMPEG_CORE_VERSION = '0.12.15'
const FFMPEG_CORE_BASE = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`
const MIN_SEGMENT_SECONDS = 0.05

let ffmpegLoadPromise = null

function clamp(value, min, max, fallback = min) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return fallback
    return Math.max(min, Math.min(max, numeric))
}

function toSec(value, fallback = 0) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return Number(fallback).toFixed(3)
    return Math.max(0, numeric).toFixed(3)
}

function inferInputExtension(source) {
    if (typeof File !== 'undefined' && source instanceof File) {
        const fromName = String(source.name || '').toLowerCase().match(/\.([a-z0-9]{2,8})$/i)
        if (fromName?.[1]) return fromName[1]
        const fromType = String(source.type || '').split('/')[1]
        if (fromType) return fromType.toLowerCase()
    }
    if (typeof Blob !== 'undefined' && source instanceof Blob) {
        const fromType = String(source.type || '').split('/')[1]
        if (fromType) return fromType.toLowerCase()
    }
    if (typeof source === 'string') {
        const noQuery = source.split('?')[0].split('#')[0]
        const match = noQuery.match(/\.([a-z0-9]{2,8})$/i)
        if (match?.[1]) return match[1].toLowerCase()
    }
    return 'mp4'
}

async function execOrThrow(ffmpeg, args, contextLabel = 'ffmpeg command') {
    const code = await ffmpeg.exec(args)
    if (Number(code) !== 0) {
        throw new Error(`${contextLabel} failed with exit code ${code}`)
    }
}

async function ensureFfmpegReady(onStatus) {
    if (!ffmpegLoadPromise) {
        ffmpegLoadPromise = (async () => {
            const instance = new FFmpeg()
            const coreURL = await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, 'text/javascript')
            const wasmURL = await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm')
            const workerURL = await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.worker.js`, 'text/javascript')
            await instance.load({ coreURL, wasmURL, workerURL })
            return instance
        })()
    }
    if (typeof onStatus === 'function') onStatus('Preparing video engine...')
    return ffmpegLoadPromise
}

async function writeInputFile(ffmpeg, fileName, source) {
    const data = await fetchFile(source)
    await ffmpeg.writeFile(fileName, data)
}

async function safeDeleteFile(ffmpeg, fileName) {
    try {
        await ffmpeg.deleteFile(fileName)
    } catch {
        // ignore cleanup errors
    }
}

async function renderSegmentVideo(ffmpeg, {
    inputName,
    outputName,
    start,
    end,
    fps = 30,
}) {
    const startSec = toSec(start)
    const endSec = toSec(end)
    const safeFps = String(Math.max(1, Math.round(Number(fps) || 30)))

    try {
        await execOrThrow(
            ffmpeg,
            [
                '-ss', startSec,
                '-to', endSec,
                '-i', inputName,
                '-vf', `fps=${safeFps},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
                '-c:v', 'libx264',
                '-preset', 'veryfast',
                '-crf', '24',
                '-pix_fmt', 'yuv420p',
                '-an',
                outputName,
            ],
            'ffmpeg segment render'
        )
        return
    } catch {
        await execOrThrow(
            ffmpeg,
            [
                '-ss', startSec,
                '-to', endSec,
                '-i', inputName,
                '-vf', `fps=${safeFps},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
                '-c:v', 'mpeg4',
                '-q:v', '4',
                '-pix_fmt', 'yuv420p',
                '-an',
                outputName,
            ],
            'ffmpeg segment render fallback'
        )
    }
}

function normalizeTrimBounds({ start, end, duration }) {
    const safeDuration = clamp(duration, 0, 60 * 60 * 8, 0)
    const safeStart = clamp(start, 0, safeDuration, 0)
    const safeEnd = clamp(end, 0, safeDuration, safeDuration)
    const orderedStart = Math.min(safeStart, safeEnd)
    const orderedEnd = Math.max(safeStart, safeEnd)
    if (orderedEnd - orderedStart < MIN_SEGMENT_SECONDS) {
        throw new Error('Selected segment is too short to export.')
    }
    return { start: orderedStart, end: orderedEnd, duration: safeDuration }
}

function toVideoBlob(data) {
    return new Blob([data], { type: 'video/mp4' })
}

export async function trimVideoSegment({
    source,
    start = 0,
    end = 0,
    duration = 0,
    fps = 30,
    onStatus,
}) {
    const ffmpeg = await ensureFfmpegReady(onStatus)
    const trimmed = normalizeTrimBounds({ start, end, duration })
    const inputExt = inferInputExtension(source)
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const inputName = `trim_in_${stamp}.${inputExt}`
    const outputName = `trim_out_${stamp}.mp4`

    try {
        if (typeof onStatus === 'function') onStatus('Loading source video...')
        await writeInputFile(ffmpeg, inputName, source)
        if (typeof onStatus === 'function') onStatus('Rendering trimmed clip...')
        await renderSegmentVideo(ffmpeg, {
            inputName,
            outputName,
            start: trimmed.start,
            end: trimmed.end,
            fps,
        })
        const output = await ffmpeg.readFile(outputName)
        return toVideoBlob(output)
    } finally {
        await safeDeleteFile(ffmpeg, inputName)
        await safeDeleteFile(ffmpeg, outputName)
    }
}

export async function splitVideoAtTime({
    source,
    splitAt = 0,
    duration = 0,
    fps = 30,
    onStatus,
}) {
    const ffmpeg = await ensureFfmpegReady(onStatus)
    const safeDuration = clamp(duration, 0, 60 * 60 * 8, 0)
    const safeSplit = clamp(splitAt, 0, safeDuration, 0)
    if (safeDuration <= 0 || safeSplit <= MIN_SEGMENT_SECONDS || safeDuration - safeSplit <= MIN_SEGMENT_SECONDS) {
        throw new Error('Split point must be inside the clip (not at start or end).')
    }

    const inputExt = inferInputExtension(source)
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const inputName = `split_in_${stamp}.${inputExt}`
    const firstName = `split_first_${stamp}.mp4`
    const secondName = `split_second_${stamp}.mp4`

    try {
        if (typeof onStatus === 'function') onStatus('Loading source video...')
        await writeInputFile(ffmpeg, inputName, source)
        if (typeof onStatus === 'function') onStatus('Rendering first split segment...')
        await renderSegmentVideo(ffmpeg, {
            inputName,
            outputName: firstName,
            start: 0,
            end: safeSplit,
            fps,
        })
        if (typeof onStatus === 'function') onStatus('Rendering second split segment...')
        await renderSegmentVideo(ffmpeg, {
            inputName,
            outputName: secondName,
            start: safeSplit,
            end: safeDuration,
            fps,
        })

        const firstData = await ffmpeg.readFile(firstName)
        const secondData = await ffmpeg.readFile(secondName)
        return {
            first: toVideoBlob(firstData),
            second: toVideoBlob(secondData),
        }
    } finally {
        await safeDeleteFile(ffmpeg, inputName)
        await safeDeleteFile(ffmpeg, firstName)
        await safeDeleteFile(ffmpeg, secondName)
    }
}

export async function mergeVideoSegments({
    segments = [],
    fps = 30,
    onStatus,
}) {
    const validSegments = Array.isArray(segments)
        ? segments.filter((segment) => segment && segment.source != null)
        : []
    if (validSegments.length < 2) {
        throw new Error('Add at least two segments to merge.')
    }

    const ffmpeg = await ensureFfmpegReady(onStatus)
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const generatedFiles = []
    const concatListName = `concat_${stamp}.txt`
    const outputName = `merged_${stamp}.mp4`

    try {
        for (let index = 0; index < validSegments.length; index += 1) {
            const segment = validSegments[index]
            const inputExt = inferInputExtension(segment.source)
            const inputName = `merge_in_${stamp}_${index}.${inputExt}`
            const segmentName = `merge_segment_${stamp}_${index}.mp4`
            const segDuration = clamp(segment.duration, 0, 60 * 60 * 8, 0)
            const segStart = clamp(segment.start, 0, segDuration, 0)
            const segEndRaw = Number.isFinite(Number(segment.end)) ? Number(segment.end) : segDuration
            const segEnd = clamp(segEndRaw, 0, segDuration, segDuration)
            if (segEnd - segStart < MIN_SEGMENT_SECONDS) {
                continue
            }

            generatedFiles.push(inputName, segmentName)
            if (typeof onStatus === 'function') onStatus(`Preparing segment ${index + 1}/${validSegments.length}...`)
            await writeInputFile(ffmpeg, inputName, segment.source)
            await renderSegmentVideo(ffmpeg, {
                inputName,
                outputName: segmentName,
                start: segStart,
                end: segEnd,
                fps,
            })
        }

        const segmentFiles = generatedFiles.filter((name) => name.startsWith(`merge_segment_${stamp}_`))
        if (segmentFiles.length < 2) {
            throw new Error('Not enough valid segments to merge after preprocessing.')
        }

        const concatManifest = segmentFiles.map((name) => `file '${name}'`).join('\n')
        await ffmpeg.writeFile(concatListName, new TextEncoder().encode(concatManifest))
        generatedFiles.push(concatListName, outputName)

        if (typeof onStatus === 'function') onStatus('Merging segments...')
        await execOrThrow(
            ffmpeg,
            [
                '-f', 'concat',
                '-safe', '0',
                '-i', concatListName,
                '-c', 'copy',
                outputName,
            ],
            'ffmpeg merge'
        )

        const output = await ffmpeg.readFile(outputName)
        return toVideoBlob(output)
    } finally {
        await Promise.all(generatedFiles.map((fileName) => safeDeleteFile(ffmpeg, fileName)))
    }
}
