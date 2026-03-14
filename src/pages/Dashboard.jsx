import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useUser } from '@clerk/clerk-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getBillingLedger, getCredits, getGenerationLibrary, saveLibraryAsset, deleteLibraryAsset, updateLibraryAsset } from '@/services/backend'
import { PLAN_LABELS, useAccessControl } from '@/services/accessControl'
import { mergeVideoSegments, splitVideoAtTime, trimVideoSegment } from '@/services/videoEditor'
import {
    Sparkle,
    DownloadSimple,
    TrendUp,
    Clock,
    CreditCard,
    Eye,
    VideoCamera,
    Cube,
    MagnifyingGlass,
    UploadSimple,
    Play,
    Stop,
    WarningCircle,
} from '@/components/icons/futureIcons'

const FILTER_OPTIONS = [
    { value: 'all', label: 'All' },
    { value: 'image', label: 'Images' },
    { value: 'video', label: 'Videos' },
    { value: '3d', label: '3D' },
]

const EDITOR_DEFAULTS = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0,
    blur: 0,
    rotation: 0,
    zoom: 100,
    flipX: false,
    flipY: false,
}
const VIDEO_EDITOR_DEFAULTS = {
    fps: 30,
    trimStart: 0,
    trimEnd: 0,
    splitPoint: 0,
    freezeSeconds: 1,
}

function clamp(value, min, max, fallback = min) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return fallback
    return Math.max(min, Math.min(max, numeric))
}

function formatTimeLabel(value) {
    const seconds = Math.max(0, Number(value) || 0)
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`
    }
    return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`
}

function frameFromTime(timeSeconds, fps) {
    const safeFps = clamp(fps, 1, 240, 30)
    return Math.max(0, Math.floor((Math.max(0, Number(timeSeconds) || 0) * safeFps) + 1e-6))
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            if (typeof reader.result === 'string' && reader.result.startsWith('data:')) {
                resolve(reader.result)
                return
            }
            reject(new Error('Unable to serialize edited media.'))
        }
        reader.onerror = () => reject(new Error('Unable to serialize edited media.'))
        reader.readAsDataURL(blob)
    })
}

function preferredRecorderMime() {
    if (typeof MediaRecorder === 'undefined') return ''
    const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    for (const candidate of candidates) {
        if (MediaRecorder.isTypeSupported(candidate)) return candidate
    }
    return ''
}

async function createFreezeFrameClip(video, { seconds = 1, fps = 30 } = {}) {
    if (!video || typeof document === 'undefined') {
        throw new Error('Video playback context is not available.')
    }
    if (typeof MediaRecorder === 'undefined') {
        throw new Error('This browser does not support in-app freeze frame clip capture.')
    }
    const width = Math.max(2, Math.floor(video.videoWidth || 1280))
    const height = Math.max(2, Math.floor(video.videoHeight || 720))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
        throw new Error('Could not initialize frame capture canvas.')
    }
    context.drawImage(video, 0, 0, width, height)

    const frameRate = clamp(fps, 1, 60, 30)
    const stream = canvas.captureStream(frameRate)
    const mimeType = preferredRecorderMime()
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    const chunks = []

    const recordingPromise = new Promise((resolve, reject) => {
        recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) chunks.push(event.data)
        }
        recorder.onerror = () => reject(new Error('Freeze frame clip recording failed.'))
        recorder.onstop = () => {
            const outputType = recorder.mimeType || mimeType || 'video/webm'
            resolve(new Blob(chunks, { type: outputType }))
        }
    })

    const intervalMs = Math.max(15, Math.round(1000 / frameRate))
    const totalFrames = Math.max(1, Math.round(clamp(seconds, 0.2, 6, 1) * frameRate))
    let renderedFrames = 0
    let timer = null

    recorder.start()
    timer = setInterval(() => {
        context.drawImage(video, 0, 0, width, height)
        renderedFrames += 1
        if (renderedFrames >= totalFrames) {
            clearInterval(timer)
            timer = null
            recorder.stop()
        }
    }, intervalMs)

    try {
        return await recordingPromise
    } finally {
        if (timer) clearInterval(timer)
        stream.getTracks().forEach((track) => track.stop())
    }
}

function toProviderProxyUrl(url) {
    const value = String(url || '').trim()
    if (!value) return null
    if (/^data:/i.test(value)) return value
    if (/^https?:\/\//i.test(value)) return `/api/v1/provider-file?url=${encodeURIComponent(value)}`
    return value
}

function classifyKind(asset) {
    return String(asset?.kind || asset?.type || 'unknown').toLowerCase()
}

function formatDate(value) {
    const parsed = new Date(value || '')
    if (Number.isNaN(parsed.getTime())) return 'Unknown'
    return parsed.toLocaleString()
}

function normalizeTagsInput(value) {
    return String(value || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 12)
}

function assetSourceUrl(asset) {
    return String(asset?.source_url || '')
}

function buildEngineReadyScorecard(asset) {
    if (!asset) return []
    const kind = classifyKind(asset)
    const source = assetSourceUrl(asset).toLowerCase()
    const tags = Array.isArray(asset.tags) ? asset.tags : []
    const checks = [
        {
            id: 'format',
            label: 'Engine-compatible format',
            pass: kind === 'image' || kind === 'video' || kind === '3d',
            note: kind === '3d' ? 'Use GLB/FBX/OBJ for runtime import.' : 'Accepted for dashboard workflows.',
        },
        {
            id: 'licensing',
            label: 'License metadata attached',
            pass: Boolean(asset?.metadata?.license || tags.includes('licensed') || tags.includes('commercial')),
            note: 'Tag asset with `licensed` or include license metadata before final export.',
        },
        {
            id: 'naming',
            label: 'Production naming',
            pass: /^[a-z0-9 _-]{4,120}$/i.test(String(asset.title || '')),
            note: 'Names should be searchable and filesystem-safe.',
        },
    ]

    if (kind === '3d') {
        checks.push({
            id: 'mesh-format',
            label: '3D mesh format',
            pass: /\.(glb|gltf|fbx|obj|stl|ply)(\?|#|$)/i.test(source),
            note: 'Prefer GLB for web preview and FBX for DCC interchange.',
        })
    }
    if (kind === 'video') {
        checks.push({
            id: 'video-codec',
            label: 'Video container',
            pass: /\.(mp4|mov|webm)(\?|#|$)/i.test(source) || source.startsWith('data:video/'),
            note: 'MP4/MOV recommended for engine ingest and NLE workflows.',
        })
    }
    if (kind === 'image') {
        checks.push({
            id: 'image-format',
            label: 'Image format',
            pass: /\.(png|jpg|jpeg|webp)(\?|#|$)/i.test(source) || source.startsWith('data:image/'),
            note: 'PNG/WebP recommended for texture and overlay pipelines.',
        })
    }

    return checks
}

export default function Dashboard() {
    const { user } = useUser()
    const { effectivePlan, isAdmin, ageVerified, restrictedConsentAccepted } = useAccessControl()
    const [credits, setCredits] = useState(0)
    const [ledger, setLedger] = useState(null)
    const [library, setLibrary] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [typeFilter, setTypeFilter] = useState('all')
    const [collectionFilter, setCollectionFilter] = useState('all')
    const [favoritesOnly, setFavoritesOnly] = useState(false)
    const [tagFilter, setTagFilter] = useState('')
    const [assetTagInput, setAssetTagInput] = useState('')
    const [selectedAssetId, setSelectedAssetId] = useState('')
    const [inspectorTab, setInspectorTab] = useState('color')
    const [editor, setEditor] = useState(EDITOR_DEFAULTS)
    const [saving, setSaving] = useState(false)
    const [editorError, setEditorError] = useState('')
    const [videoEditor, setVideoEditor] = useState(VIDEO_EDITOR_DEFAULTS)
    const [videoCurrentTime, setVideoCurrentTime] = useState(0)
    const [videoDuration, setVideoDuration] = useState(0)
    const [videoMergeQueue, setVideoMergeQueue] = useState([])
    const [videoEditorBusy, setVideoEditorBusy] = useState(false)
    const [videoEditorStatus, setVideoEditorStatus] = useState('')
    const [videoPreviewOverride, setVideoPreviewOverride] = useState('')
    const canvasRef = useRef(null)
    const videoRef = useRef(null)
    const videoPreviewObjectUrlRef = useRef('')

    const refresh = useCallback(async () => {
        if (!user?.id) {
            setCredits(100)
            setLedger(null)
            setLibrary([])
            setSelectedAssetId('')
            setLoading(false)
            return
        }
        setLoading(true)
        const [creditSnapshot, ledgerSnapshot, librarySnapshot] = await Promise.all([
            getCredits(user.id, effectivePlan),
            getBillingLedger(user.id),
            getGenerationLibrary(user.id),
        ])
        const items = Array.isArray(librarySnapshot) ? librarySnapshot : []
        setCredits(Number(creditSnapshot?.credits) || 0)
        setLedger(ledgerSnapshot || null)
        setLibrary(items)
        setSelectedAssetId((previous) => (previous && items.some((item) => item.id === previous) ? previous : items[0]?.id || ''))
        setLoading(false)
    }, [effectivePlan, user?.id])

    useEffect(() => {
        void refresh().catch((error) => {
            toast.error(error instanceof Error ? error.message : 'Failed to load dashboard.')
            setLoading(false)
        })
    }, [refresh])

    const collectionOptions = useMemo(() => {
        const names = new Set(['all'])
        for (const asset of library) {
            const collection = String(asset?.collection || asset?.metadata?.collection || '').trim().toLowerCase()
            if (collection) names.add(collection)
        }
        return Array.from(names)
    }, [library])

    const filteredLibrary = useMemo(() => {
        const query = search.trim().toLowerCase()
        const tagQuery = tagFilter.trim().toLowerCase()
        return library.filter((asset) => {
            const kind = classifyKind(asset)
            const assetCollection = String(asset?.collection || asset?.metadata?.collection || 'default').toLowerCase()
            const tags = Array.isArray(asset?.tags) ? asset.tags : []
            const favorite = Boolean(asset?.favorite)

            if (typeFilter !== 'all' && typeFilter !== kind) return false
            if (collectionFilter !== 'all' && assetCollection !== collectionFilter) return false
            if (favoritesOnly && !favorite) return false
            if (tagQuery && !tags.some((tag) => String(tag).toLowerCase().includes(tagQuery))) return false
            if (!query) return true
            const text = `${asset.title || ''} ${asset.model_id || ''} ${asset.provider || ''} ${tags.join(' ')}`.toLowerCase()
            return text.includes(query)
        })
    }, [collectionFilter, favoritesOnly, library, search, tagFilter, typeFilter])

    useEffect(() => {
        if (!filteredLibrary.length) {
            setSelectedAssetId('')
            return
        }
        if (!filteredLibrary.some((asset) => asset.id === selectedAssetId)) {
            setSelectedAssetId(filteredLibrary[0].id)
        }
    }, [filteredLibrary, selectedAssetId])

    const selectedAsset = useMemo(
        () => filteredLibrary.find((asset) => asset.id === selectedAssetId) || null,
        [filteredLibrary, selectedAssetId]
    )
    const selectedAssetScorecard = useMemo(() => buildEngineReadyScorecard(selectedAsset), [selectedAsset])
    const selectedKind = classifyKind(selectedAsset)
    const selectedPreviewUrl = useMemo(() => toProviderProxyUrl(selectedAsset?.source_url), [selectedAsset?.source_url])
    const selectedVideoUrl = useMemo(() => {
        if (selectedKind !== 'video') return selectedPreviewUrl
        return videoPreviewOverride || selectedPreviewUrl
    }, [selectedKind, selectedPreviewUrl, videoPreviewOverride])
    const canEditImage = selectedKind === 'image' && Boolean(selectedPreviewUrl)
    const canEditVideo = selectedKind === 'video' && Boolean(selectedVideoUrl)
    const editorFps = clamp(videoEditor.fps, 1, 120, 30)
    const currentFrame = frameFromTime(videoCurrentTime, editorFps)
    const totalFrames = Math.max(1, frameFromTime(videoDuration, editorFps))

    useEffect(() => {
        const tags = Array.isArray(selectedAsset?.tags) ? selectedAsset.tags : []
        setAssetTagInput(tags.join(', '))
    }, [selectedAsset?.id, selectedAsset?.tags])

    useEffect(() => {
        if (videoPreviewObjectUrlRef.current) {
            URL.revokeObjectURL(videoPreviewObjectUrlRef.current)
            videoPreviewObjectUrlRef.current = ''
        }
        setEditor(EDITOR_DEFAULTS)
        setEditorError('')
        setVideoEditor(VIDEO_EDITOR_DEFAULTS)
        setVideoCurrentTime(0)
        setVideoDuration(0)
        setVideoMergeQueue([])
        setVideoEditorStatus('')
        setVideoPreviewOverride('')
    }, [selectedAssetId])

    useEffect(() => {
        return () => {
            if (videoPreviewObjectUrlRef.current) {
                URL.revokeObjectURL(videoPreviewObjectUrlRef.current)
                videoPreviewObjectUrlRef.current = ''
            }
        }
    }, [])

    useEffect(() => {
        if (!canEditImage || !canvasRef.current || !selectedPreviewUrl) return
        let canceled = false
        const image = new Image()
        image.crossOrigin = 'anonymous'
        image.referrerPolicy = 'no-referrer'
        image.src = selectedPreviewUrl
        image.onload = () => {
            if (canceled || !canvasRef.current) return
            const canvas = canvasRef.current
            const context = canvas.getContext('2d')
            if (!context) return
            const maxWidth = 1280
            const maxHeight = 720
            const fit = Math.min(maxWidth / image.width, maxHeight / image.height, 1)
            const scale = fit * (editor.zoom / 100)
            const width = Math.max(2, Math.round(image.width * scale))
            const height = Math.max(2, Math.round(image.height * scale))
            canvas.width = maxWidth
            canvas.height = maxHeight
            context.clearRect(0, 0, maxWidth, maxHeight)
            context.save()
            context.translate(maxWidth / 2, maxHeight / 2)
            context.rotate((editor.rotation * Math.PI) / 180)
            context.scale(editor.flipX ? -1 : 1, editor.flipY ? -1 : 1)
            context.filter =
                `brightness(${editor.brightness}%) contrast(${editor.contrast}%) ` +
                `saturate(${editor.saturation}%) hue-rotate(${editor.hue}deg) blur(${editor.blur}px)`
            context.drawImage(image, -width / 2, -height / 2, width, height)
            context.restore()
            setEditorError('')
        }
        image.onerror = () => {
            if (!canceled) setEditorError('Unable to edit this image because source loading failed.')
        }
        return () => {
            canceled = true
        }
    }, [canEditImage, editor, selectedPreviewUrl])

    useEffect(() => {
        if (selectedKind === 'video' && inspectorTab !== 'video') {
            setInspectorTab('video')
            return
        }
        if (selectedKind === 'image' && inspectorTab === 'video') {
            setInspectorTab('color')
        }
    }, [inspectorTab, selectedKind])

    const monthlyCount = useMemo(() => {
        const now = new Date()
        return library.filter((asset) => {
            const date = new Date(asset.created_at || '')
            return !Number.isNaN(date.getTime()) && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
        }).length
    }, [library])

    const stats = [
        { label: 'Credits Remaining', value: credits, icon: Sparkle, detail: `${PLAN_LABELS[effectivePlan]} plan` },
        { label: 'Library Assets', value: library.length, icon: DownloadSimple, detail: 'Saved generation files' },
        { label: 'This Month', value: monthlyCount, icon: TrendUp, detail: 'Current profile output' },
        { label: 'Credits Charged', value: Number(ledger?.totalCreditsCharged || 0), icon: Clock, detail: 'Billing ledger total' },
    ]

    const removeAsset = async (assetId) => {
        if (!user?.id) return
        const result = await deleteLibraryAsset(user.id, assetId)
        if (!result.ok) {
            toast.error(result.error || 'Could not delete asset.')
            return
        }
        setLibrary(Array.isArray(result.assets) ? result.assets : [])
    }

    const updateSelectedAssetMetadata = async (updates = {}) => {
        if (!user?.id || !selectedAsset?.id) return
        const result = await updateLibraryAsset(user.id, selectedAsset.id, updates)
        if (!result.ok) {
            toast.error(result.error || 'Could not update asset metadata.')
            return
        }
        const items = Array.isArray(result.assets) ? result.assets : []
        setLibrary(items)
        if (result.asset?.id) setSelectedAssetId(result.asset.id)
    }

    const saveEditedImage = async () => {
        if (!user?.id || !selectedAsset || !canvasRef.current || !canEditImage) return
        setSaving(true)
        try {
            const dataUrl = canvasRef.current.toDataURL('image/png', 0.92)
            const result = await saveLibraryAsset(user.id, {
                title: `${selectedAsset.title || 'Asset'} (Edited)`,
                source_url: dataUrl,
                kind: 'image',
                type: 'image',
                model_id: selectedAsset.model_id || null,
                provider: selectedAsset.provider || null,
                metadata: { source_asset_id: selectedAsset.id, editor, workflow: 'dashboard_editor' },
            })
            if (!result.ok) {
                toast.error(result.error || 'Failed to save edited asset.')
                return
            }
            const nextItems = Array.isArray(result.assets) ? result.assets : []
            setLibrary(nextItems)
            if (result.asset?.id) setSelectedAssetId(result.asset.id)
            toast.success('Edited image saved to your library.')
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to save edit.')
        } finally {
            setSaving(false)
        }
    }

    const setVideoEditorKey = (key, value) => {
        setVideoEditor((previous) => ({ ...previous, [key]: value }))
    }

    const setTemporaryVideoPreview = (blob) => {
        if (!(blob instanceof Blob)) return
        if (videoPreviewObjectUrlRef.current) {
            URL.revokeObjectURL(videoPreviewObjectUrlRef.current)
            videoPreviewObjectUrlRef.current = ''
        }
        const objectUrl = URL.createObjectURL(blob)
        videoPreviewObjectUrlRef.current = objectUrl
        setVideoPreviewOverride(objectUrl)
    }

    const saveEditedVideoBlob = async (blob, title, metadata = {}) => {
        if (!user?.id || !selectedAsset) {
            throw new Error('Sign in before saving edited videos.')
        }
        const dataUrl = await blobToDataUrl(blob)
        const result = await saveLibraryAsset(user.id, {
            title,
            source_url: dataUrl,
            kind: 'video',
            type: 'video',
            model_id: selectedAsset.model_id || null,
            provider: selectedAsset.provider || 'editor',
            metadata: {
                ...metadata,
                workflow: 'dashboard_video_editor',
                source_asset_id: selectedAsset.id,
            },
        })
        if (!result.ok) {
            setTemporaryVideoPreview(blob)
            throw new Error(result.error || 'Edited video could not be saved to local library.')
        }
        const nextItems = Array.isArray(result.assets) ? result.assets : []
        setLibrary(nextItems)
        if (result.asset?.id) setSelectedAssetId(result.asset.id)
        return result.asset
    }

    const handleVideoLoadedMetadata = () => {
        const element = videoRef.current
        if (!element) return
        const nextDuration = Number(element.duration)
        if (!Number.isFinite(nextDuration) || nextDuration <= 0) return
        setVideoDuration(nextDuration)
        setVideoCurrentTime(0)
        setVideoEditor((previous) => ({
            ...previous,
            trimStart: 0,
            trimEnd: nextDuration,
            splitPoint: Math.min(nextDuration - 0.05, nextDuration / 2),
        }))
    }

    const handleVideoTimeUpdate = () => {
        const element = videoRef.current
        if (!element) return
        setVideoCurrentTime(Number(element.currentTime) || 0)
    }

    const seekVideoTo = (nextTime) => {
        const element = videoRef.current
        if (!element || !Number.isFinite(videoDuration) || videoDuration <= 0) return
        const target = clamp(nextTime, 0, videoDuration, 0)
        element.currentTime = target
        setVideoCurrentTime(target)
    }

    const stepVideoFrame = (direction = 1) => {
        const fps = clamp(videoEditor.fps, 1, 120, 30)
        const nextFrame = currentFrame + (direction >= 0 ? 1 : -1)
        seekVideoTo(nextFrame / fps)
    }

    const seekVideoToFrame = (nextFrame) => {
        if (videoDuration <= 0) return
        const fps = clamp(videoEditor.fps, 1, 120, 30)
        const frameLimit = Math.max(0, frameFromTime(videoDuration, fps))
        const targetFrame = clamp(nextFrame, 0, frameLimit, 0)
        seekVideoTo(targetFrame / fps)
    }

    const applyTrimFromPlayhead = (bound) => {
        const safeTime = clamp(videoCurrentTime, 0, videoDuration || 0, 0)
        setVideoEditor((previous) => {
            if (bound === 'start') {
                const nextStart = Math.min(safeTime, Math.max(0, previous.trimEnd - 0.05))
                return { ...previous, trimStart: nextStart, splitPoint: Math.max(nextStart, previous.splitPoint) }
            }
            const nextEnd = Math.max(safeTime, Math.min(videoDuration || safeTime, previous.trimStart + 0.05))
            return { ...previous, trimEnd: nextEnd, splitPoint: Math.min(nextEnd, previous.splitPoint) }
        })
    }

    const updateTrimRange = (range) => {
        if (!Array.isArray(range) || range.length < 2) return
        const start = clamp(range[0], 0, videoDuration || 0, 0)
        const end = clamp(range[1], 0, videoDuration || 0, videoDuration || 0)
        const orderedStart = Math.min(start, end)
        const orderedEnd = Math.max(start, end)
        setVideoEditor((previous) => ({
            ...previous,
            trimStart: orderedStart,
            trimEnd: orderedEnd,
            splitPoint: clamp(previous.splitPoint, orderedStart, orderedEnd, orderedStart),
        }))
    }

    const extractCurrentFrameToLibrary = async () => {
        const element = videoRef.current
        if (!element || !selectedAsset || !user?.id) return
        try {
            const canvas = document.createElement('canvas')
            canvas.width = Math.max(2, Math.floor(element.videoWidth || 1280))
            canvas.height = Math.max(2, Math.floor(element.videoHeight || 720))
            const context = canvas.getContext('2d')
            if (!context) throw new Error('Frame extraction canvas failed to initialize.')
            context.drawImage(element, 0, 0, canvas.width, canvas.height)
            const frameDataUrl = canvas.toDataURL('image/png', 0.95)
            const result = await saveLibraryAsset(user.id, {
                title: `${selectedAsset.title || 'Video'} frame ${currentFrame}`,
                source_url: frameDataUrl,
                kind: 'image',
                type: 'image',
                model_id: selectedAsset.model_id || null,
                provider: selectedAsset.provider || null,
                metadata: {
                    workflow: 'dashboard_video_editor_extract_frame',
                    source_asset_id: selectedAsset.id,
                    source_time: videoCurrentTime,
                },
            })
            if (!result.ok) {
                toast.error(result.error || 'Could not save frame image.')
                return
            }
            setLibrary(Array.isArray(result.assets) ? result.assets : [])
            if (result.asset?.id) setSelectedAssetId(result.asset.id)
            toast.success('Current frame saved to library.')
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Frame extraction failed.')
        }
    }

    const addTrimSegmentToQueue = () => {
        if (!selectedAsset || !selectedVideoUrl || videoDuration <= 0) return
        const start = clamp(videoEditor.trimStart, 0, videoDuration, 0)
        const end = clamp(videoEditor.trimEnd, 0, videoDuration, videoDuration)
        if (end - start < 0.05) {
            toast.error('Trim segment is too short to queue.')
            return
        }
        setVideoMergeQueue((previous) => [
            ...previous,
            {
                id: `segment_${Math.random().toString(36).slice(2, 9)}`,
                label: `${selectedAsset.title || 'Clip'} [${formatTimeLabel(start)} - ${formatTimeLabel(end)}]`,
                source: selectedVideoUrl,
                start,
                end,
                duration: videoDuration,
            },
        ])
        toast.success('Trim segment added to merge queue.')
    }

    const addFreezeFrameToQueue = async () => {
        const element = videoRef.current
        if (!element || !selectedAsset) return
        setVideoEditorBusy(true)
        setVideoEditorStatus('Capturing freeze frame clip...')
        try {
            const fps = clamp(videoEditor.fps, 1, 60, 30)
            const seconds = clamp(videoEditor.freezeSeconds, 0.2, 6, 1)
            const freezeClip = await createFreezeFrameClip(element, { seconds, fps })
            setVideoMergeQueue((previous) => [
                ...previous,
                {
                    id: `freeze_${Math.random().toString(36).slice(2, 9)}`,
                    label: `Freeze frame ${seconds.toFixed(1)}s @ ${formatTimeLabel(videoCurrentTime)}`,
                    source: freezeClip,
                    start: 0,
                    end: seconds,
                    duration: seconds,
                },
            ])
            toast.success('Freeze frame clip added to merge queue.')
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not add freeze frame clip.')
        } finally {
            setVideoEditorBusy(false)
            setVideoEditorStatus('')
        }
    }

    const insertFreezeFrameAtPlayhead = async () => {
        const element = videoRef.current
        if (!element || !selectedAsset || !selectedVideoUrl || videoDuration <= 0) return
        setVideoEditorBusy(true)
        setVideoEditorStatus('Inserting freeze frame at playhead...')
        try {
            const fps = clamp(videoEditor.fps, 1, 60, 30)
            const seconds = clamp(videoEditor.freezeSeconds, 0.2, 6, 1)
            const atTime = clamp(videoCurrentTime, 0, videoDuration, 0)
            const freezeClip = await createFreezeFrameClip(element, { seconds, fps })
            const segments = []
            if (atTime > 0.05) {
                segments.push({
                    source: selectedVideoUrl,
                    start: 0,
                    end: atTime,
                    duration: videoDuration,
                })
            }
            segments.push({
                source: freezeClip,
                start: 0,
                end: seconds,
                duration: seconds,
            })
            if (videoDuration - atTime > 0.05) {
                segments.push({
                    source: selectedVideoUrl,
                    start: atTime,
                    end: videoDuration,
                    duration: videoDuration,
                })
            }
            const output = await mergeVideoSegments({
                segments,
                fps,
                onStatus: (status) => setVideoEditorStatus(status),
            })
            await saveEditedVideoBlob(
                output,
                `${selectedAsset.title || 'Video'} (Freeze Insert)`,
                { operation: 'insert_freeze', insert_time: atTime, freeze_seconds: seconds, fps }
            )
            toast.success('Freeze frame inserted and saved to library.')
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Freeze frame insertion failed.')
        } finally {
            setVideoEditorBusy(false)
            setVideoEditorStatus('')
        }
    }

    const removeQueuedSegment = (segmentId) => {
        setVideoMergeQueue((previous) => previous.filter((item) => item.id !== segmentId))
    }

    const trimSelectedVideo = async () => {
        if (!selectedAsset || !selectedVideoUrl || videoDuration <= 0) return
        setVideoEditorBusy(true)
        try {
            const fps = clamp(videoEditor.fps, 1, 120, 30)
            const start = clamp(videoEditor.trimStart, 0, videoDuration, 0)
            const end = clamp(videoEditor.trimEnd, 0, videoDuration, videoDuration)
            const outputBlob = await trimVideoSegment({
                source: selectedVideoUrl,
                start,
                end,
                duration: videoDuration,
                fps,
                onStatus: (status) => setVideoEditorStatus(status),
            })
            await saveEditedVideoBlob(
                outputBlob,
                `${selectedAsset.title || 'Video'} (Trimmed)`,
                { operation: 'trim', trim_start: start, trim_end: end, fps }
            )
            toast.success('Trimmed video saved to library.')
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Video trim failed.')
        } finally {
            setVideoEditorBusy(false)
            setVideoEditorStatus('')
        }
    }

    const splitSelectedVideo = async () => {
        if (!selectedAsset || !selectedVideoUrl || videoDuration <= 0) return
        setVideoEditorBusy(true)
        try {
            const fps = clamp(videoEditor.fps, 1, 120, 30)
            const splitAt = clamp(videoEditor.splitPoint, 0, videoDuration, videoDuration / 2)
            const output = await splitVideoAtTime({
                source: selectedVideoUrl,
                splitAt,
                duration: videoDuration,
                fps,
                onStatus: (status) => setVideoEditorStatus(status),
            })
            await saveEditedVideoBlob(
                output.first,
                `${selectedAsset.title || 'Video'} (Part A)`,
                { operation: 'split', part: 'a', split_at: splitAt, fps }
            )
            await saveEditedVideoBlob(
                output.second,
                `${selectedAsset.title || 'Video'} (Part B)`,
                { operation: 'split', part: 'b', split_at: splitAt, fps }
            )
            toast.success('Split segments saved to library.')
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Video split failed.')
        } finally {
            setVideoEditorBusy(false)
            setVideoEditorStatus('')
        }
    }

    const cutTrimSelection = async () => {
        if (!selectedAsset || !selectedVideoUrl || videoDuration <= 0) return
        const trimStart = clamp(videoEditor.trimStart, 0, videoDuration, 0)
        const trimEnd = clamp(videoEditor.trimEnd, 0, videoDuration, videoDuration)
        const segments = []
        if (trimStart > 0.05) {
            segments.push({
                source: selectedVideoUrl,
                start: 0,
                end: trimStart,
                duration: videoDuration,
            })
        }
        if (videoDuration - trimEnd > 0.05) {
            segments.push({
                source: selectedVideoUrl,
                start: trimEnd,
                end: videoDuration,
                duration: videoDuration,
            })
        }
        if (segments.length < 2) {
            toast.error('Cut selection leaves fewer than two valid segments. Use trim instead.')
            return
        }

        setVideoEditorBusy(true)
        try {
            const fps = clamp(videoEditor.fps, 1, 120, 30)
            const merged = await mergeVideoSegments({
                segments,
                fps,
                onStatus: (status) => setVideoEditorStatus(status),
            })
            await saveEditedVideoBlob(
                merged,
                `${selectedAsset.title || 'Video'} (Cut)`,
                { operation: 'cut', removed_start: trimStart, removed_end: trimEnd, fps }
            )
            toast.success('Cut video saved to library.')
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Video cut failed.')
        } finally {
            setVideoEditorBusy(false)
            setVideoEditorStatus('')
        }
    }

    const mergeQueuedSegments = async () => {
        if (!selectedAsset || videoMergeQueue.length < 2) {
            toast.error('Add at least two segments to merge.')
            return
        }
        setVideoEditorBusy(true)
        try {
            const fps = clamp(videoEditor.fps, 1, 120, 30)
            const merged = await mergeVideoSegments({
                segments: videoMergeQueue,
                fps,
                onStatus: (status) => setVideoEditorStatus(status),
            })
            await saveEditedVideoBlob(
                merged,
                `${selectedAsset.title || 'Video'} (Merged)`,
                { operation: 'merge', segment_count: videoMergeQueue.length, fps }
            )
            setVideoMergeQueue([])
            toast.success('Merged video saved to library.')
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Video merge failed.')
        } finally {
            setVideoEditorBusy(false)
            setVideoEditorStatus('')
        }
    }

    const setEditorKey = (key, value) => setEditor((previous) => ({ ...previous, [key]: value }))

    return (
        <>
            <Helmet><title>Dashboard - VJ Studio Pro</title></Helmet>
            <div className='space-y-6'>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                    <div>
                        <h1 className='text-3xl font-bold text-cyan-100'>Creator Dashboard</h1>
                        <p className='text-sm text-slate-300 mt-1'>OpenCut-style layout: media bin, stage, inspector, timeline.</p>
                    </div>
                    <div className='flex items-center gap-2'>
                        <Badge variant='outline' className='border-cyan-400/35 text-cyan-100'>
                            {isAdmin ? 'Admin Studio' : PLAN_LABELS[effectivePlan]}
                        </Badge>
                        <Badge variant={ageVerified && restrictedConsentAccepted ? 'success' : 'outline'}>
                            {ageVerified && restrictedConsentAccepted ? 'Compliance Verified' : 'Compliance Pending'}
                        </Badge>
                        <Button variant='outline' onClick={refresh} disabled={loading}>
                            <UploadSimple className='w-4 h-4 mr-2' />Refresh
                        </Button>
                    </div>
                </div>

                <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
                    {stats.map((item) => (
                        <Card key={item.label} className='bg-[#081326]/80 border-cyan-400/20'>
                            <CardHeader className='pb-2 flex flex-row items-center justify-between'>
                                <CardTitle className='text-sm text-cyan-100/80'>{item.label}</CardTitle>
                                <item.icon className='w-4 h-4 text-cyan-300' />
                            </CardHeader>
                            <CardContent>
                                <div className='text-2xl font-bold text-white'>{item.value}</div>
                                <p className='text-xs text-slate-400 mt-1'>{item.detail}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <div className='grid gap-4 xl:grid-cols-12'>
                    <Card className='xl:col-span-3 bg-[#081326]/80 border-cyan-400/20'>
                        <CardHeader className='pb-2'>
                            <CardTitle className='text-cyan-100'>Media Bin</CardTitle>
                            <CardDescription className='text-slate-400'>{user?.fullName || 'Guest profile'}</CardDescription>
                        </CardHeader>
                        <CardContent className='space-y-3'>
                            <div className='relative'>
                                <MagnifyingGlass className='w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2' />
                                <Input
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder='Search assets'
                                    className='pl-9 bg-[#071225] border-cyan-400/20'
                                />
                            </div>
                            <div className='flex flex-wrap gap-2'>
                                {FILTER_OPTIONS.map((option) => (
                                    <Button
                                        key={option.value}
                                        size='sm'
                                        variant={typeFilter === option.value ? 'default' : 'outline'}
                                        onClick={() => setTypeFilter(option.value)}
                                    >
                                        {option.label}
                                    </Button>
                                ))}
                            </div>
                            <div className='grid gap-2'>
                                <Select value={collectionFilter} onValueChange={setCollectionFilter}>
                                    <SelectTrigger className='bg-[#071225] border-cyan-400/20'>
                                        <SelectValue placeholder='Collection' />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {collectionOptions.map((collection) => (
                                            <SelectItem key={collection} value={collection}>
                                                {collection === 'all' ? 'All Collections' : collection}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Input
                                    value={tagFilter}
                                    onChange={(event) => setTagFilter(event.target.value)}
                                    placeholder='Filter by tag'
                                    className='bg-[#071225] border-cyan-400/20'
                                />
                                <Button size='sm' variant={favoritesOnly ? 'default' : 'outline'} onClick={() => setFavoritesOnly((prev) => !prev)}>
                                    {favoritesOnly ? 'Showing Favorites' : 'Favorites Only'}
                                </Button>
                            </div>
                            <div className='max-h-[460px] overflow-y-auto space-y-2 pr-1'>
                                {!loading && filteredLibrary.length === 0 && <p className='text-sm text-slate-400'>No assets yet.</p>}
                                {filteredLibrary.map((asset) => (
                                    <button
                                        key={asset.id}
                                        type='button'
                                        onClick={() => setSelectedAssetId(asset.id)}
                                        className={`w-full text-left rounded-lg border px-3 py-2 ${
                                            selectedAssetId === asset.id
                                                ? 'border-cyan-400/55 bg-cyan-500/10'
                                                : 'border-cyan-400/20 bg-[#071225] hover:border-cyan-400/40'
                                        }`}
                                    >
                                        <p className='text-sm text-white line-clamp-1'>{asset.title || 'Generated Asset'}</p>
                                        <p className='text-xs text-slate-400 line-clamp-1'>{asset.model_id || asset.provider || 'unknown model'}</p>
                                        <div className='mt-1 flex flex-wrap gap-1'>
                                            {asset.favorite && <Badge variant='outline' className='text-[10px] border-amber-400/40 text-amber-200'>Favorite</Badge>}
                                            {Array.isArray(asset.tags) && asset.tags.slice(0, 2).map((tag) => (
                                                <Badge key={`${asset.id}-${tag}`} variant='outline' className='text-[10px]'>
                                                    #{tag}
                                                </Badge>
                                            ))}
                                        </div>
                                        <p className='text-[11px] text-slate-500'>{formatDate(asset.created_at)}</p>
                                    </button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className='xl:col-span-6 bg-[#081326]/80 border-cyan-400/20'>
                        <CardHeader className='pb-2'>
                            <CardTitle className='text-cyan-100'>Stage</CardTitle>
                            <CardDescription className='text-slate-400'>Preview and edit selected media.</CardDescription>
                        </CardHeader>
                        <CardContent className='space-y-3'>
                            {!selectedAsset && <div className='h-[420px] grid place-items-center text-slate-400 rounded-lg border border-dashed border-cyan-400/25'>Select an asset.</div>}
                            {selectedAsset && (
                                <>
                                    <div className='rounded-lg border border-cyan-400/25 bg-[#050c19] p-3 min-h-[420px]'>
                                        <div className='flex items-center justify-between mb-3'>
                                            <div className='flex items-center gap-2'>
                                                <Badge variant='outline'>{selectedKind}</Badge>
                                                <Badge variant='secondary' className='bg-cyan-500/10 text-cyan-100 border border-cyan-400/20'>
                                                    {selectedAsset.provider || 'provider'}
                                                </Badge>
                                                <Badge variant='outline' className='border-cyan-400/25 text-cyan-200'>
                                                    {selectedAsset.collection || 'default'}
                                                </Badge>
                                            </div>
                                            <Button size='sm' variant='outline' onClick={() => removeAsset(selectedAsset.id)}>Remove</Button>
                                        </div>

                                        {selectedKind === 'image' && <canvas ref={canvasRef} className='w-full aspect-video rounded border border-cyan-400/20 bg-black/40' />}
                                        {selectedKind === 'video' && (
                                            <div className='space-y-3'>
                                                <video
                                                    ref={videoRef}
                                                    src={selectedVideoUrl || ''}
                                                    controls
                                                    onLoadedMetadata={handleVideoLoadedMetadata}
                                                    onTimeUpdate={handleVideoTimeUpdate}
                                                    className='w-full aspect-video rounded border border-cyan-400/20 bg-black/50 object-contain'
                                                />
                                                {videoDuration > 0 && (
                                                    <div className='rounded border border-cyan-500/20 bg-[#081225] p-2.5'>
                                                        <div className='flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300'>
                                                            <div className='flex items-center gap-3'>
                                                                <span>Time {formatTimeLabel(videoCurrentTime)} / {formatTimeLabel(videoDuration)}</span>
                                                                <span>Frame {currentFrame} / {Math.max(totalFrames - 1, 0)}</span>
                                                            </div>
                                                            <div className='flex items-center gap-1'>
                                                                <Button size='sm' variant='outline' onClick={() => stepVideoFrame(-1)}>
                                                                    Prev Frame
                                                                </Button>
                                                                <Button size='sm' variant='outline' onClick={() => stepVideoFrame(1)}>
                                                                    Next Frame
                                                                </Button>
                                                            </div>
                                                        </div>
                                                        <div className='mt-2'>
                                                            <Slider
                                                                value={[videoCurrentTime]}
                                                                min={0}
                                                                max={videoDuration}
                                                                step={1 / editorFps}
                                                                onValueChange={(value) => seekVideoTo(value[0])}
                                                            />
                                                        </div>
                                                        <div className='mt-2 flex items-center gap-2'>
                                                            <Label className='text-[11px] text-cyan-200 whitespace-nowrap'>Jump to frame</Label>
                                                            <Input
                                                                type='number'
                                                                min={0}
                                                                max={Math.max(totalFrames - 1, 0)}
                                                                value={currentFrame}
                                                                onChange={(event) => seekVideoToFrame(event.target.value)}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {selectedKind === '3d' && (
                                            <div className='w-full aspect-video rounded border border-cyan-400/20 bg-black/50 grid place-items-center text-center'>
                                                <div>
                                                    <Cube className='w-8 h-8 text-cyan-300 mx-auto mb-2' />
                                                    <p className='text-sm text-cyan-100'>3D asset</p>
                                                    <p className='text-xs text-slate-400 mt-1'>Use Engine page for interactive model preview.</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className='rounded-lg border border-cyan-400/20 bg-[#050f20] p-3'>
                                        <p className='text-xs uppercase tracking-wide text-cyan-300 mb-2'>Timeline</p>
                                        <div className='flex gap-2 overflow-x-auto'>
                                            {filteredLibrary.map((asset) => (
                                                <button
                                                    key={`timeline-${asset.id}`}
                                                    type='button'
                                                    onClick={() => setSelectedAssetId(asset.id)}
                                                    className={`min-w-[140px] rounded border px-2 py-1 text-left ${
                                                        selectedAssetId === asset.id ? 'border-cyan-400/60 bg-cyan-500/10' : 'border-cyan-400/20 bg-[#071225]'
                                                    }`}
                                                >
                                                    <p className='text-xs text-white line-clamp-1'>{asset.title || 'Asset'}</p>
                                                    <p className='text-[10px] text-slate-400 line-clamp-1'>{asset.model_id || asset.provider || 'generated'}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>

                    <Card className='xl:col-span-3 bg-[#081326]/80 border-cyan-400/20'>
                        <CardHeader className='pb-2'>
                            <CardTitle className='text-cyan-100'>Inspector</CardTitle>
                            <CardDescription className='text-slate-400'>Image tools and frame-accurate video editing controls.</CardDescription>
                        </CardHeader>
                        <CardContent className='space-y-3'>
                            <div className='flex gap-2'>
                                {selectedKind === 'image' && (
                                    <>
                                        <Button size='sm' variant={inspectorTab === 'color' ? 'default' : 'outline'} onClick={() => setInspectorTab('color')}>
                                            <Eye className='w-4 h-4 mr-1' />Color
                                        </Button>
                                        <Button size='sm' variant={inspectorTab === 'transform' ? 'default' : 'outline'} onClick={() => setInspectorTab('transform')}>
                                            <VideoCamera className='w-4 h-4 mr-1' />Transform
                                        </Button>
                                    </>
                                )}
                                {selectedKind === 'video' && (
                                    <Button size='sm' variant='default' onClick={() => setInspectorTab('video')}>
                                        Video Editor
                                    </Button>
                                )}
                            </div>

                            {selectedKind === 'image' ? (
                                canEditImage ? (
                                    <>
                                        {inspectorTab === 'color' && (
                                            <>
                                                <div><p className='text-xs text-cyan-200 mb-1'>Brightness</p><Slider value={[editor.brightness]} min={20} max={220} step={1} onValueChange={(v) => setEditorKey('brightness', v[0])} /></div>
                                                <div><p className='text-xs text-cyan-200 mb-1'>Contrast</p><Slider value={[editor.contrast]} min={20} max={220} step={1} onValueChange={(v) => setEditorKey('contrast', v[0])} /></div>
                                                <div><p className='text-xs text-cyan-200 mb-1'>Saturation</p><Slider value={[editor.saturation]} min={0} max={260} step={1} onValueChange={(v) => setEditorKey('saturation', v[0])} /></div>
                                                <div><p className='text-xs text-cyan-200 mb-1'>Hue</p><Slider value={[editor.hue]} min={-180} max={180} step={1} onValueChange={(v) => setEditorKey('hue', v[0])} /></div>
                                                <div><p className='text-xs text-cyan-200 mb-1'>Blur</p><Slider value={[editor.blur]} min={0} max={12} step={0.1} onValueChange={(v) => setEditorKey('blur', v[0])} /></div>
                                            </>
                                        )}
                                        {inspectorTab === 'transform' && (
                                            <>
                                                <div><p className='text-xs text-cyan-200 mb-1'>Rotation</p><Slider value={[editor.rotation]} min={-180} max={180} step={1} onValueChange={(v) => setEditorKey('rotation', v[0])} /></div>
                                                <div><p className='text-xs text-cyan-200 mb-1'>Zoom</p><Slider value={[editor.zoom]} min={40} max={180} step={1} onValueChange={(v) => setEditorKey('zoom', v[0])} /></div>
                                                <div className='grid grid-cols-2 gap-2'>
                                                    <Button size='sm' variant='outline' onClick={() => setEditor((prev) => ({ ...prev, flipX: !prev.flipX }))}>Flip X</Button>
                                                    <Button size='sm' variant='outline' onClick={() => setEditor((prev) => ({ ...prev, flipY: !prev.flipY }))}>Flip Y</Button>
                                                </div>
                                            </>
                                        )}
                                        {editorError && <p className='text-xs text-red-300'>{editorError}</p>}
                                        <div className='grid grid-cols-2 gap-2'>
                                            <Button variant='outline' onClick={() => setEditor(EDITOR_DEFAULTS)}>Reset</Button>
                                            <Button onClick={saveEditedImage} disabled={saving}>{saving ? 'Saving...' : 'Save Edit'}</Button>
                                        </div>
                                    </>
                                ) : (
                                    <p className='text-sm text-slate-400'>Select an image asset to unlock editing tools.</p>
                                )
                            ) : selectedKind === 'video' ? (
                                <>
                                    {!canEditVideo && <p className='text-sm text-slate-400'>Select a playable video asset to edit.</p>}
                                    {canEditVideo && (
                                        <div className='space-y-3'>
                                            <div className='rounded-md border border-cyan-500/20 bg-[#071225] p-2.5 text-xs text-slate-300'>
                                                <div className='flex flex-wrap items-center justify-between gap-2'>
                                                    <span>Current: {formatTimeLabel(videoCurrentTime)}</span>
                                                    <span>Frame: {currentFrame} / {Math.max(totalFrames - 1, 0)}</span>
                                                </div>
                                                <div className='mt-2'>
                                                    <Label className='text-[11px] text-cyan-200'>Editor FPS</Label>
                                                    <Input
                                                        type='number'
                                                        min={1}
                                                        max={120}
                                                        value={videoEditor.fps}
                                                        onChange={(event) => setVideoEditorKey('fps', clamp(event.target.value, 1, 120, 30))}
                                                    />
                                                </div>
                                            </div>

                                            <div className='grid grid-cols-2 gap-2'>
                                                <Button size='sm' variant='outline' onClick={() => seekVideoTo(videoEditor.trimStart)}>Go Trim Start</Button>
                                                <Button size='sm' variant='outline' onClick={() => seekVideoTo(videoEditor.trimEnd)}>Go Trim End</Button>
                                                <Button size='sm' variant='outline' onClick={() => stepVideoFrame(-1)}>Prev Frame</Button>
                                                <Button size='sm' variant='outline' onClick={() => stepVideoFrame(1)}>Next Frame</Button>
                                                <Button
                                                    size='sm'
                                                    variant='outline'
                                                    onClick={() => videoRef.current?.play?.()}
                                                    disabled={videoEditorBusy}
                                                >
                                                    <Play className='w-4 h-4 mr-1' />Play
                                                </Button>
                                                <Button
                                                    size='sm'
                                                    variant='outline'
                                                    onClick={() => videoRef.current?.pause?.()}
                                                    disabled={videoEditorBusy}
                                                >
                                                    <Stop className='w-4 h-4 mr-1' />Pause
                                                </Button>
                                            </div>

                                            <div className='rounded-md border border-cyan-500/20 bg-[#071225] p-2.5'>
                                                <p className='text-xs text-cyan-200 mb-1'>Trim Range</p>
                                                <Slider
                                                    value={[videoEditor.trimStart, videoEditor.trimEnd]}
                                                    min={0}
                                                    max={Math.max(videoDuration, 0.01)}
                                                    step={1 / clamp(videoEditor.fps, 1, 120, 30)}
                                                    onValueChange={updateTrimRange}
                                                />
                                                <div className='mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300'>
                                                    <span>Start {formatTimeLabel(videoEditor.trimStart)}</span>
                                                    <span>End {formatTimeLabel(videoEditor.trimEnd)}</span>
                                                </div>
                                                <div className='mt-2 grid grid-cols-2 gap-2'>
                                                    <Button size='sm' variant='outline' onClick={() => applyTrimFromPlayhead('start')}>Set Start from Playhead</Button>
                                                    <Button size='sm' variant='outline' onClick={() => applyTrimFromPlayhead('end')}>Set End from Playhead</Button>
                                                </div>
                                            </div>

                                            <div className='rounded-md border border-cyan-500/20 bg-[#071225] p-2.5'>
                                                <p className='text-xs text-cyan-200 mb-1'>Split Point</p>
                                                <Slider
                                                    value={[videoEditor.splitPoint]}
                                                    min={0}
                                                    max={Math.max(videoDuration, 0.01)}
                                                    step={1 / clamp(videoEditor.fps, 1, 120, 30)}
                                                    onValueChange={(value) => setVideoEditorKey('splitPoint', value[0])}
                                                />
                                                <p className='mt-2 text-[11px] text-slate-300'>Split at {formatTimeLabel(videoEditor.splitPoint)}</p>
                                            </div>

                                            <div className='rounded-md border border-cyan-500/20 bg-[#071225] p-2.5'>
                                                <div className='grid grid-cols-2 gap-2'>
                                                    <Button size='sm' variant='outline' onClick={extractCurrentFrameToLibrary} disabled={videoEditorBusy}>
                                                        Save Current Frame
                                                    </Button>
                                                    <Button size='sm' variant='outline' onClick={addTrimSegmentToQueue} disabled={videoEditorBusy}>
                                                        Add Trim to Queue
                                                    </Button>
                                                </div>
                                                <div className='mt-2 flex items-center gap-2'>
                                                    <Input
                                                        type='number'
                                                        min={0.2}
                                                        max={6}
                                                        step={0.1}
                                                        value={videoEditor.freezeSeconds}
                                                        onChange={(event) => setVideoEditorKey('freezeSeconds', clamp(event.target.value, 0.2, 6, 1))}
                                                    />
                                                    <Button size='sm' variant='outline' onClick={addFreezeFrameToQueue} disabled={videoEditorBusy}>
                                                        Add Freeze Frame
                                                    </Button>
                                                </div>
                                                <Button className='w-full mt-2' size='sm' variant='outline' onClick={insertFreezeFrameAtPlayhead} disabled={videoEditorBusy}>
                                                    Insert Freeze at Playhead
                                                </Button>
                                            </div>

                                            <div className='grid grid-cols-2 gap-2'>
                                                <Button onClick={trimSelectedVideo} disabled={videoEditorBusy}>Trim</Button>
                                                <Button variant='outline' onClick={cutTrimSelection} disabled={videoEditorBusy}>Cut Selection</Button>
                                                <Button variant='outline' onClick={splitSelectedVideo} disabled={videoEditorBusy}>Split</Button>
                                                <Button onClick={mergeQueuedSegments} disabled={videoEditorBusy || videoMergeQueue.length < 2}>Merge Queue</Button>
                                            </div>

                                            <div className='rounded-md border border-cyan-500/20 bg-[#071225] p-2.5'>
                                                <p className='text-xs text-cyan-200 mb-1'>Merge Queue ({videoMergeQueue.length})</p>
                                                {videoMergeQueue.length === 0 && <p className='text-[11px] text-slate-400'>No queued segments yet.</p>}
                                                <div className='space-y-1 max-h-28 overflow-y-auto'>
                                                    {videoMergeQueue.map((segment) => (
                                                        <div key={segment.id} className='flex items-center justify-between gap-2 rounded border border-cyan-500/15 px-2 py-1 text-[11px] text-slate-200'>
                                                            <span className='line-clamp-1'>{segment.label}</span>
                                                            <Button size='sm' variant='outline' onClick={() => removeQueuedSegment(segment.id)}>Remove</Button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {videoEditorStatus && <p className='text-[11px] text-cyan-200'>{videoEditorStatus}</p>}
                                            <div className='rounded-md border border-amber-400/25 bg-amber-500/10 p-2 text-[11px] text-amber-100 flex items-start gap-1.5'>
                                                <WarningCircle className='w-4 h-4 mt-0.5 shrink-0' />
                                                <span>In-browser editor prioritizes reliability. Exported edited clips are currently video-only (no audio track).</span>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <p className='text-sm text-slate-400'>Select an image or video asset to unlock editing tools.</p>
                            )}

                            {selectedAsset && (
                                <div className='rounded-md border border-cyan-500/20 bg-[#071225] p-2.5 space-y-2'>
                                    <p className='text-xs text-cyan-200 font-medium'>Library Metadata</p>
                                    <div className='grid grid-cols-2 gap-2'>
                                        <Button
                                            size='sm'
                                            variant={selectedAsset.favorite ? 'default' : 'outline'}
                                            onClick={() => updateSelectedAssetMetadata({ favorite: !selectedAsset.favorite })}
                                        >
                                            {selectedAsset.favorite ? 'Favorited' : 'Mark Favorite'}
                                        </Button>
                                        <Select
                                            value={String(selectedAsset.collection || 'default')}
                                            onValueChange={(value) => updateSelectedAssetMetadata({ collection: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {collectionOptions.filter((value) => value !== 'all').map((collection) => (
                                                    <SelectItem key={collection} value={collection}>
                                                        {collection}
                                                    </SelectItem>
                                                ))}
                                                <SelectItem value='default'>default</SelectItem>
                                                <SelectItem value='shots'>shots</SelectItem>
                                                <SelectItem value='references'>references</SelectItem>
                                                <SelectItem value='engine-ready'>engine-ready</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className='space-y-1'>
                                        <Label className='text-[11px] text-cyan-200'>Tags (comma-separated)</Label>
                                        <div className='flex gap-2'>
                                            <Input
                                                value={assetTagInput}
                                                onChange={(event) => setAssetTagInput(event.target.value)}
                                                placeholder='licensed, hero, export'
                                            />
                                            <Button size='sm' variant='outline' onClick={() => updateSelectedAssetMetadata({ tags: normalizeTagsInput(assetTagInput) })}>
                                                Save
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {selectedAsset && (
                                <div className='rounded-md border border-cyan-500/20 bg-[#071225] p-2.5 space-y-2'>
                                    <p className='text-xs text-cyan-200 font-medium'>Engine-Ready Scorecard</p>
                                    <div className='space-y-1.5'>
                                        {selectedAssetScorecard.map((check) => (
                                            <div key={check.id} className='rounded border border-cyan-500/15 px-2 py-1.5 text-[11px]'>
                                                <div className='flex items-center justify-between gap-2'>
                                                    <span className='text-slate-200'>{check.label}</span>
                                                    <Badge variant='outline' className={check.pass ? 'border-emerald-400/35 text-emerald-200' : 'border-amber-400/35 text-amber-200'}>
                                                        {check.pass ? 'Pass' : 'Needs Work'}
                                                    </Badge>
                                                </div>
                                                <p className='text-slate-400 mt-1'>{check.note}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <Card className='bg-[#071225] border-cyan-400/20'>
                                <CardHeader className='pb-2'><CardTitle className='text-sm text-cyan-100'>Subscription</CardTitle></CardHeader>
                                <CardContent className='space-y-2'>
                                    <div className='flex items-center justify-between text-sm'><span className='text-slate-300'>Plan</span><span className='text-white'>{PLAN_LABELS[effectivePlan]}</span></div>
                                    <div className='flex items-center justify-between text-sm'><span className='text-slate-300'>Credits</span><span className='text-white'>{credits}</span></div>
                                    <Button className='w-full bg-gradient-to-r from-cyan-500 to-fuchsia-500'><CreditCard className='w-4 h-4 mr-2' />Manage Subscription</Button>
                                </CardContent>
                            </Card>
                        </CardContent>
                    </Card>
                </div>

                <Card className='bg-[#081326]/80 border-cyan-400/20'>
                    <CardHeader className='pb-2'>
                        <CardTitle className='text-cyan-100'>Generated Library Grid</CardTitle>
                        <CardDescription className='text-slate-400'>Profile-synced file shelf for quick preview and re-selection.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!loading && filteredLibrary.length === 0 && <p className='text-sm text-slate-400'>No generated assets in your library yet.</p>}
                        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
                            {filteredLibrary.map((asset) => {
                                const kind = classifyKind(asset)
                                const previewUrl = toProviderProxyUrl(asset.source_url)
                                return (
                                    <Card key={`tile-${asset.id}`} className='bg-[#071225] border-cyan-400/20'>
                                        <CardContent className='p-3 space-y-2'>
                                            <div className='aspect-video rounded border border-cyan-400/20 bg-black/50 overflow-hidden'>
                                                {kind === 'image' && previewUrl && <img src={previewUrl} alt={asset.title || 'asset preview'} className='w-full h-full object-cover' />}
                                                {kind === 'video' && previewUrl && <video src={previewUrl} className='w-full h-full object-cover' muted />}
                                                {kind === '3d' && <div className='w-full h-full grid place-items-center text-cyan-200 text-xs'><Cube className='w-5 h-5' /></div>}
                                                {kind !== 'image' && kind !== 'video' && kind !== '3d' && (
                                                    <div className='w-full h-full grid place-items-center text-slate-400 text-xs'>No preview</div>
                                                )}
                                            </div>
                                            <p className='text-sm text-white line-clamp-1'>{asset.title || 'Generated Asset'}</p>
                                            <p className='text-xs text-slate-400 line-clamp-1'>{asset.model_id || asset.provider || 'unknown model'}</p>
                                            <div className='grid grid-cols-2 gap-2'>
                                                <Button size='sm' variant='outline' onClick={() => setSelectedAssetId(asset.id)}>Open</Button>
                                                <Button size='sm' variant='outline' onClick={() => removeAsset(asset.id)}>Delete</Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </>
    )
}

