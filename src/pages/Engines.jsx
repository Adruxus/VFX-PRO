import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import FeatureLock from '@/components/FeatureLock'
import { PLAN_LABELS, useAccessControl } from '@/services/accessControl'
import { SCENE_PRESETS } from '@/data/scenePresets'
import { PROMPT_AUDIT_ITEMS, PROMPT_AUDIT_SCOPE, PROMPT_AUDIT_STATUS_META } from '@/data/unityUnrealPromptChecklist'
import {
    ENGINE_ASSET_GAPS,
    ITCH_3D_ASSET_SHORTLIST,
    ITCH_3D_AUDIT_SCOPE,
    ITCH_PIPELINE_CHECKLIST,
    ITCH_STATUS_META,
    PREMADE_GAME_VERTICAL_SLICE,
} from '@/data/itchAssetIntakeChecklist'
import {
    connectRuntimeBridge,
    disconnectRuntimeBridge,
    getDefaultRuntimeEndpoint,
    serializeSceneForRuntime,
    syncRuntimeScene,
} from '@/services/runtimeBridge'
import {
    connectMidiControl,
    connectOscControl,
    disconnectLiveControl,
    getDefaultOscEndpoint,
    listMidiInputs,
    sendOscControl,
} from '@/services/liveControlBridge'
import { VJ_COMPETITIVE_FEATURES, VJ_COMPETITIVE_SCOPE, VJ_COMPETITIVE_SOURCES } from '@/data/vjCompetitiveMatrix'
import { toast } from 'sonner'
import { ArrowSquareOut, CheckCircle, DownloadSimple, Record, ShieldCheck, Stop } from '@/components/icons/futureIcons'

const SceneViewport3D = lazy(() => import('@/components/SceneViewport3D'))

const OUTPUT_RESOLUTION_OPTIONS = [
    { value: '1920x1080', label: '1080p', feature: 'generatorBasic' },
    { value: '2560x1440', label: '1440p', feature: 'generatorAdvanced' },
    { value: '3840x2160', label: '4K', feature: 'generator4k' },
    { value: '7680x4320', label: '8K', feature: 'generator8k' },
]

const LAYER_TYPES = ['video', 'particles', 'lights', 'post']
const NODE_TYPES = ['TextureInput', 'ColorGrade', 'Noise', 'Emitter', 'Output']

const TARGETS = [
    {
        id: 'unreal',
        name: 'Unreal Engine 5',
        formats: ['uasset', 'fbx', 'glb', 'mp4', 'mov'],
        docs: 'https://dev.epicgames.com/documentation/en-us/unreal-engine',
    },
    {
        id: 'unity',
        name: 'Unity 3D',
        formats: ['prefab', 'mat', 'shadergraph', 'mp4', 'png'],
        docs: 'https://docs.unity3d.com',
    },
]

const LIVE_CONTROL_PROTOCOLS = [
    { id: 'midi', label: 'MIDI Input' },
    { id: 'osc', label: 'OSC Bridge (WebSocket)' },
]

const MIDI_PROFILES = [
    {
        id: 'generic',
        label: 'Generic VJ MIDI',
        description: 'CC1/CC74 playhead, CC7/CC11 selected-layer value, Note C1 toggles layer visibility.',
    },
    {
        id: 'open-turntable',
        label: 'Open Turntable (CS335)',
        description:
            'Cue Note 0x0C adds a keyframe, Play Note 0x0B toggles layer visibility, CC0x21 jog scrubs playhead, CC0x19 tempo remaps FPS, CC0x20 controls selected-layer value.',
    },
]

const OPEN_TURNTABLE_MAP = {
    cueNote: 0x0c,
    playNote: 0x0b,
    jogCc: 0x21,
    tempoCc: 0x19,
    volumeCc: 0x20,
}

function makeId(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

function inferPreviewAssetType(title) {
    const value = title.toLowerCase()
    if (/(character|people|villager|knight|zombie|woman|man|human|npc|skeleton)/.test(value)) return 'character'
    if (/(house|building|city|dungeon|temple|hospital|castle|tavern|restaurant|market|village)/.test(value)) return 'building'
    if (/(car|vehicle|ship|spaceship|bike|tank|bus|plane|hover)/.test(value)) return 'vehicle'
    if (/(tree|forest|nature|rocky|mountain|beach|graveyard|farm)/.test(value)) return 'nature'
    if (/(weapon|gun|rifle|shotgun|sword|shield)/.test(value)) return 'weapon'
    return 'prop'
}

function getPreviewAssetPosition(index) {
    const columns = 6
    const spacing = 2.1
    const col = index % columns
    const row = Math.floor(index / columns)
    return [-5.2 + col * spacing, 0, 4 + row * spacing]
}

function slugifyForPath(value) {
    return (
        value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 64) || 'asset'
    )
}

function parseResolution(value) {
    const [widthRaw, heightRaw] = String(value || '').split('x')
    const width = Number(widthRaw)
    const height = Number(heightRaw)
    if (!Number.isFinite(width) || !Number.isFinite(height)) return { x: 3840, y: 2160 }
    return { x: Math.max(256, width), y: Math.max(256, height) }
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value))
}

function toNormalizedValue(value) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return null
    if (numeric > 1) return clamp(numeric / 127, 0, 1)
    return clamp(numeric, 0, 1)
}

function toOriginVector(position) {
    return {
        x: Number((position?.[0] ?? 0).toFixed(3)),
        y: Number((position?.[1] ?? 0).toFixed(3)),
        z: Number((position?.[2] ?? 0).toFixed(3)),
    }
}

function toUnityImportPath(asset) {
    const slug = slugifyForPath(asset.title || asset.id)
    const root = asset.sourceAssetId ? 'Assets/VFXStudio/External/Itch3D' : 'Assets/VFXStudio/External/LocalUploads'
    const folder = `${root}/${slug}`
    return `${folder}/${slug}.prefab`
}

function toUnrealImportPath(asset) {
    const slug = slugifyForPath(asset.title || asset.id).replace(/-/g, '_')
    const root = asset.sourceAssetId ? '/Game/VFXStudio/External/Itch3D' : '/Game/VFXStudio/External/LocalUploads'
    return `${root}/SM_${slug}.SM_${slug}`
}

function buildUnityImportManifest({ scene, presetId, previewAssets, outputResolution }) {
    const requestId = `REQ-UNITY-IMPORT-${Date.now()}`
    const captureResolution = parseResolution(outputResolution)
    const stagedAssets = previewAssets.map((asset, index) => ({
        queue_id: `unity-${String(index + 1).padStart(3, '0')}`,
        source_asset_id: asset.sourceAssetId || null,
        title: asset.title,
        creator: asset.creator,
        preview_type: asset.previewType,
        license_status: asset.licenseStatus,
        source_listing: asset.sourceListing || null,
        proposed_prefab_path: toUnityImportPath(asset),
        stage_position: toOriginVector(asset.position),
        stage_scale: Number((asset.scale || 1).toFixed(3)),
        source_model: asset.modelUrl ? 'local_upload' : 'itch_shortlist',
    }))
    const stageOrigin = toOriginVector(previewAssets[0]?.position)
    const assetPaths = stagedAssets.map((item) => item.proposed_prefab_path)
    const morphSource = assetPaths[0] || 'Assets/VFXStudio/Prefabs/Source.prefab'
    const morphTarget = assetPaths[1] || morphSource

    return {
        schema_version: '1.0.0',
        generated_at: new Date().toISOString(),
        target_engine: 'unity',
        scene_name: scene.name,
        scene_preset: presetId,
        output_resolution: captureResolution,
        staged_assets: stagedAssets,
        pipeline_request: {
            request_id: requestId,
            scene_name: scene.name,
            target: 'unity',
            terrain: {
                resolution: 2049,
                world_scale: 100.0,
                height_scale: 1200.0,
                seed: 1337,
            },
            asset_staging: {
                asset_paths: assetPaths,
                stage_origin: stageOrigin,
                grid_spacing: 3.0,
                validate_pbr: true,
            },
            morph: {
                source_asset_path: morphSource,
                target_asset_path: morphTarget,
                alpha: 1.0,
                use_sdf_fallback: false,
            },
            wormhole: {
                mode: 'wormhole',
                center: { x: 0, y: 3, z: -5 },
                radius: 8.0,
                distortion_strength: 1.25,
                particle_budget: 150000,
            },
            capture: {
                camera_names: ['Cam_24mm', 'Cam_35mm', 'Cam_50mm', 'Cam_85mm', 'Cam_135mm'],
                resolution: captureResolution,
                frame_rate: scene.fps,
                output_directory: 'Recordings/VFXStudio',
            },
        },
    }
}

function buildUnrealImportManifest({ scene, presetId, previewAssets, outputResolution }) {
    const requestId = `REQ-UNREAL-IMPORT-${Date.now()}`
    const captureResolution = parseResolution(outputResolution)
    const stagedAssets = previewAssets.map((asset, index) => ({
        queue_id: `unreal-${String(index + 1).padStart(3, '0')}`,
        source_asset_id: asset.sourceAssetId || null,
        title: asset.title,
        creator: asset.creator,
        preview_type: asset.previewType,
        license_status: asset.licenseStatus,
        source_listing: asset.sourceListing || null,
        proposed_soft_object_path: toUnrealImportPath(asset),
        stage_position: toOriginVector(asset.position),
        stage_scale: Number((asset.scale || 1).toFixed(3)),
        source_model: asset.modelUrl ? 'local_upload' : 'itch_shortlist',
    }))
    const stageOrigin = toOriginVector(previewAssets[0]?.position)
    const assetPaths = stagedAssets.map((item) => item.proposed_soft_object_path)
    const morphSource = assetPaths[0] || '/Game/VFXStudio/Prefabs/SM_Source.SM_Source'
    const morphTarget = assetPaths[1] || morphSource

    return {
        schema_version: '1.0.0',
        generated_at: new Date().toISOString(),
        target_engine: 'unreal',
        scene_name: scene.name,
        scene_preset: presetId,
        output_resolution: captureResolution,
        staged_assets: stagedAssets,
        pipeline_request: {
            request_id: requestId,
            scene_name: scene.name,
            target: 'unreal',
            terrain: {
                resolution: 2017,
                world_scale: 100.0,
                height_scale: 4000.0,
                seed: 1337,
            },
            asset_staging: {
                asset_paths: assetPaths,
                stage_origin: stageOrigin,
                grid_spacing: 300.0,
                validate_pbr: true,
            },
            morph: {
                source_asset_path: morphSource,
                target_asset_path: morphTarget,
                alpha: 1.0,
                use_sdf_fallback: false,
            },
            wormhole: {
                mode: 'wormhole',
                center: { x: 0, y: 300, z: -500 },
                radius: 800.0,
                distortion_strength: 1.25,
                particle_budget: 150000,
            },
            capture: {
                camera_names: ['Cam_24mm', 'Cam_35mm', 'Cam_50mm', 'Cam_85mm', 'Cam_135mm'],
                resolution: captureResolution,
                frame_rate: scene.fps,
                output_directory: 'Saved/VFXStudio/Captures',
            },
        },
    }
}

function defaultScene() {
    return {
        name: 'Festival Opener',
        duration: 90,
        fps: 60,
        engineTarget: 'unreal',
        layers: [
            { id: 'layer-a', name: 'Background', type: 'video', visible: true, keyframes: [{ id: 'kf-a', t: 0, v: 1 }] },
            { id: 'layer-b', name: 'FX Particles', type: 'particles', visible: true, keyframes: [{ id: 'kf-b', t: 8, v: 0.6 }] },
        ],
        nodes: [
            { id: 'node-a', type: 'TextureInput', label: 'Scene Feed' },
            { id: 'node-b', type: 'ColorGrade', label: 'Cyber Grade' },
            { id: 'node-c', type: 'Output', label: 'Runtime Out' },
        ],
        links: [
            { id: 'link-a', from: 'node-a', to: 'node-b' },
            { id: 'link-b', from: 'node-b', to: 'node-c' },
        ],
    }
}

function triggerDownload(filename, payload) {
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1200)
}

export default function Engines() {
    const { hasAccess, lockReason, effectivePlan, isAdmin } = useAccessControl()
    const canUseEditor = hasAccess('sceneEditor')
    const canUseRuntimeBridge = hasAccess('runtimeBridge')
    const canRecordCinematic = hasAccess('cinematicRecording')

    const [scene, setScene] = useState(() => defaultScene())
    const [playhead, setPlayhead] = useState([0])
    const [selectedLayerId, setSelectedLayerId] = useState('layer-a')
    const [selectedNodeId, setSelectedNodeId] = useState('node-b')
    const [newLayerType, setNewLayerType] = useState('video')
    const [newLayerName, setNewLayerName] = useState('')
    const [newNodeType, setNewNodeType] = useState('Noise')
    const [newNodeLabel, setNewNodeLabel] = useState('')
    const [linkFrom, setLinkFrom] = useState('node-a')
    const [linkTo, setLinkTo] = useState('node-c')

    const [scenePresetId, setScenePresetId] = useState(SCENE_PRESETS[0].id)
    const [viewportQuality, setViewportQuality] = useState('quality')
    const [outputResolution, setOutputResolution] = useState('3840x2160')
    const [clipDuration, setClipDuration] = useState([8])
    const [recordingState, setRecordingState] = useState('idle')
    const [recordedClipUrl, setRecordedClipUrl] = useState(null)
    const [assetSearch, setAssetSearch] = useState('')
    const [selectedPreviewAssetId, setSelectedPreviewAssetId] = useState('')
    const [previewAssets, setPreviewAssets] = useState([])

    const [bridgeTarget, setBridgeTarget] = useState('unreal')
    const [bridgeEndpoint, setBridgeEndpoint] = useState(getDefaultRuntimeEndpoint('unreal'))
    const [allowMock, setAllowMock] = useState(true)
    const [bridgeSession, setBridgeSession] = useState(null)
    const [bridgeState, setBridgeState] = useState('disconnected')
    const [bridgeLogs, setBridgeLogs] = useState([])
    const [controlProtocol, setControlProtocol] = useState('midi')
    const [controlEndpoint, setControlEndpoint] = useState(getDefaultOscEndpoint())
    const [controlAllowMock, setControlAllowMock] = useState(true)
    const [controlSession, setControlSession] = useState(null)
    const [controlState, setControlState] = useState('disconnected')
    const [controlLogs, setControlLogs] = useState([])
    const [midiInputId, setMidiInputId] = useState('auto')
    const [midiInputOptions, setMidiInputOptions] = useState([])
    const [midiProfileId, setMidiProfileId] = useState('open-turntable')
    const [turntableState, setTurntableState] = useState({
        jogDelta: 0,
        tempoNormalized: 0.5,
        volumeNormalized: 0.75,
        playing: false,
        cueCount: 0,
        lastSignalAt: null,
    })

    const canvasWrapperRef = useRef(null)
    const canvasNodeRef = useRef(null)
    const recorderRef = useRef(null)
    const chunkRef = useRef([])
    const previewAssetsRef = useRef([])
    const selectedLayerIdRef = useRef(selectedLayerId)
    const sceneDurationRef = useRef(scene.duration)
    const controlSessionRef = useRef(null)

    const selectedLayer = useMemo(() => scene.layers.find((item) => item.id === selectedLayerId) || null, [scene.layers, selectedLayerId])
    const selectedMidiProfile = useMemo(
        () => MIDI_PROFILES.find((profile) => profile.id === midiProfileId) || MIDI_PROFILES[0],
        [midiProfileId]
    )
    const payloadPreview = useMemo(() => JSON.stringify(serializeSceneForRuntime(scene), null, 2), [scene])
    const promptAuditCounts = useMemo(() => {
        const totals = { done: 0, partial: 0, todo: 0 }
        for (const item of PROMPT_AUDIT_ITEMS) {
            if (Object.prototype.hasOwnProperty.call(totals, item.status)) totals[item.status] += 1
        }
        return totals
    }, [])
    const promptAuditProgress = useMemo(() => {
        const total = PROMPT_AUDIT_ITEMS.length || 1
        const weighted = promptAuditCounts.done + promptAuditCounts.partial * 0.5
        return Math.round((weighted / total) * 100)
    }, [promptAuditCounts.done, promptAuditCounts.partial])
    const competitiveCounts = useMemo(() => {
        const totals = { done: 0, partial: 0, todo: 0 }
        for (const item of VJ_COMPETITIVE_FEATURES) {
            if (Object.prototype.hasOwnProperty.call(totals, item.status)) totals[item.status] += 1
        }
        return totals
    }, [])
    const competitiveProgress = useMemo(() => {
        const total = VJ_COMPETITIVE_FEATURES.length || 1
        const weighted = competitiveCounts.done + competitiveCounts.partial * 0.5
        return Math.round((weighted / total) * 100)
    }, [competitiveCounts.done, competitiveCounts.partial])
    const itchPipelineCounts = useMemo(() => {
        const totals = { done: 0, partial: 0, todo: 0 }
        for (const item of ITCH_PIPELINE_CHECKLIST) {
            if (Object.prototype.hasOwnProperty.call(totals, item.status)) totals[item.status] += 1
        }
        return totals
    }, [])
    const itchLicenseCounts = useMemo(() => {
        const totals = { verified: 0, pending: 0 }
        for (const item of ITCH_3D_ASSET_SHORTLIST) {
            if (item.licenseStatus === 'verified') totals.verified += 1
            else totals.pending += 1
        }
        return totals
    }, [])
    const itchEngineCounts = useMemo(() => {
        const totals = { prepared: 0, queued: 0 }
        for (const item of ITCH_3D_ASSET_SHORTLIST) {
            if (item.engineStatus === 'prepared') totals.prepared += 1
            else totals.queued += 1
        }
        return totals
    }, [])
    const filteredPreviewAssetOptions = useMemo(() => {
        const query = assetSearch.trim().toLowerCase()
        const filtered = query
            ? ITCH_3D_ASSET_SHORTLIST.filter(
                  (item) => item.title.toLowerCase().includes(query) || item.creator.toLowerCase().includes(query)
              )
            : ITCH_3D_ASSET_SHORTLIST
        return filtered.slice(0, 80)
    }, [assetSearch])
    const selectedPreviewAsset = useMemo(
        () => filteredPreviewAssetOptions.find((item) => item.id === selectedPreviewAssetId) || null,
        [filteredPreviewAssetOptions, selectedPreviewAssetId]
    )
    const unityImportManifest = useMemo(
        () => buildUnityImportManifest({ scene, presetId: scenePresetId, previewAssets, outputResolution }),
        [outputResolution, previewAssets, scene, scenePresetId]
    )
    const unrealImportManifest = useMemo(
        () => buildUnrealImportManifest({ scene, presetId: scenePresetId, previewAssets, outputResolution }),
        [outputResolution, previewAssets, scene, scenePresetId]
    )

    useEffect(() => {
        const canvas = canvasWrapperRef.current?.querySelector('canvas')
        if (canvas) canvasNodeRef.current = canvas
    }, [scenePresetId, viewportQuality])

    useEffect(() => {
        return () => {
            if (recordedClipUrl) URL.revokeObjectURL(recordedClipUrl)
        }
    }, [recordedClipUrl])
    useEffect(() => {
        previewAssetsRef.current = previewAssets
    }, [previewAssets])
    useEffect(() => {
        if (!filteredPreviewAssetOptions.length) {
            setSelectedPreviewAssetId('')
            return
        }
        if (!filteredPreviewAssetOptions.some((item) => item.id === selectedPreviewAssetId)) {
            setSelectedPreviewAssetId(filteredPreviewAssetOptions[0].id)
        }
    }, [filteredPreviewAssetOptions, selectedPreviewAssetId])
    useEffect(() => {
        return () => {
            for (const item of previewAssetsRef.current) {
                if (typeof item.modelUrl === 'string' && item.modelUrl.startsWith('blob:')) URL.revokeObjectURL(item.modelUrl)
            }
        }
    }, [])
    useEffect(() => {
        selectedLayerIdRef.current = selectedLayerId
    }, [selectedLayerId])
    useEffect(() => {
        sceneDurationRef.current = scene.duration
    }, [scene.duration])
    useEffect(() => {
        controlSessionRef.current = controlSession
    }, [controlSession])
    useEffect(() => {
        if (controlProtocol !== 'midi') return
        let active = true
        listMidiInputs().then((inputs) => {
            if (!active) return
            setMidiInputOptions(inputs)
            setMidiInputId((prev) => {
                if (prev === 'auto') return prev
                if (inputs.some((item) => item.id === prev)) return prev
                return 'auto'
            })
        })
        return () => {
            active = false
        }
    }, [controlProtocol])
    useEffect(() => {
        return () => {
            if (controlSessionRef.current?.sessionId) {
                disconnectLiveControl({ sessionId: controlSessionRef.current.sessionId })
            }
        }
    }, [])

    const log = (message) => setBridgeLogs((prev) => [`${new Date().toLocaleTimeString()} ${message}`, ...prev].slice(0, 12))
    const logControl = (message) => setControlLogs((prev) => [`${new Date().toLocaleTimeString()} ${message}`, ...prev].slice(0, 14))

    const setSelectedLayerValue = (value01) => {
        const normalized = clamp(value01, 0, 1)
        const keyframeTime = Number(playhead[0].toFixed(2))
        setScene((prev) => ({
            ...prev,
            layers: prev.layers.map((layer) => {
                if (layer.id !== selectedLayerIdRef.current) return layer
                const keyframes = Array.isArray(layer.keyframes) ? [...layer.keyframes] : []
                if (keyframes.length) {
                    keyframes[0] = {
                        ...keyframes[0],
                        t: keyframeTime,
                        v: Number(normalized.toFixed(3)),
                    }
                } else {
                    keyframes.push({
                        id: makeId('kf'),
                        t: keyframeTime,
                        v: Number(normalized.toFixed(3)),
                    })
                }
                return { ...layer, keyframes }
            }),
        }))
    }

    const toggleSelectedLayer = () => {
        setScene((prev) => ({
            ...prev,
            layers: prev.layers.map((layer) => {
                if (layer.id !== selectedLayerIdRef.current) return layer
                return { ...layer, visible: layer.visible === false }
            }),
        }))
    }

    const addCueKeyframeAtPlayhead = (value01 = 1) => {
        const normalized = clamp(value01, 0, 1)
        const cueTime = Number(playhead[0].toFixed(2))
        setScene((prev) => ({
            ...prev,
            layers: prev.layers.map((layer) => {
                if (layer.id !== selectedLayerIdRef.current) return layer
                const keyframes = Array.isArray(layer.keyframes) ? [...layer.keyframes] : []
                keyframes.push({
                    id: makeId('kf'),
                    t: cueTime,
                    v: Number(normalized.toFixed(3)),
                })
                return { ...layer, keyframes }
            }),
        }))
    }

    const applyLiveControlMessage = (message) => {
        if (!message || typeof message !== 'object') return

        if (message.protocol === 'midi') {
            if (midiProfileId === 'open-turntable') {
                if (message.messageType === 'cc' && message.controller === OPEN_TURNTABLE_MAP.jogCc) {
                    const jogDelta = clamp(Math.round(Number(message.value) - 64), -63, 63)
                    if (Number.isFinite(jogDelta) && jogDelta !== 0) {
                        const duration = Math.max(1, Number(sceneDurationRef.current) || 1)
                        setPlayhead((prev) => {
                            const previous = Array.isArray(prev) ? Number(prev[0]) || 0 : 0
                            const next = clamp(Number((previous + jogDelta * 0.08).toFixed(2)), 0, duration)
                            return [next]
                        })
                        setTurntableState((prev) => ({
                            ...prev,
                            jogDelta,
                            lastSignalAt: new Date().toISOString(),
                        }))
                        logControl(`Open Turntable CC0x21 jog -> delta ${jogDelta}`)
                    }
                    return
                }

                if (message.messageType === 'cc' && message.controller === OPEN_TURNTABLE_MAP.tempoCc) {
                    const normalized = toNormalizedValue(message.normalized ?? message.value)
                    if (normalized == null) return
                    const fps = Math.round(24 + normalized * 96)
                    setScene((prev) => ({ ...prev, fps }))
                    setTurntableState((prev) => ({
                        ...prev,
                        tempoNormalized: normalized,
                        lastSignalAt: new Date().toISOString(),
                    }))
                    logControl(`Open Turntable CC0x19 tempo -> scene FPS ${fps}`)
                    return
                }

                if (message.messageType === 'cc' && message.controller === OPEN_TURNTABLE_MAP.volumeCc) {
                    const normalized = toNormalizedValue(message.normalized ?? message.value)
                    if (normalized == null) return
                    setSelectedLayerValue(normalized)
                    setTurntableState((prev) => ({
                        ...prev,
                        volumeNormalized: normalized,
                        lastSignalAt: new Date().toISOString(),
                    }))
                    logControl(`Open Turntable CC0x20 volume -> selected-layer value ${normalized.toFixed(2)}`)
                    return
                }

                if (message.messageType === 'note_on' && message.note === OPEN_TURNTABLE_MAP.playNote) {
                    toggleSelectedLayer()
                    setTurntableState((prev) => ({
                        ...prev,
                        playing: !prev.playing,
                        lastSignalAt: new Date().toISOString(),
                    }))
                    logControl('Open Turntable Note0x0B play -> toggled selected layer visibility')
                    return
                }

                if (message.messageType === 'note_on' && message.note === OPEN_TURNTABLE_MAP.cueNote) {
                    const cueValue = Number(turntableState.volumeNormalized) || 1
                    addCueKeyframeAtPlayhead(cueValue)
                    setTurntableState((prev) => ({
                        ...prev,
                        cueCount: prev.cueCount + 1,
                        lastSignalAt: new Date().toISOString(),
                    }))
                    logControl('Open Turntable Note0x0C cue -> added keyframe at playhead')
                    return
                }
                return
            }

            if (message.messageType === 'cc' && (message.controller === 1 || message.controller === 74)) {
                const normalized = toNormalizedValue(message.normalized ?? message.value)
                if (normalized == null) return
                const duration = Math.max(1, Number(sceneDurationRef.current) || 1)
                const nextPlayhead = Number((duration * normalized).toFixed(2))
                setPlayhead([nextPlayhead])
                logControl(`MIDI CC${message.controller} -> playhead ${nextPlayhead}s`)
                return
            }

            if (message.messageType === 'cc' && (message.controller === 7 || message.controller === 11)) {
                const normalized = toNormalizedValue(message.normalized ?? message.value)
                if (normalized == null) return
                setSelectedLayerValue(normalized)
                logControl(`MIDI CC${message.controller} -> selected layer value ${normalized.toFixed(2)}`)
                return
            }

            if (message.messageType === 'note_on' && message.note === 36) {
                toggleSelectedLayer()
                logControl('MIDI note C1 -> toggled selected layer visibility')
            }
            return
        }

        if (message.protocol !== 'osc' || message.messageType !== 'incoming') return
        const payload = message.payload
        if (!payload || typeof payload !== 'object') return

        const address = String(payload.address || '')
        const firstArg = Array.isArray(payload.args) ? payload.args[0] : payload.value
        const normalized = toNormalizedValue(firstArg)

        if (address === '/vfx/playhead') {
            if (normalized == null) return
            const duration = Math.max(1, Number(sceneDurationRef.current) || 1)
            const nextPlayhead = Number((duration * normalized).toFixed(2))
            setPlayhead([nextPlayhead])
            logControl(`OSC ${address} -> playhead ${nextPlayhead}s`)
            return
        }

        if (address === '/vfx/layer/value') {
            if (normalized == null) return
            setSelectedLayerValue(normalized)
            logControl(`OSC ${address} -> selected layer value ${normalized.toFixed(2)}`)
            return
        }

        if (address === '/vfx/layer/toggle') {
            toggleSelectedLayer()
            logControl(`OSC ${address} -> toggled selected layer visibility`)
        }
    }

    const addLayer = () => {
        if (!canUseEditor) return
        const layer = { id: makeId('layer'), name: newLayerName || `${newLayerType} layer`, type: newLayerType, visible: true, keyframes: [] }
        setScene((prev) => ({ ...prev, layers: [...prev.layers, layer] }))
        setNewLayerName('')
    }

    const addNode = () => {
        if (!canUseEditor) return
        const node = { id: makeId('node'), type: newNodeType, label: newNodeLabel || `${newNodeType} node` }
        setScene((prev) => ({ ...prev, nodes: [...prev.nodes, node] }))
        setNewNodeLabel('')
    }

    const removeLayer = (layerId) => {
        if (!canUseEditor || scene.layers.length <= 1) return
        setScene((prev) => ({ ...prev, layers: prev.layers.filter((item) => item.id !== layerId) }))
    }

    const addKeyframe = () => {
        if (!canUseEditor || !selectedLayer) return
        const frame = { id: makeId('kf'), t: Number(playhead[0].toFixed(1)), v: 1 }
        setScene((prev) => ({
            ...prev,
            layers: prev.layers.map((item) => (item.id === selectedLayer.id ? { ...item, keyframes: [...item.keyframes, frame] } : item)),
        }))
    }

    const removeNode = (nodeId) => {
        if (!canUseEditor || scene.nodes.length <= 1) return
        setScene((prev) => ({
            ...prev,
            nodes: prev.nodes.filter((node) => node.id !== nodeId),
            links: prev.links.filter((link) => link.from !== nodeId && link.to !== nodeId),
        }))
    }

    const addLink = () => {
        if (!canUseEditor || !linkFrom || !linkTo || linkFrom === linkTo) return
        if (scene.links.some((link) => link.from === linkFrom && link.to === linkTo)) return
        setScene((prev) => ({ ...prev, links: [...prev.links, { id: makeId('link'), from: linkFrom, to: linkTo }] }))
    }

    const removeLink = (linkId) => {
        if (!canUseEditor) return
        setScene((prev) => ({ ...prev, links: prev.links.filter((link) => link.id !== linkId) }))
    }
    const stageSelectedAsset = () => {
        if (!selectedPreviewAsset) return
        setPreviewAssets((prev) => [
                ...prev,
                {
                    id: makeId('preview-asset'),
                    sourceAssetId: selectedPreviewAsset.id,
                    title: selectedPreviewAsset.title,
                    creator: selectedPreviewAsset.creator,
                    previewType: inferPreviewAssetType(selectedPreviewAsset.title),
                    position: getPreviewAssetPosition(prev.length),
                    scale: 1,
                    licenseStatus: selectedPreviewAsset.licenseStatus,
                    sourceListing: selectedPreviewAsset.sourceListing,
                },
            ])
        toast.success(`${selectedPreviewAsset.title} staged in preview.`)
    }
    const removeStagedAsset = (assetId) => {
        setPreviewAssets((prev) => {
            const target = prev.find((item) => item.id === assetId)
            if (target?.modelUrl?.startsWith('blob:')) URL.revokeObjectURL(target.modelUrl)
            return prev.filter((item) => item.id !== assetId)
        })
    }
    const clearStagedAssets = () => {
        setPreviewAssets((prev) => {
            for (const item of prev) {
                if (item.modelUrl?.startsWith('blob:')) URL.revokeObjectURL(item.modelUrl)
            }
            return []
        })
    }
    const handleModelUpload = (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        const ext = file.name.split('.').pop()?.toLowerCase()
        if (!ext || !['glb', 'gltf'].includes(ext)) {
            toast.error('Only .glb and .gltf files are supported in the preview.')
            return
        }
        const modelUrl = URL.createObjectURL(file)
        setPreviewAssets((prev) => [
            ...prev,
            {
                id: makeId('preview-upload'),
                sourceAssetId: null,
                title: file.name,
                creator: 'Local Upload',
                previewType: 'model',
                position: getPreviewAssetPosition(prev.length),
                scale: 1,
                modelUrl,
                licenseStatus: 'local',
                sourceListing: 'local-upload',
            },
        ])
        toast.success(`${file.name} uploaded to preview.`)
    }

    const handleResolutionChange = (value) => {
        const option = OUTPUT_RESOLUTION_OPTIONS.find((item) => item.value === value)
        if (!option) return
        if (!hasAccess(option.feature)) {
            toast.error(lockReason(option.feature))
            return
        }
        setOutputResolution(value)
    }

    const startRecording = () => {
        if (!canRecordCinematic) {
            toast.error(lockReason('cinematicRecording'))
            return
        }
        if (recordingState === 'recording') return

        const canvas = canvasNodeRef.current
        if (!canvas || typeof canvas.captureStream !== 'function') {
            toast.error('Recording is unavailable in this browser.')
            return
        }

        const stream = canvas.captureStream(scene.fps || 60)
        const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        const mimeType = mimeCandidates.find((candidate) => window.MediaRecorder?.isTypeSupported(candidate))
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

        chunkRef.current = []
        recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) chunkRef.current.push(event.data)
        }
        recorder.onstop = () => {
            const blob = new Blob(chunkRef.current, { type: mimeType || 'video/webm' })
            if (recordedClipUrl) URL.revokeObjectURL(recordedClipUrl)
            const nextUrl = URL.createObjectURL(blob)
            setRecordedClipUrl(nextUrl)
            setRecordingState('stopped')
            stream.getTracks().forEach((track) => track.stop())
            toast.success('Recording ready for download.')
        }
        recorder.onerror = () => {
            setRecordingState('error')
            stream.getTracks().forEach((track) => track.stop())
            toast.error('Recording failed.')
        }

        recorder.start(120)
        recorderRef.current = recorder
        setRecordingState('recording')
        toast.success('Recording started.')

        window.setTimeout(() => {
            if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
        }, Math.round(clipDuration[0] * 1000))
    }

    const stopRecording = () => {
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    }

    const downloadRecording = () => {
        if (!recordedClipUrl) return
        const anchor = document.createElement('a')
        anchor.href = recordedClipUrl
        anchor.download = `${scene.name.toLowerCase().replace(/\s+/g, '-')}-${outputResolution}.webm`
        anchor.click()
    }

    const exportSceneBundle = () => {
        const payload = {
            scene: serializeSceneForRuntime(scene),
            preset: scenePresetId,
            quality: viewportQuality,
            output_resolution: outputResolution,
            preview_assets: previewAssets,
            engine_import_manifests: {
                unity: unityImportManifest,
                unreal: unrealImportManifest,
            },
            exported_at: new Date().toISOString(),
        }
        triggerDownload(`${scene.name.toLowerCase().replace(/\s+/g, '-')}-scene-bundle.json`, JSON.stringify(payload, null, 2))
    }
    const exportUnityImportQueue = () => {
        if (!previewAssets.length) {
            toast.error('Stage at least one preview asset first.')
            return
        }
        const filename = `${scene.name.toLowerCase().replace(/\s+/g, '-')}-unity-import-queue.json`
        triggerDownload(filename, JSON.stringify(unityImportManifest, null, 2))
        toast.success('Unity import queue exported.')
    }
    const exportUnrealImportQueue = () => {
        if (!previewAssets.length) {
            toast.error('Stage at least one preview asset first.')
            return
        }
        const filename = `${scene.name.toLowerCase().replace(/\s+/g, '-')}-unreal-import-queue.json`
        triggerDownload(filename, JSON.stringify(unrealImportManifest, null, 2))
        toast.success('Unreal import queue exported.')
    }
    const exportCombinedImportQueues = () => {
        if (!previewAssets.length) {
            toast.error('Stage at least one preview asset first.')
            return
        }
        const payload = {
            generated_at: new Date().toISOString(),
            scene_name: scene.name,
            preset: scenePresetId,
            unity: unityImportManifest,
            unreal: unrealImportManifest,
        }
        const filename = `${scene.name.toLowerCase().replace(/\s+/g, '-')}-engine-import-queues.json`
        triggerDownload(filename, JSON.stringify(payload, null, 2))
        toast.success('Combined import queues exported.')
    }
    const exportItchChecklist = () => {
        const payload = {
            scope: ITCH_3D_AUDIT_SCOPE,
            pipeline: ITCH_PIPELINE_CHECKLIST,
            asset_gaps: ENGINE_ASSET_GAPS,
            vertical_slice_plan: PREMADE_GAME_VERTICAL_SLICE,
            assets: ITCH_3D_ASSET_SHORTLIST,
            exported_at: new Date().toISOString(),
        }
        triggerDownload('itch-3d-asset-shortlist.json', JSON.stringify(payload, null, 2))
    }

    const connectBridge = async () => {
        if (!canUseRuntimeBridge) {
            toast.error(lockReason('runtimeBridge'))
            return
        }
        try {
            setBridgeState('connecting')
            const session = await connectRuntimeBridge({ target: bridgeTarget, endpoint: bridgeEndpoint, allowMockFallback: allowMock })
            setBridgeSession(session)
            setBridgeState('connected')
            log(`connected ${session.mode}`)
        } catch (error) {
            setBridgeState('error')
            log(error instanceof Error ? error.message : 'connect failed')
        }
    }

    const syncBridge = async () => {
        if (!canUseRuntimeBridge || !bridgeSession) return
        setBridgeState('syncing')
        const result = await syncRuntimeScene({ sessionId: bridgeSession.sessionId, target: bridgeTarget, endpoint: bridgeEndpoint, scene })
        setBridgeState('connected')
        log(`sync ${result.mode} ${result.payloadHash}`)
    }

    const disconnectBridge = async () => {
        if (!bridgeSession) return
        await disconnectRuntimeBridge({ sessionId: bridgeSession.sessionId })
        setBridgeSession(null)
        setBridgeState('disconnected')
        log('disconnected')
    }

    const connectLiveControl = async () => {
        if (!canUseRuntimeBridge) {
            toast.error(lockReason('runtimeBridge'))
            return
        }

        try {
            if (controlSession?.sessionId) {
                await disconnectLiveControl({ sessionId: controlSession.sessionId })
                setControlSession(null)
            }
            setControlState('connecting')
            if (controlProtocol === 'midi') {
                const session = await connectMidiControl({
                    inputId: midiInputId === 'auto' ? undefined : midiInputId,
                    allowMockFallback: controlAllowMock,
                    onMessage: applyLiveControlMessage,
                })
                setControlSession(session)
                setControlState('connected')
                setMidiInputOptions(Array.isArray(session.inputs) ? session.inputs : midiInputOptions)
                if (session.selectedInputId) setMidiInputId(session.selectedInputId)
                logControl(`connected MIDI ${session.mode}${session.selectedInputName ? ` (${session.selectedInputName})` : ''}`)
                if (session.reason) logControl(session.reason)
                return
            }

            const session = await connectOscControl({
                endpoint: controlEndpoint,
                allowMockFallback: controlAllowMock,
                onMessage: applyLiveControlMessage,
            })
            setControlSession(session)
            setControlState('connected')
            logControl(`connected OSC ${session.mode}`)
            if (session.reason) logControl(session.reason)
        } catch (error) {
            setControlState('error')
            logControl(error instanceof Error ? error.message : 'control connect failed')
        }
    }

    const disconnectLiveControlSession = async () => {
        if (!controlSession) return
        await disconnectLiveControl({ sessionId: controlSession.sessionId })
        setControlSession(null)
        setControlState('disconnected')
        logControl('control session disconnected')
    }

    const sendOscPlayheadTest = async () => {
        if (!controlSession || controlProtocol !== 'osc') return
        const duration = Math.max(1, Number(scene.duration) || 1)
        const normalized = Number((playhead[0] / duration).toFixed(4))
        const result = await sendOscControl({
            sessionId: controlSession.sessionId,
            address: '/vfx/playhead',
            args: [normalized],
        })
        if (!result.ok) {
            toast.error(result.error || 'OSC send failed')
            return
        }
        logControl(`OSC test sent /vfx/playhead ${normalized}`)
    }

    return (
        <>
            <Helmet>
                <title>3D Engine - VFX Studios</title>
            </Helmet>
            <div className='space-y-8'>
                <div className='text-center space-y-3'>
                    <Badge variant='outline'>Unreal + Unity Live Bridge</Badge>
                    <h1 className='text-4xl font-bold text-white'>3D Scene Generator and Editor</h1>
                    <div className='flex justify-center gap-2 flex-wrap'>
                        <Badge variant='outline' className='border-cyan-400/40 text-cyan-200'>
                            Plan: {PLAN_LABELS[effectivePlan]}
                        </Badge>
                        {isAdmin && (
                            <Badge variant='outline' className='border-fuchsia-400/45 text-fuchsia-200'>
                                <ShieldCheck size={13} className='mr-1.5' />
                                Admin Override
                            </Badge>
                        )}
                    </div>
                </div>

                <Card className='bg-[#0a1326]/80 border-cyan-400/25'>
                    <CardHeader>
                        <CardTitle className='text-cyan-100'>Prompt Review Checklist (Unreal/Unity)</CardTitle>
                        <CardDescription className='text-slate-300'>
                            Reviewed from saved chat prompts and prior sessions. Godot scope excluded by request.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className='space-y-4'>
                        <div className='flex flex-wrap gap-2'>
                            <Badge variant='outline' className='border-emerald-400/45 text-emerald-200 bg-emerald-500/10'>
                                Done {promptAuditCounts.done}
                            </Badge>
                            <Badge variant='outline' className='border-amber-400/45 text-amber-200 bg-amber-500/10'>
                                Partial {promptAuditCounts.partial}
                            </Badge>
                            <Badge variant='outline' className='border-rose-400/45 text-rose-200 bg-rose-500/10'>
                                Not Done {promptAuditCounts.todo}
                            </Badge>
                        </div>
                        <div className='rounded-md border border-cyan-400/20 bg-[#081125] px-3 py-2 text-xs text-slate-300'>
                            <p>Scope window: {PROMPT_AUDIT_SCOPE.reviewWindowStart} to {PROMPT_AUDIT_SCOPE.reviewWindowEnd}</p>
                            <p>Generated: {PROMPT_AUDIT_SCOPE.generatedAt}</p>
                            <p>Exclusions: {PROMPT_AUDIT_SCOPE.exclusions.join(' | ')}</p>
                        </div>
                        <div className='space-y-2 max-h-[520px] overflow-y-auto pr-1'>
                            {PROMPT_AUDIT_ITEMS.map((item) => {
                                const statusMeta = PROMPT_AUDIT_STATUS_META[item.status] || PROMPT_AUDIT_STATUS_META.todo
                                return (
                                    <div key={item.id} className='rounded-md border border-cyan-400/20 bg-[#0b1730] p-3'>
                                        <div className='flex flex-wrap items-center gap-2'>
                                            <p className='text-sm font-medium text-white'>{item.feature}</p>
                                            <Badge variant='outline' className={`ml-auto ${statusMeta.className}`}>
                                                {statusMeta.label}
                                            </Badge>
                                        </div>
                                        <p className='text-xs text-cyan-200 mt-2'>Source prompt: {item.sourcePrompt}</p>
                                        <p className='text-xs text-slate-300 mt-1'>Evidence: {item.evidence}</p>
                                        {item.nextStep && <p className='text-xs text-amber-200 mt-1'>Next step: {item.nextStep}</p>}
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>

                <Card className='bg-[#0a1326]/80 border-cyan-400/25'>
                    <CardHeader>
                        <CardTitle className='text-cyan-100'>Itch.io 3D Asset Intake Checklist</CardTitle>
                        <CardDescription className='text-slate-300'>
                            Candidate intake for premade Unreal/Unity game build using free 3D asset packs.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className='space-y-4'>
                        <div className='flex flex-wrap gap-2'>
                            <Badge variant='outline' className='border-cyan-400/40 text-cyan-200'>
                                Total Candidates {ITCH_3D_ASSET_SHORTLIST.length}
                            </Badge>
                            <Badge variant='outline' className='border-emerald-400/45 text-emerald-200 bg-emerald-500/10'>
                                Pipeline Done {itchPipelineCounts.done}
                            </Badge>
                            <Badge variant='outline' className='border-amber-400/45 text-amber-200 bg-amber-500/10'>
                                Pipeline Partial {itchPipelineCounts.partial}
                            </Badge>
                            <Badge variant='outline' className='border-rose-400/45 text-rose-200 bg-rose-500/10'>
                                Pipeline Not Done {itchPipelineCounts.todo}
                            </Badge>
                            <Badge variant='outline' className='border-emerald-400/45 text-emerald-200 bg-emerald-500/10'>
                                License Verified {itchLicenseCounts.verified}
                            </Badge>
                            <Badge variant='outline' className='border-amber-400/45 text-amber-200 bg-amber-500/10'>
                                License Pending {itchLicenseCounts.pending}
                            </Badge>
                            <Badge variant='outline' className='border-cyan-400/45 text-cyan-200 bg-cyan-500/10'>
                                Engine Prepared {itchEngineCounts.prepared}
                            </Badge>
                            <Badge variant='outline' className='border-slate-400/45 text-slate-200 bg-slate-500/10'>
                                Engine Queued {itchEngineCounts.queued}
                            </Badge>
                        </div>
                        <div className='rounded-md border border-cyan-400/20 bg-[#081125] px-3 py-2 text-xs text-slate-300 space-y-1'>
                            <p>Generated: {ITCH_3D_AUDIT_SCOPE.generatedAt}</p>
                            <p>Source: {ITCH_3D_AUDIT_SCOPE.source}</p>
                            <p>Limitation: {ITCH_3D_AUDIT_SCOPE.limitations.join(' | ')}</p>
                        </div>
                        <div className='flex flex-wrap gap-2'>
                            <Button variant='outline' onClick={exportItchChecklist}>
                                <DownloadSimple size={16} className='mr-1.5' />
                                Export Asset Checklist JSON
                            </Button>
                        </div>
                        <div className='space-y-2 max-h-[320px] overflow-y-auto pr-1'>
                            {ITCH_PIPELINE_CHECKLIST.map((item) => {
                                const statusMeta = ITCH_STATUS_META[item.status] || ITCH_STATUS_META.todo
                                return (
                                    <div key={item.id} className='rounded-md border border-cyan-400/20 bg-[#0b1730] p-3'>
                                        <div className='flex flex-wrap items-center gap-2'>
                                            <p className='text-sm font-medium text-white'>{item.step}</p>
                                            <Badge variant='outline' className={`ml-auto ${statusMeta.className}`}>
                                                {statusMeta.label}
                                            </Badge>
                                        </div>
                                        <p className='text-xs text-slate-300 mt-1'>{item.detail}</p>
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>

                <Card className='bg-[#0a1326]/80 border-cyan-400/25'>
                    <CardHeader>
                        <CardTitle className='text-cyan-100'>Asset Gaps and Premade Game Plan</CardTitle>
                        <CardDescription className='text-slate-300'>
                            What still needs to be added from the asset library to hit the Unreal/Unity cinematic target.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className='grid gap-4 lg:grid-cols-2'>
                        <div className='space-y-2'>
                            {ENGINE_ASSET_GAPS.map((item) => (
                                <div key={item.id} className='rounded-md border border-cyan-400/20 bg-[#0b1730] p-3'>
                                    <div className='flex flex-wrap items-center gap-2'>
                                        <p className='text-sm font-medium text-white'>{item.area}</p>
                                        <Badge variant='outline' className='ml-auto border-slate-400/45 text-slate-200 bg-slate-500/10'>
                                            Need {item.needed}
                                        </Badge>
                                    </div>
                                    <p className='text-xs text-cyan-200 mt-1'>Current: {item.have}</p>
                                    <p className='text-xs text-slate-300 mt-1'>{item.note}</p>
                                </div>
                            ))}
                        </div>
                        <div className='space-y-2'>
                            {PREMADE_GAME_VERTICAL_SLICE.map((item) => {
                                const statusMeta = ITCH_STATUS_META[item.status] || ITCH_STATUS_META.todo
                                return (
                                    <div key={item.id} className='rounded-md border border-cyan-400/20 bg-[#0b1730] p-3'>
                                        <div className='flex flex-wrap items-center gap-2'>
                                            <p className='text-sm font-medium text-white'>{item.step}</p>
                                            <Badge variant='outline' className={`ml-auto ${statusMeta.className}`}>
                                                {statusMeta.label}
                                            </Badge>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>

                <Card className='bg-[#0a1326]/80 border-cyan-400/25'>
                    <CardHeader>
                        <CardTitle className='text-cyan-100'>Top-Rated Free 3D Asset Candidates</CardTitle>
                        <CardDescription className='text-slate-300'>
                            Review shortlist before download/import. Godot work remains excluded.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className='space-y-2 max-h-[460px] overflow-y-auto pr-1'>
                        {ITCH_3D_ASSET_SHORTLIST.map((item) => (
                            <div key={item.id} className='rounded-md border border-cyan-400/20 bg-[#0b1730] p-3'>
                                <div className='flex flex-wrap items-center gap-2'>
                                    <p className='text-sm font-medium text-white'>{item.title}</p>
                                    <Badge
                                        variant='outline'
                                        className={`ml-auto ${
                                            item.licenseStatus === 'verified'
                                                ? 'border-emerald-400/45 text-emerald-200 bg-emerald-500/10'
                                                : 'border-amber-400/45 text-amber-200 bg-amber-500/10'
                                        }`}
                                    >
                                        License {item.licenseStatus}
                                    </Badge>
                                    <Badge
                                        variant='outline'
                                        className={`${
                                            item.engineStatus === 'prepared'
                                                ? 'border-cyan-400/45 text-cyan-200 bg-cyan-500/10'
                                                : 'border-slate-400/45 text-slate-200 bg-slate-500/10'
                                        }`}
                                    >
                                        {item.engineStatus}
                                    </Badge>
                                </div>
                                <p className='text-xs text-cyan-200 mt-1'>Creator: {item.creator}</p>
                                <p className='text-xs text-slate-300 mt-1'>Source listing: {item.sourceListing}</p>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {!canUseEditor && (
                    <FeatureLock
                        title='3D Scene Editor Locked'
                        description='The full scene generator, keyframe authoring, and runtime bridge are protected behind a Pro subscription.'
                        requiredPlan='Pro'
                    />
                )}

                <Card className='bg-[#0a1326]/80 border-cyan-400/25'>
                    <CardHeader>
                        <CardTitle className='text-cyan-100'>Build Progress</CardTitle>
                        <CardDescription className='text-slate-300'>Prompt-audit weighted completion</CardDescription>
                    </CardHeader>
                    <CardContent className='space-y-3'>
                        <Progress value={promptAuditProgress} />
                        <p className='text-xs text-cyan-200'>{promptAuditProgress}% complete</p>
                        {[
                            { label: 'Scene creation canvas (timeline + layers)', status: 'done' },
                            { label: 'Node editor + keyframe authoring', status: 'done' },
                            { label: 'Runtime preview bridge (UE/Unity sync)', status: 'done' },
                            { label: 'Live control ingress (MIDI + OSC)', status: 'done' },
                            { label: 'Paid-model credit enforcement', status: 'done' },
                            { label: 'Age verification compliance gate', status: 'done' },
                            { label: 'Futuristic icon pack migration', status: 'done' },
                        ].map((item) => (
                            <div key={item.label} className='flex items-center gap-2 text-sm'>
                                <CheckCircle size={16} className='text-emerald-300' />
                                <span className='text-slate-200'>{item.label}</span>
                                <Badge
                                    variant='outline'
                                    className={`ml-auto ${(PROMPT_AUDIT_STATUS_META[item.status] || PROMPT_AUDIT_STATUS_META.todo).className}`}
                                >
                                    {(PROMPT_AUDIT_STATUS_META[item.status] || PROMPT_AUDIT_STATUS_META.todo).label}
                                </Badge>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card className='bg-[#0a1326]/80 border-cyan-400/25'>
                    <CardHeader>
                        <CardTitle className='text-cyan-100'>Top VJ Competitive Matrix</CardTitle>
                        <CardDescription className='text-slate-300'>{VJ_COMPETITIVE_SCOPE.note}</CardDescription>
                    </CardHeader>
                    <CardContent className='space-y-4'>
                        <div className='flex flex-wrap gap-2'>
                            <Badge variant='outline' className='border-emerald-400/45 text-emerald-200 bg-emerald-500/10'>
                                Done {competitiveCounts.done}
                            </Badge>
                            <Badge variant='outline' className='border-amber-400/45 text-amber-200 bg-amber-500/10'>
                                Partial {competitiveCounts.partial}
                            </Badge>
                            <Badge variant='outline' className='border-rose-400/45 text-rose-200 bg-rose-500/10'>
                                Not Done {competitiveCounts.todo}
                            </Badge>
                            <Badge variant='outline' className='border-cyan-400/45 text-cyan-200 bg-cyan-500/10'>
                                Parity Score {competitiveProgress}%
                            </Badge>
                        </div>
                        <Progress value={competitiveProgress} />
                        <div className='rounded-md border border-cyan-400/20 bg-[#081125] px-3 py-2 text-xs text-slate-300 space-y-1'>
                            <p>Generated: {VJ_COMPETITIVE_SCOPE.generatedAt}</p>
                            <p>Baseline products: {VJ_COMPETITIVE_SCOPE.baselineProducts.join(', ')}</p>
                        </div>
                        <div className='flex flex-wrap gap-2'>
                            {VJ_COMPETITIVE_SOURCES.map((source) => (
                                <Button key={source.id} variant='outline' size='sm' asChild>
                                    <a href={source.url} target='_blank' rel='noopener noreferrer'>
                                        <ArrowSquareOut size={14} className='mr-1.5' />
                                        {source.label}
                                    </a>
                                </Button>
                            ))}
                        </div>
                        <div className='space-y-2 max-h-[380px] overflow-y-auto pr-1'>
                            {VJ_COMPETITIVE_FEATURES.map((feature) => {
                                const statusMeta = PROMPT_AUDIT_STATUS_META[feature.status] || PROMPT_AUDIT_STATUS_META.todo
                                return (
                                    <div key={feature.id} className='rounded-md border border-cyan-400/20 bg-[#0b1730] p-3'>
                                        <div className='flex flex-wrap items-center gap-2'>
                                            <p className='text-sm font-medium text-white'>{feature.capability}</p>
                                            <Badge variant='outline' className={`ml-auto ${statusMeta.className}`}>
                                                {statusMeta.label}
                                            </Badge>
                                        </div>
                                        <p className='text-xs text-cyan-200 mt-1'>Top tools: {feature.topTools}</p>
                                        <p className='text-xs text-slate-300 mt-1'>Evidence: {feature.evidence}</p>
                                        {feature.nextStep && <p className='text-xs text-amber-200 mt-1'>Next step: {feature.nextStep}</p>}
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>

                <Card className='bg-[#0b1730] border-cyan-400/20'>
                    <CardHeader>
                        <CardTitle className='text-cyan-100'>Procedural Scene Preview</CardTitle>
                        <CardDescription className='text-slate-300'>
                            {SCENE_PRESETS.find((preset) => preset.id === scenePresetId)?.description}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className='space-y-4'>
                        <div className='grid gap-3 md:grid-cols-4'>
                            <Select value={scenePresetId} onValueChange={setScenePresetId}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SCENE_PRESETS.map((preset) => (
                                        <SelectItem key={preset.id} value={preset.id}>
                                            {preset.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={viewportQuality} onValueChange={setViewportQuality}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value='performance'>Performance</SelectItem>
                                    <SelectItem value='quality'>Quality</SelectItem>
                                    <SelectItem value='cinematic'>Cinematic</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={outputResolution} onValueChange={handleResolutionChange}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {OUTPUT_RESOLUTION_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label} ({option.value})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <div className='rounded-md border border-cyan-400/20 bg-[#081125] px-3 py-2 text-sm text-cyan-200'>
                                FPS Target: {scene.fps}
                            </div>
                        </div>

                        <div className='grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]'>
                            <div className='space-y-4'>
                                <div className='rounded-md border border-cyan-400/20 bg-[#081125] p-3 space-y-3'>
                                    <p className='text-sm text-cyan-100 font-medium'>Viewport</p>
                                    <Suspense
                                        fallback={
                                            <div className='h-64 rounded-lg border border-cyan-400/20 bg-[#081125] p-4 text-sm text-slate-400'>
                                                Loading 3D viewport...
                                            </div>
                                        }
                                    >
                                        <SceneViewport3D
                                            presetId={scenePresetId}
                                            quality={viewportQuality}
                                            canvasRef={canvasWrapperRef}
                                            sceneAssets={previewAssets}
                                        />
                                    </Suspense>
                                </div>
                                <div className='rounded-md border border-cyan-400/20 bg-[#081125] p-3 space-y-3'>
                                    <div className='grid gap-3 md:grid-cols-3'>
                                        <div className='space-y-2'>
                                            <Label>Recording Clip Length: {clipDuration[0]}s</Label>
                                            <Slider value={clipDuration} onValueChange={setClipDuration} min={2} max={30} step={1} />
                                        </div>
                                        <div className='md:col-span-2 flex flex-wrap items-end gap-2'>
                                            <Button onClick={startRecording} disabled={!canRecordCinematic || recordingState === 'recording'}>
                                                <Record size={16} className='mr-1.5' />
                                                Record
                                            </Button>
                                            <Button variant='outline' onClick={stopRecording} disabled={recordingState !== 'recording'}>
                                                <Stop size={16} className='mr-1.5' />
                                                Stop
                                            </Button>
                                            <Button variant='outline' onClick={downloadRecording} disabled={!recordedClipUrl}>
                                                Download Clip
                                            </Button>
                                            <Button variant='ghost' onClick={exportSceneBundle} disabled={!canUseEditor}>
                                                <DownloadSimple size={16} className='mr-1.5' />
                                                Export Scene Bundle
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className='space-y-4'>
                                <div className='rounded-md border border-cyan-400/20 bg-[#081125] p-3 space-y-3'>
                                    <p className='text-sm text-cyan-100 font-medium'>Preview Asset Staging</p>
                                    <div className='grid gap-2'>
                                        <Input
                                            value={assetSearch}
                                            onChange={(event) => setAssetSearch(event.target.value)}
                                            placeholder='Search shortlist assets'
                                        />
                                        <Select value={selectedPreviewAssetId} onValueChange={setSelectedPreviewAssetId}>
                                            <SelectTrigger>
                                                <SelectValue placeholder='Choose asset' />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {filteredPreviewAssetOptions.map((item) => (
                                                    <SelectItem key={item.id} value={item.id}>
                                                        {item.title} - {item.creator}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className='flex flex-wrap gap-2'>
                                        <Button variant='outline' onClick={stageSelectedAsset} disabled={!selectedPreviewAsset}>
                                            Add Shortlist Asset To Preview
                                        </Button>
                                        <Button variant='outline' onClick={clearStagedAssets} disabled={!previewAssets.length}>
                                            Clear Preview Assets
                                        </Button>
                                        <Input type='file' accept='.glb,.gltf' onChange={handleModelUpload} className='max-w-xs' />
                                    </div>
                                    <div className='flex flex-wrap gap-2'>
                                        <Button variant='outline' onClick={exportUnityImportQueue} disabled={!previewAssets.length}>
                                            Export Unity Import Queue
                                        </Button>
                                        <Button variant='outline' onClick={exportUnrealImportQueue} disabled={!previewAssets.length}>
                                            Export Unreal Import Queue
                                        </Button>
                                        <Button variant='ghost' onClick={exportCombinedImportQueues} disabled={!previewAssets.length}>
                                            Export Combined Queues
                                        </Button>
                                    </div>
                                    <div className='max-h-64 overflow-y-auto space-y-1 pr-1'>
                                        {previewAssets.length === 0 && <p className='text-xs text-slate-400'>No staged preview assets yet.</p>}
                                        {previewAssets.map((asset) => (
                                            <div key={asset.id} className='rounded border border-cyan-500/20 bg-[#0b1730] px-2 py-1.5 text-xs'>
                                                <div className='flex items-center gap-2'>
                                                    <span className='text-slate-100'>{asset.title}</span>
                                                    <Badge
                                                        variant='outline'
                                                        className={`ml-auto ${
                                                            asset.licenseStatus === 'verified'
                                                                ? 'border-emerald-400/45 text-emerald-200 bg-emerald-500/10'
                                                                : 'border-amber-400/45 text-amber-200 bg-amber-500/10'
                                                        }`}
                                                    >
                                                        {asset.licenseStatus}
                                                    </Badge>
                                                    <Button variant='ghost' size='sm' className='h-6 px-2' onClick={() => removeStagedAsset(asset.id)}>
                                                        Remove
                                                    </Button>
                                                </div>
                                                <p className='text-[11px] text-slate-400'>
                                                    {asset.creator} | {asset.previewType}
                                                </p>
                                                <p className='text-[10px] text-cyan-300'>Unity: {toUnityImportPath(asset)}</p>
                                                <p className='text-[10px] text-fuchsia-300'>Unreal: {toUnrealImportPath(asset)}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Tabs defaultValue='editor'>
                    <TabsList className='grid w-full grid-cols-2 bg-[#091327]'>
                        <TabsTrigger value='editor'>Scene Editor</TabsTrigger>
                        <TabsTrigger value='targets'>Runtime Targets</TabsTrigger>
                    </TabsList>
                    <TabsContent value='editor' className='space-y-6'>
                        {!canUseEditor && (
                            <FeatureLock
                                title='Scene Authoring Locked'
                                description='Upgrade to Pro to unlock timeline editing, node graph authoring, and scene export controls.'
                                requiredPlan='Pro'
                            />
                        )}
                        {canUseEditor && (
                            <>
                                <Card className='bg-[#0b1730] border-cyan-400/20'>
                                    <CardHeader>
                                        <CardTitle className='text-cyan-100'>Timeline + Layers</CardTitle>
                                    </CardHeader>
                                    <CardContent className='grid gap-4 lg:grid-cols-2'>
                                        <div className='space-y-3'>
                                            <div className='grid grid-cols-2 gap-2'>
                                                <Select value={newLayerType} onValueChange={setNewLayerType}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {LAYER_TYPES.map((item) => (
                                                            <SelectItem key={item} value={item}>
                                                                {item}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <Input value={newLayerName} onChange={(event) => setNewLayerName(event.target.value)} placeholder='Layer name' />
                                            </div>
                                            <Button className='w-full' onClick={addLayer}>
                                                Add Layer
                                            </Button>
                                            <div className='space-y-2 max-h-56 overflow-y-auto'>
                                                {scene.layers.map((layer) => (
                                                    <div
                                                        key={layer.id}
                                                        className={`rounded-md border px-3 py-2 ${selectedLayerId === layer.id ? 'border-cyan-300/50 bg-cyan-500/15' : 'border-cyan-500/20 bg-[#0a152d]'}`}
                                                    >
                                                        <div className='flex items-center justify-between gap-2'>
                                                            <button type='button' className='text-left' onClick={() => setSelectedLayerId(layer.id)}>
                                                                <p className='text-sm text-white'>{layer.name}</p>
                                                                <p className='text-xs text-slate-400'>{layer.type}</p>
                                                            </button>
                                                            <Button variant='ghost' size='sm' className='text-red-300' onClick={() => removeLayer(layer.id)}>
                                                                Remove
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className='space-y-3'>
                                            <Label>Playhead {playhead[0].toFixed(1)}s</Label>
                                            <Slider value={playhead} onValueChange={setPlayhead} min={0} max={Math.max(scene.duration, 10)} step={0.1} />
                                            <Button onClick={addKeyframe}>Add Keyframe To Selected Layer</Button>
                                            <div className='rounded-md border border-cyan-400/20 bg-[#081125] p-3 text-xs text-slate-300 max-h-52 overflow-y-auto'>
                                                {(selectedLayer?.keyframes || []).length === 0 && <p>No keyframes on selected layer.</p>}
                                                {(selectedLayer?.keyframes || []).map((frame) => (
                                                    <div key={frame.id} className='flex justify-between py-1 border-b border-cyan-500/10'>
                                                        <span>{frame.t}s</span>
                                                        <span>value {frame.v}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className='bg-[#0b1730] border-cyan-400/20'>
                                    <CardHeader>
                                        <CardTitle className='text-cyan-100'>Node Graph</CardTitle>
                                    </CardHeader>
                                    <CardContent className='grid gap-4 lg:grid-cols-2'>
                                        <div className='space-y-3'>
                                            <div className='grid grid-cols-2 gap-2'>
                                                <Select value={newNodeType} onValueChange={setNewNodeType}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {NODE_TYPES.map((item) => (
                                                            <SelectItem key={item} value={item}>
                                                                {item}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <Input value={newNodeLabel} onChange={(event) => setNewNodeLabel(event.target.value)} placeholder='Node label' />
                                            </div>
                                            <Button className='w-full' onClick={addNode}>
                                                Add Node
                                            </Button>
                                            <div className='space-y-2 max-h-56 overflow-y-auto'>
                                                {scene.nodes.map((node) => (
                                                    <div
                                                        key={node.id}
                                                        className={`rounded-md border px-3 py-2 ${selectedNodeId === node.id ? 'border-cyan-300/50 bg-cyan-500/15' : 'border-cyan-500/20 bg-[#0a152d]'}`}
                                                    >
                                                        <div className='flex items-center justify-between gap-2'>
                                                            <button type='button' className='text-left' onClick={() => setSelectedNodeId(node.id)}>
                                                                <p className='text-sm text-white'>{node.label}</p>
                                                                <p className='text-xs text-slate-400'>{node.type}</p>
                                                            </button>
                                                            <Button variant='ghost' size='sm' className='text-red-300' onClick={() => removeNode(node.id)}>
                                                                Remove
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className='space-y-3'>
                                            <Label>Links</Label>
                                            <div className='grid grid-cols-2 gap-2'>
                                                <Select value={linkFrom} onValueChange={setLinkFrom}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {scene.nodes.map((node) => (
                                                            <SelectItem key={node.id} value={node.id}>
                                                                {node.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <Select value={linkTo} onValueChange={setLinkTo}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {scene.nodes.map((node) => (
                                                            <SelectItem key={node.id} value={node.id}>
                                                                {node.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <Button onClick={addLink}>Add Link</Button>
                                            <div className='rounded-md border border-cyan-400/20 bg-[#081125] p-3 text-xs text-slate-300 max-h-52 overflow-y-auto'>
                                                {scene.links.map((link) => (
                                                    <div key={link.id} className='flex items-center justify-between py-1 border-b border-cyan-500/10'>
                                                        <span>
                                                            {link.from} -&gt; {link.to}
                                                        </span>
                                                        <Button variant='ghost' size='sm' onClick={() => removeLink(link.id)}>
                                                            Remove
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className='bg-[#0b1730] border-cyan-400/20'>
                                    <CardHeader>
                                        <CardTitle className='text-cyan-100'>Runtime Bridge</CardTitle>
                                        {!canUseRuntimeBridge && <CardDescription className='text-fuchsia-200'>{lockReason('runtimeBridge')}</CardDescription>}
                                    </CardHeader>
                                    <CardContent className='space-y-4'>
                                        <div className='grid gap-2 md:grid-cols-4'>
                                            <Select value={bridgeTarget} onValueChange={(value) => { setBridgeTarget(value); setBridgeEndpoint(getDefaultRuntimeEndpoint(value)) }}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value='unreal'>Unreal Engine 5</SelectItem>
                                                    <SelectItem value='unity'>Unity 3D</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <Input className='md:col-span-2' value={bridgeEndpoint} onChange={(event) => setBridgeEndpoint(event.target.value)} />
                                            <Badge variant='outline' className='justify-center py-2'>
                                                {bridgeState}
                                            </Badge>
                                        </div>
                                        <div className='flex items-center gap-2'>
                                            <Switch checked={allowMock} onCheckedChange={setAllowMock} />
                                            <Label>Allow mock fallback if runtime listener is offline</Label>
                                        </div>
                                        <div className='flex flex-wrap gap-2'>
                                            <Button onClick={connectBridge} disabled={bridgeState === 'connecting' || !canUseRuntimeBridge}>
                                                Connect
                                            </Button>
                                            <Button variant='outline' onClick={syncBridge} disabled={!bridgeSession || !canUseRuntimeBridge}>
                                                Sync Scene
                                            </Button>
                                            <Button variant='ghost' onClick={disconnectBridge} disabled={!bridgeSession}>
                                                Disconnect
                                            </Button>
                                        </div>
                                        <div className='grid gap-3 md:grid-cols-2'>
                                            <div className='rounded-md border border-cyan-400/20 bg-[#081125] p-3 text-xs text-slate-300 max-h-40 overflow-y-auto'>
                                                {bridgeLogs.map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>)}
                                            </div>
                                            <Textarea value={payloadPreview} readOnly className='h-40 text-xs font-mono bg-[#081125]' />
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className='bg-[#0b1730] border-cyan-400/20'>
                                    <CardHeader>
                                        <CardTitle className='text-cyan-100'>Live Control Protocols (MIDI + OSC)</CardTitle>
                                        <CardDescription className='text-slate-300'>
                                            Maps external controls to scene playhead and selected layer intensity without editor tick loops.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className='space-y-4'>
                                        <div className='grid gap-2 lg:grid-cols-5'>
                                            <Select value={controlProtocol} onValueChange={setControlProtocol}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {LIVE_CONTROL_PROTOCOLS.map((item) => (
                                                        <SelectItem key={item.id} value={item.id}>
                                                            {item.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {controlProtocol === 'midi' ? (
                                                <Select value={midiInputId} onValueChange={setMidiInputId}>
                                                    <SelectTrigger className='lg:col-span-3'>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value='auto'>Auto-select first available input</SelectItem>
                                                        {midiInputOptions.map((input) => (
                                                            <SelectItem key={input.id} value={input.id}>
                                                                {input.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <Input
                                                    className='lg:col-span-3'
                                                    value={controlEndpoint}
                                                    onChange={(event) => setControlEndpoint(event.target.value)}
                                                    placeholder='ws://127.0.0.1:7010/osc'
                                                />
                                            )}
                                            <Badge variant='outline' className='justify-center py-2'>
                                                {controlState}
                                            </Badge>
                                            {controlProtocol === 'midi' && (
                                                <Select value={midiProfileId} onValueChange={setMidiProfileId}>
                                                    <SelectTrigger className='lg:col-span-4'>
                                                        <SelectValue placeholder='MIDI profile' />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {MIDI_PROFILES.map((profile) => (
                                                            <SelectItem key={profile.id} value={profile.id}>
                                                                {profile.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        </div>
                                        <div className='flex items-center gap-2'>
                                            <Switch checked={controlAllowMock} onCheckedChange={setControlAllowMock} />
                                            <Label>Allow mock fallback if protocol bridge is offline</Label>
                                        </div>
                                        <div className='flex flex-wrap gap-2'>
                                            <Button onClick={connectLiveControl} disabled={controlState === 'connecting' || !canUseRuntimeBridge}>
                                                Connect Protocol
                                            </Button>
                                            <Button
                                                variant='outline'
                                                onClick={sendOscPlayheadTest}
                                                disabled={!controlSession || controlProtocol !== 'osc'}
                                            >
                                                Send OSC Test
                                            </Button>
                                            <Button variant='ghost' onClick={disconnectLiveControlSession} disabled={!controlSession}>
                                                Disconnect
                                            </Button>
                                        </div>
                                        <div className='rounded-md border border-cyan-400/20 bg-[#081125] p-3 text-xs text-slate-300 space-y-1'>
                                            <p>MIDI mapping ({selectedMidiProfile.label}): {selectedMidiProfile.description}</p>
                                            <p>OSC mapping: /vfx/playhead, /vfx/layer/value, /vfx/layer/toggle.</p>
                                        </div>
                                        {controlProtocol === 'midi' && midiProfileId === 'open-turntable' && (
                                            <div className='rounded-md border border-fuchsia-400/25 bg-[#081125] p-3 text-xs text-slate-300 space-y-2'>
                                                <p className='text-fuchsia-200 font-medium'>Open Turntable Deck State</p>
                                                <div className='grid gap-2 md:grid-cols-2'>
                                                    <p>Play state: {turntableState.playing ? 'Playing' : 'Paused'}</p>
                                                    <p>Cue presses: {turntableState.cueCount}</p>
                                                    <p>Last jog delta: {turntableState.jogDelta}</p>
                                                    <p>Last signal: {turntableState.lastSignalAt || 'No input yet'}</p>
                                                </div>
                                                <div className='space-y-2'>
                                                    <div>
                                                        <p className='mb-1'>Tempo fader</p>
                                                        <div className='h-2 rounded bg-slate-800/80 overflow-hidden'>
                                                            <div
                                                                className='h-full bg-cyan-300'
                                                                style={{ width: `${Math.round((turntableState.tempoNormalized || 0) * 100)}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <p className='mb-1'>Volume fader</p>
                                                        <div className='h-2 rounded bg-slate-800/80 overflow-hidden'>
                                                            <div
                                                                className='h-full bg-emerald-300'
                                                                style={{ width: `${Math.round((turntableState.volumeNormalized || 0) * 100)}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                <p className='text-[11px] text-slate-400'>
                                                    Mapping source: open-turntable firmware MIDI events (cue/play notes + jog/tempo/volume CC values).
                                                </p>
                                                <Button variant='ghost' size='sm' asChild>
                                                    <a href='https://github.com/michaelpavkovic/open-turntable' target='_blank' rel='noopener noreferrer'>
                                                        <ArrowSquareOut size={14} className='mr-1.5' />
                                                        Open Turntable source
                                                    </a>
                                                </Button>
                                            </div>
                                        )}
                                        <div className='rounded-md border border-cyan-400/20 bg-[#081125] p-3 text-xs text-slate-300 max-h-44 overflow-y-auto'>
                                            {controlLogs.length === 0 && <p>No control events yet.</p>}
                                            {controlLogs.map((entry, index) => (
                                                <p key={`${entry}-${index}`}>{entry}</p>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            </>
                        )}
                    </TabsContent>
                    <TabsContent value='targets' className='space-y-6'>
                        <div className='grid gap-6 lg:grid-cols-2'>
                            {TARGETS.map((target) => (
                                <Card key={target.id} className='bg-slate-900/50 border-cyan-500/20'>
                                    <CardHeader>
                                        <CardTitle className='text-white'>{target.name}</CardTitle>
                                        <CardDescription className='text-cyan-300'>Engine-ready export mapping</CardDescription>
                                    </CardHeader>
                                    <CardContent className='space-y-3'>
                                        <div className='flex flex-wrap gap-2'>
                                            {target.formats.map((format) => (
                                                <Badge key={format} variant='outline' className='uppercase'>
                                                    {format}
                                                </Badge>
                                            ))}
                                        </div>
                                        <Button variant='outline' size='sm' asChild>
                                            <a href={target.docs} target='_blank' rel='noopener noreferrer'>
                                                <ArrowSquareOut size={16} className='mr-2' />
                                                Open docs
                                            </a>
                                        </Button>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </>
    )
}

