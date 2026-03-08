import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import ModelSelector from '@/components/ModelSelector'
import { SpinnerGap, Sparkle, MagicWand, VideoCamera, Cube, ClockCounterClockwise, MusicNotes, DownloadSimple } from '@/components/icons/futureIcons'
import { toast } from 'sonner'
import { generateVideo, generateImage, generate3DAsset, getCredits, getProviderJobStatus } from '@/services/backend'
import { useUser } from '@clerk/clerk-react'
import { PLAN_LABELS, useAccessControl } from '@/services/accessControl'
import { getActiveProviders, getVideoModels, getImageModels, getThreeDModels } from '@/services/aiProvider'
import { getModelPricing } from '@/services/creditSystem'

const GENERATOR_TYPES = [
    {
        id: 'loop2d',
        name: '2D Image Generation',
        icon: VideoCamera,
        mode: 'image',
        about: 'Generates high-quality 2D still images for overlays, textures, and art direction boards.',
        exports: ['png', 'jpg', 'webp'],
    },
    {
        id: 'loop3d',
        name: '3D Text-to-Video Loops',
        icon: VideoCamera,
        mode: 'video',
        about: 'Creates 3D-style motion loops from text prompts for VJ playback and stage visuals.',
        exports: ['mp4', 'mov', 'gif'],
    },
    {
        id: 'asset3d',
        name: '3D Asset Generator',
        icon: Cube,
        mode: '3d',
        about: 'Builds engine-ready 3D assets from reference images using connected Hugging Face Spaces.',
        exports: ['glb', 'obj', 'fbx', 'ply', 'stl'],
    },
]

const RESOLUTION_OPTIONS = [
    { value: '1280x720', label: '720p', feature: 'generatorBasic' },
    { value: '1920x1080', label: '1080p', feature: 'generatorAdvanced' },
    { value: '3840x2160', label: '4K', feature: 'generator4k' },
    { value: '7680x4320', label: '8K', feature: 'generator8k' },
]

const DIVERSITY_OPTIONS = ['tight', 'balanced', 'wide']
const LOOP_TYPES = ['seamless', 'pingpong', 'hard-cut']
const FRAME_RATES = ['24', '30', '60', '120']
const DEFAULT_VIDEO_MODEL = 'wan-2.1-t2v'
const DEFAULT_IMAGE_MODEL = 'sdxl'
const DEFAULT_3D_MODEL = 'trellis-2'
const MAX_PROMPT_CHARS = 1200
const TERMINAL_PROVIDER_STATUSES = new Set(['succeeded', 'failed', 'canceled', 'aborted', 'completed'])

function parsePalette(input) {
    return input
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8)
}

const EXPORT_EXTENSION_MAP = {
    png_seq: 'zip',
    depth: 'exr',
    flow: 'flo',
    uasset_stub: 'json',
    material_graph: 'txt',
}

function normalizeExportExtension(format) {
    return EXPORT_EXTENSION_MAP[format] || format
}

function getUrlExtension(url) {
    if (!url) return ''
    const clean = url.split('?')[0].split('#')[0]
    const match = clean.match(/\.([a-z0-9]+)$/i)
    return match ? match[1].toLowerCase() : ''
}

function describeProgressStatus(status) {
    const value = String(status || '').toLowerCase()
    if (!value) return 'Preparing generation request...'
    if (value === 'cached') return 'Loaded from cache.'
    if (value === 'submitting') return 'Submitting request to provider...'
    if (value === 'starting' || value === 'queued') return 'Queued at provider...'
    if (value === 'processing' || value === 'running') return 'Provider is generating preview...'
    if (value === 'succeeded' || value === 'completed') return 'Generation completed.'
    if (value === 'canceled' || value === 'aborted') return 'Generation canceled.'
    if (value === 'failed') return 'Generation failed.'
    return `Status: ${status}`
}

function progressValueForStatus(status) {
    const value = String(status || '').toLowerCase()
    if (!value) return 5
    if (value === 'cached') return 100
    if (value === 'submitting') return 15
    if (value === 'starting' || value === 'queued') return 30
    if (value === 'processing' || value === 'running') return 70
    if (value === 'succeeded' || value === 'completed') return 100
    if (value === 'failed' || value === 'aborted' || value === 'canceled') return 0
    return 55
}

export default function AssetGenerator() {
    const { user } = useUser()
    const { hasAccess, lockReason, effectivePlan, ageVerified, restrictedConsentAccepted, isAdmin, isCompliant } = useAccessControl()
    const resultCleanupRef = useRef(null)

    const [generatorId, setGeneratorId] = useState('loop2d')
    const [prompt, setPrompt] = useState('')
    const [style, setStyle] = useState('cybernetic')
    const [projectName, setProjectName] = useState('Neon Session')
    const [duration, setDuration] = useState([8])
    const [frameRate, setFrameRate] = useState('60')
    const [resolution, setResolution] = useState('1920x1080')
    const [loopType, setLoopType] = useState('seamless')
    const [tempoBpm, setTempoBpm] = useState('120')
    const [audioReactive, setAudioReactive] = useState(true)
    const [palette, setPalette] = useState('#22d3ee,#f43f5e,#111827')
    const [variantCount, setVariantCount] = useState('3')
    const [diversity, setDiversity] = useState('balanced')
    const [maxTriangles, setMaxTriangles] = useState('200000')
    const [maxTexture, setMaxTexture] = useState('4096')
    const [gpuBudget, setGpuBudget] = useState('8')
    const [credits, setCredits] = useState(100)
    const [generating, setGenerating] = useState(false)
    const [generationStatus, setGenerationStatus] = useState('')
    const [generationProgress, setGenerationProgress] = useState(0)
    const [resultUrl, setResultUrl] = useState(null)
    const [apiJob, setApiJob] = useState(null)
    const [providerJobId, setProviderJobId] = useState(null)
    const [providerJobSnapshot, setProviderJobSnapshot] = useState(null)
    const [providerJobPollState, setProviderJobPollState] = useState('idle')
    const [videoModelId, setVideoModelId] = useState(DEFAULT_VIDEO_MODEL)
    const [imageModelId, setImageModelId] = useState(DEFAULT_IMAGE_MODEL)
    const [threeDModelId, setThreeDModelId] = useState(DEFAULT_3D_MODEL)
    const [videoImageFile, setVideoImageFile] = useState(null)
    const [videoImagePreviewUrl, setVideoImagePreviewUrl] = useState(null)
    const [videoMotionFile, setVideoMotionFile] = useState(null)
    const [videoMotionPreviewUrl, setVideoMotionPreviewUrl] = useState(null)
    const [sourceImageFile, setSourceImageFile] = useState(null)
    const [sourceImagePreviewUrl, setSourceImagePreviewUrl] = useState(null)
    const [exportFormat, setExportFormat] = useState(GENERATOR_TYPES[0].exports[0])
    const [downloading, setDownloading] = useState(false)

    const selectedGenerator = useMemo(() => GENERATOR_TYPES.find((item) => item.id === generatorId) || GENERATOR_TYPES[0], [generatorId])
    const activeProviders = useMemo(() => getActiveProviders(), [])
    const videoModels = useMemo(() => getVideoModels(), [])
    const imageModels = useMemo(() => getImageModels(), [])
    const threeDModels = useMemo(() => getThreeDModels(), [])
    const availableVideoModels = useMemo(() => videoModels.filter((model) => activeProviders.includes(model.provider)), [activeProviders, videoModels])
    const availableImageModels = useMemo(() => imageModels.filter((model) => activeProviders.includes(model.provider)), [activeProviders, imageModels])
    const availableThreeDModels = useMemo(() => threeDModels.filter((model) => activeProviders.includes(model.provider)), [activeProviders, threeDModels])
    const inAppThreeDModels = useMemo(() => availableThreeDModels.filter((model) => model.supportedInApp !== false), [availableThreeDModels])

    const selectedVideoModel = useMemo(() => videoModels.find((model) => model.id === videoModelId) || null, [videoModelId, videoModels])
    const selectedImageModel = useMemo(() => imageModels.find((model) => model.id === imageModelId) || null, [imageModelId, imageModels])
    const selectedThreeDModel = useMemo(() => threeDModels.find((model) => model.id === threeDModelId) || null, [threeDModelId, threeDModels])
    const selectedProvider = useMemo(() => {
        if (selectedGenerator.mode === 'video') return selectedVideoModel?.provider
        if (selectedGenerator.mode === '3d') return selectedThreeDModel?.provider
        return selectedImageModel?.provider
    }, [selectedGenerator.mode, selectedVideoModel?.provider, selectedImageModel?.provider, selectedThreeDModel?.provider])
    const selectedModelId = useMemo(() => {
        if (selectedGenerator.mode === 'video') return videoModelId
        if (selectedGenerator.mode === '3d') return threeDModelId
        return imageModelId
    }, [imageModelId, selectedGenerator.mode, threeDModelId, videoModelId])
    const selectedModelPricing = useMemo(() => getModelPricing(selectedModelId), [selectedModelId])
    const failoverCreditCeiling = useMemo(() => {
        if (selectedGenerator.mode !== 'video' || !selectedVideoModel) return null
        const candidateIds = [selectedVideoModel.id, ...(selectedVideoModel.failoverModelIds || [])]
        const costs = candidateIds
            .map((id) => getModelPricing(id)?.credits)
            .filter((value) => Number.isFinite(value) && value > 0)
        if (costs.length === 0) return null
        return Math.max(...costs)
    }, [selectedGenerator.mode, selectedVideoModel])
    const estimatedCredits = Number(selectedModelPricing?.credits || 0)
    const estimatedCreditsAfterRun = Math.max(0, credits - estimatedCredits)
    const videoRequiresImageInput = Boolean(selectedVideoModel?.requiresImageInput)
    const videoRequiresVideoInput = Boolean(selectedVideoModel?.requiresVideoInput)
    const videoSupportsImageInput = Boolean(selectedVideoModel?.supportsImageInput)
    const videoSupportsVideoInput = Boolean(selectedVideoModel?.supportsVideoInput)

    const providerErrorMessage = useMemo(() => {
        if (selectedGenerator.mode === 'video' && availableVideoModels.length === 0) {
            return 'No configured providers can generate video. Add VITE_REPLICATE_API_KEY or VITE_HUGGINGFACE_API_KEY.'
        }
        if (selectedGenerator.mode === 'image' && availableImageModels.length === 0) {
            return 'No configured providers can generate images. Add VITE_REPLICATE_API_KEY or VITE_HUGGINGFACE_API_KEY.'
        }
        if (selectedGenerator.mode === '3d' && availableThreeDModels.length === 0) {
            return 'No configured providers can generate 3D assets. Add VITE_HUGGINGFACE_API_KEY.'
        }
        if (selectedGenerator.mode === '3d' && inAppThreeDModels.length === 0) {
            return 'Configured 3D Spaces are external-only right now. Pick TRELLIS.2 or Hunyuan3D-2.1.'
        }
        if (selectedGenerator.mode === '3d' && selectedThreeDModel?.supportedInApp === false) {
            return selectedThreeDModel.supportNote || 'Selected 3D model does not currently support in-app generation.'
        }
        if (selectedProvider && !activeProviders.includes(selectedProvider)) {
            return `Selected model requires ${selectedProvider}, but that provider key is missing.`
        }
        return ''
    }, [
        activeProviders,
        availableImageModels.length,
        availableVideoModels.length,
        availableThreeDModels.length,
        inAppThreeDModels.length,
        selectedGenerator.mode,
        selectedProvider,
        selectedThreeDModel,
    ])

    const clearResultPreview = useCallback(() => {
        const cleanup = resultCleanupRef.current
        if (typeof cleanup === 'function') {
            try {
                cleanup()
            } catch {
                // ignore cleanup errors
            }
        }
        resultCleanupRef.current = null
        setResultUrl(null)
    }, [])

    useEffect(() => {
        let active = true
        if (user) {
            getCredits(user.id, effectivePlan)
                .then((data) => {
                    if (!active) return
                    setCredits(data.credits || 0)
                })
                .catch(() => {
                    if (!active) return
                    setCredits(0)
                })
        } else {
            setCredits(100)
        }
        return () => {
            active = false
        }
    }, [effectivePlan, user])

    useEffect(() => {
        if (!selectedGenerator.exports.includes(exportFormat)) {
            setExportFormat(selectedGenerator.exports[0])
        }
    }, [exportFormat, selectedGenerator])

    useEffect(() => {
        if (!videoModels.some((model) => model.id === videoModelId)) {
            setVideoModelId(videoModels[0]?.id || DEFAULT_VIDEO_MODEL)
            return
        }
        if (availableVideoModels.length > 0 && !availableVideoModels.some((model) => model.id === videoModelId)) {
            setVideoModelId(availableVideoModels[0].id)
        }
    }, [availableVideoModels, videoModelId, videoModels])

    useEffect(() => {
        if (!imageModels.some((model) => model.id === imageModelId)) {
            setImageModelId(imageModels[0]?.id || DEFAULT_IMAGE_MODEL)
            return
        }
        if (availableImageModels.length > 0 && !availableImageModels.some((model) => model.id === imageModelId)) {
            setImageModelId(availableImageModels[0].id)
        }
    }, [availableImageModels, imageModelId, imageModels])

    useEffect(() => {
        if (!videoSupportsImageInput && videoImageFile) setVideoImageFile(null)
        if (!videoSupportsVideoInput && videoMotionFile) setVideoMotionFile(null)
    }, [videoImageFile, videoMotionFile, videoSupportsImageInput, videoSupportsVideoInput])

    useEffect(() => {
        if (!threeDModels.some((model) => model.id === threeDModelId)) {
            setThreeDModelId(inAppThreeDModels[0]?.id || threeDModels[0]?.id || DEFAULT_3D_MODEL)
            return
        }
        if (inAppThreeDModels.length > 0 && !inAppThreeDModels.some((model) => model.id === threeDModelId)) {
            setThreeDModelId(inAppThreeDModels[0].id)
        }
    }, [inAppThreeDModels, threeDModelId, threeDModels])

    useEffect(() => {
        if (!videoImageFile) {
            setVideoImagePreviewUrl(null)
            return undefined
        }
        const nextUrl = URL.createObjectURL(videoImageFile)
        setVideoImagePreviewUrl(nextUrl)
        return () => URL.revokeObjectURL(nextUrl)
    }, [videoImageFile])

    useEffect(() => {
        if (!videoMotionFile) {
            setVideoMotionPreviewUrl(null)
            return undefined
        }
        const nextUrl = URL.createObjectURL(videoMotionFile)
        setVideoMotionPreviewUrl(nextUrl)
        return () => URL.revokeObjectURL(nextUrl)
    }, [videoMotionFile])

    useEffect(() => {
        if (!sourceImageFile) {
            setSourceImagePreviewUrl(null)
            return undefined
        }
        const nextUrl = URL.createObjectURL(sourceImageFile)
        setSourceImagePreviewUrl(nextUrl)
        return () => URL.revokeObjectURL(nextUrl)
    }, [sourceImageFile])

    useEffect(() => {
        return () => {
            const cleanup = resultCleanupRef.current
            if (typeof cleanup === 'function') {
                try {
                    cleanup()
                } catch {
                    // ignore cleanup errors
                }
            }
            resultCleanupRef.current = null
        }
    }, [])

    useEffect(() => {
        if (!providerJobId) return undefined
        let cancelled = false
        let timeoutId = null
        let attempts = 0
        let delayMs = 1000
        const maxAttempts = 18

        const poll = async () => {
            if (cancelled) return
            attempts += 1
            setProviderJobPollState((prev) => (prev === 'idle' ? 'polling' : prev))
            const snapshot = await getProviderJobStatus(providerJobId, { attempts: 3 })
            if (cancelled) return

            if (snapshot) {
                setProviderJobSnapshot(snapshot)
                if (TERMINAL_PROVIDER_STATUSES.has(snapshot.status)) {
                    setProviderJobPollState('completed')
                    return
                }
            }

            if (attempts >= maxAttempts) {
                setProviderJobPollState('stale')
                return
            }

            delayMs = Math.min(7000, Math.round(delayMs * 1.45))
            timeoutId = setTimeout(poll, delayMs)
        }

        setProviderJobPollState('polling')
        poll()

        return () => {
            cancelled = true
            if (timeoutId) clearTimeout(timeoutId)
        }
    }, [providerJobId])

    const enforceResolutionAccess = (value) => {
        const option = RESOLUTION_OPTIONS.find((item) => item.value === value)
        if (!option) return
        if (!hasAccess(option.feature)) {
            toast.error(lockReason(option.feature))
            return
        }
        setResolution(value)
    }

    const handleVideoImageSelect = (event) => {
        const file = event.target.files?.[0] || null
        if (file && !file.type.startsWith('image/')) {
            toast.error('Upload a valid image file for video reference.')
            event.target.value = ''
            return
        }
        setVideoImageFile(file)
    }

    const handleVideoMotionSelect = (event) => {
        const file = event.target.files?.[0] || null
        if (file && !file.type.startsWith('video/')) {
            toast.error('Upload a valid video file for motion reference.')
            event.target.value = ''
            return
        }
        setVideoMotionFile(file)
    }

    const handleSourceImageSelect = (event) => {
        const file = event.target.files?.[0] || null
        if (file && !file.type.startsWith('image/')) {
            toast.error('Upload a valid image file.')
            event.target.value = ''
            return
        }
        setSourceImageFile(file)
    }

    const handleGeneratePreview = async () => {
        setGenerationStatus('')
        setGenerationProgress(0)
        setProviderJobId(null)
        setProviderJobSnapshot(null)
        setProviderJobPollState('idle')
        if (!user) {
            toast.error('Sign in to generate assets.')
            return
        }
        if (providerErrorMessage) {
            toast.error(providerErrorMessage)
            return
        }
        if (selectedGenerator.mode !== '3d' && !prompt.trim()) {
            toast.error('Enter a generator prompt.')
            return
        }
        if (selectedGenerator.mode === 'video' && videoRequiresImageInput && !videoImageFile) {
            toast.error('Selected video model requires a reference image.')
            return
        }
        if (selectedGenerator.mode === 'video' && videoRequiresVideoInput && !videoMotionFile) {
            toast.error('Selected video model requires a driving video upload.')
            return
        }
        if (selectedGenerator.mode === '3d' && !sourceImageFile) {
            toast.error('Upload a source image for 3D asset generation.')
            return
        }

        setGenerating(true)
        setGenerationStatus('Preparing generation request...')
        setGenerationProgress(5)
        try {
            const payload = {
                userId: user.id,
                userTier: effectivePlan,
                ageVerified,
                contentConsentAccepted: restrictedConsentAccepted,
                isAdmin,
                prompt,
                style,
                duration: duration[0],
                resolution,
                onProgress: (event) => {
                    const baseStatus = describeProgressStatus(event?.status)
                    const message = String(event?.message || '').trim()
                    setGenerationStatus(message ? `${baseStatus} ${message}` : baseStatus)
                    setGenerationProgress(progressValueForStatus(event?.status))
                    if (event?.provider_job_id) {
                        setProviderJobId((prev) => prev || String(event.provider_job_id))
                    }
                },
            }
            const result =
                selectedGenerator.mode === 'video'
                    ? await generateVideo({
                        ...payload,
                        modelId: videoModelId,
                        imageFile: videoImageFile,
                        videoFile: videoMotionFile,
                    })
                    : selectedGenerator.mode === '3d'
                        ? await generate3DAsset({
                            ...payload,
                            modelId: threeDModelId,
                            imageFile: sourceImageFile,
                            maxTriangles,
                            maxTexture,
                        })
                        : await generateImage({ ...payload, modelId: imageModelId, width: 1024, height: 1024 })

            if (result.error) {
                toast.error(result.error)
                setGenerationStatus('Generation failed.')
            } else {
                clearResultPreview()
                setResultUrl(result.result_url)
                if (typeof result.release_result === 'function') {
                    resultCleanupRef.current = result.release_result
                }
                const nextCredits = Number(result.credits_remaining)
                if (Number.isFinite(nextCredits)) {
                    setCredits(nextCredits)
                }
                if (result.provider_job_id) {
                    setProviderJobId(String(result.provider_job_id))
                }
                if (result.cache_hit) {
                    toast.success('Preview loaded from cache. No credits used.')
                } else {
                    toast.success(selectedGenerator.mode === '3d' ? '3D asset generated.' : 'Preview generated.')
                }
                setGenerationStatus('')
                setGenerationProgress(0)
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Generation failed')
            setGenerationStatus('Generation failed.')
            setGenerationProgress(0)
        } finally {
            setGenerating(false)
        }
    }

    const handleCreateEnginePack = async () => {
        if (!user) {
            toast.error('Sign in to create engine packs.')
            return
        }
        const body = {
            project_name: projectName,
            seed_prompt: prompt,
            style,
            duration_seconds: duration[0],
            frame_rate: Number(frameRate),
            resolution,
            loop_type: loopType,
            tempo_bpm: tempoBpm ? Number(tempoBpm) : null,
            audio_reactive: audioReactive,
            color_palette: parsePalette(palette),
            asset_type: selectedGenerator.id,
            export_targets: selectedGenerator.exports.slice(0, 5),
            variants: { count: Number(variantCount), diversity },
            constraints: {
                max_triangles: maxTriangles ? Number(maxTriangles) : null,
                max_texture_size: maxTexture ? Number(maxTexture) : null,
                max_file_size_mb: 512,
                gpu_budget_ms: gpuBudget ? Number(gpuBudget) : null,
            },
            metadata: {
                tags: ['generator', selectedGenerator.id, 'cybernetic'],
                license: 'Commercial',
                author: user.primaryEmailAddress?.emailAddress || 'unknown',
                project_version: '1.0.0',
            },
            callbacks: { webhook_url: null, notify_on_complete: false },
        }

        setGenerating(true)
        try {
            const response = await fetch('/api/v1/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const isJson = (response.headers.get('content-type') || '').includes('application/json')
            const data = isJson ? await response.json() : null
            if (!response.ok) {
                toast.error(data?.message || `Pack generation request failed (${response.status})`)
                return
            }
            if (!data?.job_id) {
                toast.error('Pack generation response was missing job_id.')
                return
            }
            setApiJob(data)
            toast.success(`Engine pack queued: ${data.job_id}`)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Request failed')
        } finally {
            setGenerating(false)
        }
    }

    const handleDownloadExport = async () => {
        if (!resultUrl) {
            toast.error('Generate a preview before downloading.')
            return
        }

        setDownloading(true)
        const extension = normalizeExportExtension(exportFormat)
        const safeProjectName = String(projectName || selectedGenerator.id).trim().replace(/\s+/g, '_').toLowerCase()
        const filename = `${safeProjectName}-${selectedGenerator.id}.${extension}`
        const sourceExtension = getUrlExtension(resultUrl)
        try {
            const response = await fetch(resultUrl)
            if (!response.ok) {
                throw new Error(`Download failed (${response.status})`)
            }
            const blob = await response.blob()
            const objectUrl = URL.createObjectURL(blob)

            const anchor = document.createElement('a')
            anchor.href = objectUrl
            anchor.download = filename
            document.body.appendChild(anchor)
            anchor.click()
            document.body.removeChild(anchor)
            window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => URL.revokeObjectURL(objectUrl))
            })

            toast.success(`Export downloaded as ${extension.toUpperCase()}`)
            if (sourceExtension && sourceExtension !== extension) {
                toast.info('Downloaded source media with selected extension label. Full transcoding requires export worker support.')
            }
        } catch (error) {
            try {
                const anchor = document.createElement('a')
                anchor.href = resultUrl
                anchor.target = '_blank'
                anchor.rel = 'noopener noreferrer'
                anchor.download = filename
                document.body.appendChild(anchor)
                anchor.click()
                document.body.removeChild(anchor)
                toast.info('Opened direct provider download. Browser policy blocked in-app fetch download.')
            } catch {
                toast.error(error instanceof Error ? error.message : 'Export download failed')
            }
        } finally {
            setDownloading(false)
        }
    }

    const refreshProviderJob = async () => {
        if (!providerJobId) return
        setProviderJobPollState('refreshing')
        const snapshot = await getProviderJobStatus(providerJobId, { attempts: 3 })
        if (!snapshot) {
            setProviderJobPollState('stale')
            return
        }
        setProviderJobSnapshot(snapshot)
        setProviderJobPollState(TERMINAL_PROVIDER_STATUSES.has(snapshot.status) ? 'completed' : 'polling')
    }

    return (
        <>
            <Helmet>
                <title>Asset Generator - VFX Studios</title>
            </Helmet>
            <div className='space-y-6'>
                <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
                    <div>
                        <h1 className='text-3xl font-bold text-white mb-2'>Asset Generator</h1>
                        <p className='text-gray-400'>High-fidelity 2D imaging, 3D text-video loops, and 3D asset generation</p>
                    </div>
                    <div className='flex flex-wrap gap-2'>
                        <Badge variant='outline' className='border-cyan-400/35 text-cyan-200'>
                            Plan: {PLAN_LABELS[effectivePlan]}
                        </Badge>
                        <Badge
                            variant='outline'
                            className={
                                isCompliant
                                    ? 'border-emerald-400/45 text-emerald-200 bg-emerald-500/10'
                                    : 'border-amber-400/45 text-amber-200 bg-amber-500/10'
                            }
                        >
                            {isCompliant ? 'Compliance Verified' : 'Compliance Required'}
                        </Badge>
                        <Badge variant='outline' className='border-fuchsia-400/35 text-fuchsia-200'>
                            <Sparkle size={13} className='mr-1.5' />
                            {credits} Credits
                        </Badge>
                    </div>
                </div>

                <Tabs value={generatorId} onValueChange={setGeneratorId}>
                    <TabsList className='grid w-full grid-cols-3 bg-slate-900/60'>
                        {GENERATOR_TYPES.map((generator) => (
                            <TabsTrigger key={generator.id} value={generator.id} className='flex items-center gap-2'>
                                <generator.icon size={16} />
                                {generator.name}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {GENERATOR_TYPES.map((generator) => (
                        <TabsContent key={generator.id} value={generator.id} className='space-y-6'>
                            <Card className='bg-[#0b1730] border-cyan-400/20'>
                                <CardHeader>
                                    <CardTitle className='text-cyan-100 flex items-center gap-2'>
                                        <MagicWand size={18} />
                                        What This Generator Does
                                    </CardTitle>
                                    <CardDescription className='text-slate-300'>{generator.about}</CardDescription>
                                </CardHeader>
                                <CardContent className='flex flex-wrap gap-2'>
                                    {generator.exports.map((item) => (
                                        <Badge key={item} variant='outline' className='uppercase'>
                                            {item}
                                        </Badge>
                                    ))}
                                </CardContent>
                            </Card>

                            <div className='grid gap-6 lg:grid-cols-3'>
                                <Card className='lg:col-span-2 bg-slate-900/60 border-cyan-400/20'>
                                    <CardHeader>
                                        <CardTitle className='text-white'>Generation Controls</CardTitle>
                                    </CardHeader>
                                    <CardContent className='space-y-4'>
                                        <div className='grid gap-3 md:grid-cols-2'>
                                            <div className='space-y-2'>
                                                <Label>Project Name</Label>
                                                <Input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
                                            </div>
                                            <div className='space-y-2'>
                                                <Label>Style</Label>
                                                <Input value={style} onChange={(event) => setStyle(event.target.value)} />
                                            </div>
                                        </div>
                                        <div className='rounded-lg border border-cyan-500/20 bg-slate-800/40 p-3'>
                                            {selectedGenerator.mode === 'video' ? (
                                                <ModelSelector type='video' value={videoModelId} onChange={setVideoModelId} />
                                            ) : selectedGenerator.mode === '3d' ? (
                                                <ModelSelector type='3d' value={threeDModelId} onChange={setThreeDModelId} />
                                            ) : (
                                                <ModelSelector type='image' value={imageModelId} onChange={setImageModelId} />
                                            )}
                                            {providerErrorMessage && <p className='mt-2 text-xs text-amber-300'>{providerErrorMessage}</p>}
                                        </div>
                                        <div className='rounded-lg border border-cyan-500/20 bg-slate-800/40 p-3 text-xs text-slate-300'>
                                            <p className='font-medium text-cyan-200'>
                                                Estimated Charge: {estimatedCredits > 0 ? `${estimatedCredits} credits` : 'Credits vary'}
                                            </p>
                                            <p className='mt-1'>Balance After Run: {estimatedCredits > 0 ? `${estimatedCreditsAfterRun} credits` : `${credits} credits`}</p>
                                            {selectedGenerator.mode === 'video' && Number.isFinite(failoverCreditCeiling) && failoverCreditCeiling > estimatedCredits && (
                                                <p className='mt-1 text-amber-300'>Failover ceiling: up to {failoverCreditCeiling} credits if backup model is used.</p>
                                            )}
                                        </div>
                                        <div className='space-y-2'>
                                            <Label>{selectedGenerator.mode === '3d' ? 'Prompt (optional)' : 'Prompt'}</Label>
                                            <Textarea
                                                value={prompt}
                                                maxLength={MAX_PROMPT_CHARS}
                                                onChange={(event) => setPrompt(event.target.value)}
                                                placeholder={selectedGenerator.mode === '3d' ? 'Optional: describe target style or material details...' : 'Describe the look, motion, and mood...'}
                                            />
                                            <p className='text-[11px] text-slate-400'>{prompt.length}/{MAX_PROMPT_CHARS} characters</p>
                                        </div>
                                        {selectedGenerator.mode === 'video' && (
                                            <>
                                                <div className='grid gap-3 md:grid-cols-3'>
                                                    <div className='space-y-2'>
                                                        <Label>Duration: {duration[0]}s</Label>
                                                        <Slider value={duration} onValueChange={setDuration} min={2} max={30} step={1} />
                                                    </div>
                                                    <div className='space-y-2'>
                                                        <Label>FPS</Label>
                                                        <Select value={frameRate} onValueChange={setFrameRate}>
                                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                                            <SelectContent>{FRAME_RATES.map((fps) => <SelectItem key={fps} value={fps}>{fps}</SelectItem>)}</SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className='space-y-2'>
                                                        <Label>Resolution</Label>
                                                        <Select value={resolution} onValueChange={enforceResolutionAccess}>
                                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                                            <SelectContent>{RESOLUTION_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                                <div className='grid gap-3 md:grid-cols-3'>
                                                    <div className='space-y-2'>
                                                        <Label>Loop Type</Label>
                                                        <Select value={loopType} onValueChange={setLoopType}>
                                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                                            <SelectContent>{LOOP_TYPES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className='space-y-2'>
                                                        <Label className='flex items-center gap-1'><MusicNotes size={14} />Tempo BPM</Label>
                                                        <Input value={tempoBpm} onChange={(event) => setTempoBpm(event.target.value)} />
                                                    </div>
                                                    <div className='space-y-2'>
                                                        <Label>Audio Reactive</Label>
                                                        <div className='h-10 px-3 border border-cyan-500/20 rounded-md flex items-center justify-between bg-slate-800'>
                                                            <span className='text-sm text-slate-300'>Enable modulation</span>
                                                            <Switch checked={audioReactive} onCheckedChange={setAudioReactive} />
                                                        </div>
                                                    </div>
                                                </div>
                                                {(videoSupportsImageInput || videoSupportsVideoInput) && (
                                                    <div className='rounded-md border border-cyan-500/20 bg-slate-800/50 p-3 space-y-3'>
                                                        <p className='text-xs text-cyan-200'>Reference Inputs (model-dependent)</p>
                                                        {videoSupportsImageInput && (
                                                            <div className='space-y-2'>
                                                                <Label>
                                                                    Reference Image {videoRequiresImageInput ? '(required)' : '(optional)'}
                                                                </Label>
                                                                <Input type='file' accept='image/*' onChange={handleVideoImageSelect} />
                                                                {videoImageFile && (
                                                                    <div className='flex items-center justify-between gap-2'>
                                                                        <p className='text-[11px] text-slate-400'>
                                                                            {videoImageFile.name} ({Math.max(1, Math.round(videoImageFile.size / 1024))} KB)
                                                                        </p>
                                                                        <Button type='button' variant='outline' size='sm' onClick={() => setVideoImageFile(null)}>
                                                                            Remove
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                                {videoImagePreviewUrl && (
                                                                    <div className='rounded-md border border-cyan-500/20 p-2 bg-slate-900/40'>
                                                                        <img src={videoImagePreviewUrl} alt='Video reference preview' className='max-h-36 object-contain mx-auto rounded' />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                        {videoSupportsVideoInput && (
                                                            <div className='space-y-2'>
                                                                <Label>
                                                                    Motion Video {videoRequiresVideoInput ? '(required)' : '(optional)'}
                                                                </Label>
                                                                <Input type='file' accept='video/*' onChange={handleVideoMotionSelect} />
                                                                {videoMotionFile && (
                                                                    <div className='flex items-center justify-between gap-2'>
                                                                        <p className='text-[11px] text-slate-400'>
                                                                            {videoMotionFile.name} ({Math.max(1, Math.round(videoMotionFile.size / 1024))} KB)
                                                                        </p>
                                                                        <Button type='button' variant='outline' size='sm' onClick={() => setVideoMotionFile(null)}>
                                                                            Remove
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                                {videoMotionPreviewUrl && (
                                                                    <div className='rounded-md border border-cyan-500/20 p-2 bg-slate-900/40'>
                                                                        <video src={videoMotionPreviewUrl} controls className='max-h-44 w-full object-contain rounded' />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        {selectedGenerator.mode === 'image' && (
                                            <>
                                                <div className='grid gap-3 md:grid-cols-3'>
                                                    <div className='space-y-2'>
                                                        <Label>Resolution</Label>
                                                        <Select value={resolution} onValueChange={enforceResolutionAccess}>
                                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                                            <SelectContent>{RESOLUTION_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className='space-y-2'>
                                                        <Label>Variants</Label>
                                                        <Input value={variantCount} onChange={(event) => setVariantCount(event.target.value)} />
                                                    </div>
                                                    <div className='space-y-2'>
                                                        <Label>Diversity</Label>
                                                        <Select value={diversity} onValueChange={setDiversity}>
                                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                                            <SelectContent>{DIVERSITY_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                                <div className='space-y-2'>
                                                    <Label>Palette (comma-separated)</Label>
                                                    <Input value={palette} onChange={(event) => setPalette(event.target.value)} />
                                                </div>
                                            </>
                                        )}
                                        {selectedGenerator.mode === '3d' && (
                                            <>
                                                <div className='space-y-2'>
                                                    <Label>Source Image</Label>
                                                    <Input type='file' accept='image/*' onChange={handleSourceImageSelect} />
                                                    {sourceImageFile && (
                                                        <div className='flex items-center justify-between gap-2'>
                                                            <p className='text-[11px] text-slate-400'>
                                                                {sourceImageFile.name} ({Math.max(1, Math.round(sourceImageFile.size / 1024))} KB)
                                                            </p>
                                                            <Button type='button' variant='outline' size='sm' onClick={() => setSourceImageFile(null)}>
                                                                Remove
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                                {sourceImagePreviewUrl && (
                                                    <div className='rounded-md border border-cyan-500/20 p-2 bg-slate-800/50'>
                                                        <img src={sourceImagePreviewUrl} alt='3D source preview' className='max-h-40 object-contain mx-auto rounded' />
                                                    </div>
                                                )}
                                                <div className='grid gap-3 md:grid-cols-3'>
                                                    <Input value={maxTriangles} onChange={(event) => setMaxTriangles(event.target.value)} placeholder='Max triangles' />
                                                    <Input value={maxTexture} onChange={(event) => setMaxTexture(event.target.value)} placeholder='Max texture size' />
                                                    <Input value={gpuBudget} onChange={(event) => setGpuBudget(event.target.value)} placeholder='GPU budget ms' />
                                                </div>
                                            </>
                                        )}
                                        <div className='flex flex-wrap gap-2'>
                                            <Button onClick={handleGeneratePreview} disabled={generating || Boolean(providerErrorMessage)}>
                                                {generating ? <SpinnerGap size={16} className='mr-2 animate-spin' /> : <ClockCounterClockwise size={16} className='mr-2' />}
                                                Generate Preview
                                            </Button>
                                            <Button variant='gradient' onClick={handleCreateEnginePack} disabled={generating}>
                                                <Sparkle size={16} className='mr-2' />
                                                Queue Engine Pack
                                            </Button>
                                        </div>
                                        {(generating || generationStatus === 'Generation failed.') && (
                                            <div className='space-y-1.5'>
                                                <Progress value={generationProgress} />
                                                <p className='text-xs text-slate-300'>{generationStatus}</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card className='bg-slate-900/60 border-cyan-400/20'>
                                    <CardHeader>
                                        <CardTitle className='text-white'>Output</CardTitle>
                                        <CardDescription className='text-slate-400'>Preview and job status</CardDescription>
                                    </CardHeader>
                                    <CardContent className='space-y-4'>
                                        <div className='aspect-video rounded-lg border border-cyan-400/20 bg-[#081125] flex items-center justify-center overflow-hidden'>
                                            {resultUrl ? (
                                                selectedGenerator.mode === 'video'
                                                    ? <video src={resultUrl} controls className='w-full h-full object-contain' />
                                                    : selectedGenerator.mode === 'image'
                                                        ? <img src={resultUrl} alt='Generated preview' className='w-full h-full object-contain' />
                                                        : (
                                                            <div className='text-center px-6'>
                                                                <Cube size={42} className='mx-auto text-cyan-300 mb-3' />
                                                                <p className='text-sm text-cyan-100'>3D asset is ready for export.</p>
                                                                <p className='text-xs text-slate-400 mt-1 break-all'>{resultUrl}</p>
                                                            </div>
                                                        )
                                            ) : (
                                                <p className='text-sm text-slate-400'>No preview yet.</p>
                                            )}
                                        </div>
                                        <div className='space-y-2 rounded-md border border-cyan-400/20 bg-[#081125] p-3'>
                                            <Label>Export Format</Label>
                                            <Select value={exportFormat} onValueChange={setExportFormat}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {selectedGenerator.exports.map((format) => (
                                                        <SelectItem key={format} value={format}>
                                                            {format.toUpperCase()}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button onClick={handleDownloadExport} disabled={downloading || !resultUrl} className='w-full'>
                                                {downloading ? <SpinnerGap size={16} className='mr-2 animate-spin' /> : <DownloadSimple size={16} className='mr-2' />}
                                                Download Export
                                            </Button>
                                        </div>
                                        {apiJob && (
                                            <div className='rounded-md border border-cyan-400/20 bg-[#081125] p-3 text-xs text-slate-300 space-y-1'>
                                                <p>Job ID: {apiJob.job_id}</p>
                                                <p>Status: {apiJob.status}</p>
                                                <p>ETA: {apiJob.estimated_seconds}s</p>
                                            </div>
                                        )}
                                        {providerJobId && (
                                            <div className='rounded-md border border-fuchsia-400/20 bg-[#081125] p-3 text-xs text-slate-300 space-y-2'>
                                                <div className='flex items-center justify-between gap-2'>
                                                    <p className='text-fuchsia-200 font-medium'>Provider Job Monitor</p>
                                                    <Button type='button' variant='outline' size='sm' onClick={refreshProviderJob}>
                                                        Refresh
                                                    </Button>
                                                </div>
                                                <p>Provider Job ID: {providerJobId}</p>
                                                <p>Status: {providerJobSnapshot?.status || providerJobPollState}</p>
                                                {providerJobSnapshot?.provider && <p>Provider: {providerJobSnapshot.provider}</p>}
                                                {providerJobSnapshot?.model_id && <p>Model: {providerJobSnapshot.model_id}</p>}
                                                {providerJobSnapshot?.result_url && (
                                                    <p className='break-all'>Result URL: {providerJobSnapshot.result_url}</p>
                                                )}
                                                <div className='max-h-28 overflow-y-auto space-y-1 border border-fuchsia-500/20 rounded p-2'>
                                                    {(providerJobSnapshot?.events || []).length === 0 && <p>No provider events yet.</p>}
                                                    {(providerJobSnapshot?.events || []).slice(0, 8).map((event, index) => (
                                                        <p key={`${event.at || index}-${index}`}>
                                                            {event.at || ''} {event.status || ''} {event.message || ''}
                                                        </p>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <p className='text-xs text-slate-400'>
                                            8K and cinematic tiers require studio access. If locked, switch plan in Account or use admin testing override.
                                        </p>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>
                    ))}
                </Tabs>
            </div>
        </>
    )
}

