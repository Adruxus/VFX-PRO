import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import FeatureLock from '@/components/FeatureLock'
import BubbaDeckPanel from '@/components/BubbaDeckPanel'
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
        id: 'bubba-dj',
        label: 'BuBBa Deck',
        description:
            'Cue Note 0x0C adds a keyframe, Play Note 0x0B toggles selected layer, CC0x21 jog scrubs playhead, CC0x19 tempo remaps FPS, CC0x20 maps deck crossfader.',
    },
]

const BUBBA_DJ_MAP = {
    cueNote: 0x0c,
    playNote: 0x0b,
    jogCc: 0x21,
    tempoCc: 0x19,
    crossfaderCc: 0x20,
    lowEqCc: 0x16,
    highEqCc: 0x17,
}

const SUPPORTED_MODEL_FILE_EXTENSIONS = ['glb', 'gltf', 'fbx', 'obj']
const SUPPORTED_SPRITE_FILE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']
const SUPPORTED_PREVIEW_FILE_EXTENSIONS = [...SUPPORTED_MODEL_FILE_EXTENSIONS, ...SUPPORTED_SPRITE_FILE_EXTENSIONS]
const MAP_ASSET_PATTERN = /(map|terrain|village|city|dungeon|level|tile|road|street|environment|floor|wall|building|house|town|plaza)/i
const MAP_PREVIEW_LIMIT = 72
const ASSET_PICKER_PAGE_SIZE = 80
const ASSET_PICKER_MAX_RESULTS = 640
const ENGINE_EDITOR_SESSION_STORAGE_KEY = 'vfx_pro_engine_editor_session_v1'
const ENGINE_EDITOR_AUTOSAVE_DEBOUNCE_MS = 1200
const LIVE_CONTROL_UPDATE_THROTTLE_MS = 33
const LIVE_CONTROL_OSC_THROTTLED_ADDRESSES = new Set(['/vfx/playhead', '/vfx/layer/value'])
const PERFORMANCE_BUDGET_PRESETS = {
    performance: { drawCalls: 140, vramMb: 2048, minFps: 58, maxAssets: 50 },
    quality: { drawCalls: 260, vramMb: 4096, minFps: 45, maxAssets: 100 },
    cinematic: { drawCalls: 360, vramMb: 6144, minFps: 32, maxAssets: 160 },
}
const SHORTCUT_ITEMS = [
    { keys: '?', action: 'Toggle keyboard shortcut overlay' },
    { keys: 'Delete / Backspace', action: 'Remove selected outliner items' },
    { keys: 'Ctrl/Cmd + D', action: 'Duplicate selected staged assets' },
    { keys: 'Shift + A', action: 'Add selected licensed asset to preview' },
    { keys: 'K', action: 'Add keyframe to selected layer at playhead' },
    { keys: 'Escape', action: 'Clear outliner selection / close overlay' },
]

function makeId(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

function getFileExt(value) {
    const normalized = String(value || '').split('?')[0]
    const idx = normalized.lastIndexOf('.')
    if (idx === -1) return ''
    return normalized.slice(idx + 1).toLowerCase()
}

function toPreviewUrl(value) {
    const normalized = String(value || '').trim()
    if (!normalized) return ''
    if (/^(blob:|data:)/i.test(normalized)) return normalized
    return encodeURI(normalized)
}

function formatTimestampLabel(value) {
    if (!value) return 'Not saved yet'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Not saved yet'
    return date.toLocaleString()
}

function getResourcePath(value) {
    const normalized = String(value || '').split('?')[0]
    const idx = normalized.lastIndexOf('/')
    if (idx === -1) return ''
    return normalized.slice(0, idx + 1)
}

function normalizeUploadFileName(value) {
    const normalized = String(value || '').replace(/\\/g, '/')
    const leaf = normalized.slice(normalized.lastIndexOf('/') + 1)
    if (!leaf) return ''
    try {
        return decodeURIComponent(leaf).toLowerCase()
    } catch {
        return leaf.toLowerCase()
    }
}

function isBlobUrl(value) {
    return typeof value === 'string' && value.startsWith('blob:')
}

function toPersistedPreviewAsset(asset) {
    if (!asset || typeof asset !== 'object') return null
    if (isBlobUrl(asset.modelUrl)) return null
    const modelUrl = typeof asset.modelUrl === 'string' ? asset.modelUrl : ''
    if (!modelUrl) return null

    let uploadFileMap = undefined
    if (asset.uploadFileMap && typeof asset.uploadFileMap === 'object') {
        const filteredEntries = Object.entries(asset.uploadFileMap).filter(([, value]) => typeof value === 'string' && !isBlobUrl(value))
        if (filteredEntries.length > 0) uploadFileMap = Object.fromEntries(filteredEntries)
    }

    return {
        ...asset,
        uploadFileMap,
    }
}

function getBlobUrlsFromAsset(asset) {
    const urls = new Set()
    if (isBlobUrl(asset?.modelUrl)) urls.add(asset.modelUrl)
    if (asset?.uploadFileMap && typeof asset.uploadFileMap === 'object') {
        for (const value of Object.values(asset.uploadFileMap)) {
            if (isBlobUrl(value)) urls.add(value)
        }
    }
    return urls
}

function assetReferencesBlobUrl(asset, blobUrl) {
    if (!asset || !blobUrl) return false
    if (asset.modelUrl === blobUrl) return true
    if (asset?.uploadFileMap && typeof asset.uploadFileMap === 'object') {
        return Object.values(asset.uploadFileMap).some((value) => value === blobUrl)
    }
    return false
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

function getMapPreviewAssetPosition(index) {
    const columns = 12
    const spacing = 3
    const col = index % columns
    const row = Math.floor(index / columns)
    return [-16.5 + col * spacing, 0, -14 + row * spacing]
}

function isMapAssetCandidate(asset) {
    const haystack = `${asset?.title || ''} ${asset?.relativePath || ''}`
    return MAP_ASSET_PATTERN.test(haystack)
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

function hashStableText(value) {
    const text = String(value || '')
    let hash = 0
    for (let index = 0; index < text.length; index += 1) {
        hash = (hash << 5) - hash + text.charCodeAt(index)
        hash |= 0
    }
    return Math.abs(hash).toString(36)
}

function toImportSlug(asset, { separator = '-', maxBaseLength = 42 } = {}) {
    const baseSlug = slugifyForPath(asset?.title || asset?.id || 'asset').slice(0, maxBaseLength) || 'asset'
    const identitySeed = [
        asset?.sourceAssetId || '',
        asset?.modelUrl || '',
        asset?.renderUrl || '',
        asset?.sourceListing || '',
        asset?.fileExt || '',
    ]
        .filter(Boolean)
        .join('|')
    const uniqueSeed = identitySeed || asset?.id || `${baseSlug}|${asset?.creator || ''}`
    const suffix = hashStableText(uniqueSeed).slice(0, 8) || '0'
    return `${baseSlug}${separator}${suffix}`
}

function isContinuousLiveControlMessage(message) {
    if (!message || typeof message !== 'object') return false
    if (message.protocol === 'midi') return message.messageType === 'cc'
    if (message.protocol !== 'osc' || message.messageType !== 'incoming') return false
    return LIVE_CONTROL_OSC_THROTTLED_ADDRESSES.has(String(message?.payload?.address || ''))
}

function getLiveControlMessageBufferKey(message) {
    if (message?.protocol === 'midi') {
        const channel = Number(message?.channel) || 0
        const controller = Number(message?.controller) || 0
        return `midi:cc:${channel}:${controller}`
    }
    if (message?.protocol === 'osc') {
        return `osc:${String(message?.payload?.address || 'incoming')}`
    }
    return `other:${String(message?.protocol || 'unknown')}:${String(message?.messageType || 'message')}`
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

function normalizeTimelineValue(value, { duration, snapEnabled = true, snapStep = 0.25 }) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return 0
    const maxDuration = Math.max(0.1, Number(duration) || 1)
    const clamped = clamp(numeric, 0, maxDuration)
    if (!snapEnabled) return Number(clamped.toFixed(3))
    const step = Math.max(0.01, Number(snapStep) || 0.25)
    const snapped = Math.round(clamped / step) * step
    return Number(clamp(snapped, 0, maxDuration).toFixed(3))
}

function ensureLayerClips(layer, durationSeconds = 90) {
    const duration = Math.max(0.1, Number(durationSeconds) || 90)
    const clips = Array.isArray(layer?.clips)
        ? layer.clips
              .map((clip) => {
                  if (!clip || typeof clip !== 'object') return null
                  const start = normalizeTimelineValue(clip.start ?? 0, { duration, snapEnabled: true, snapStep: 0.01 })
                  const end = normalizeTimelineValue(clip.end ?? duration, { duration, snapEnabled: true, snapStep: 0.01 })
                  if (end <= start) return null
                  return {
                      id: clip.id || makeId('clip'),
                      name: clip.name || 'Clip',
                      start,
                      end,
                      enabled: clip.enabled !== false,
                      blend: clip.blend || 'normal',
                  }
              })
              .filter(Boolean)
        : []
    if (clips.length > 0) return clips
    return [
        {
            id: makeId('clip'),
            name: `${layer?.name || 'Layer'} Clip`,
            start: 0,
            end: Number(duration.toFixed(3)),
            enabled: true,
            blend: 'normal',
        },
    ]
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
    const slug = toImportSlug(asset)
    const root = asset.sourceAssetId ? 'Assets/VFXStudio/External/LicensedLibrary' : 'Assets/VFXStudio/External/LocalUploads'
    const folder = `${root}/${slug}`
    if (asset.kind === 'sprite') return `${folder}/${slug}.${asset.fileExt || 'png'}`
    return `${folder}/${slug}.prefab`
}

function toUnrealImportPath(asset) {
    const slug = toImportSlug(asset).replace(/-/g, '_')
    const root = asset.sourceAssetId ? '/Game/VFXStudio/External/LicensedLibrary' : '/Game/VFXStudio/External/LocalUploads'
    if (asset.kind === 'sprite') return `${root}/T_${slug}.T_${slug}`
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
        source_file_ext: asset.fileExt || null,
        preview_type: asset.previewType,
        license_status: asset.licenseStatus,
        source_listing: asset.sourceListing || null,
        proposed_prefab_path: toUnityImportPath(asset),
        stage_position: toOriginVector(asset.position),
        stage_scale: Number((asset.scale || 1).toFixed(3)),
        source_model: asset.sourceAssetId ? 'licensed_manifest' : 'local_upload',
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
            coordinate_system: {
                up_axis: 'Y',
                forward_axis: 'Z',
                unit: 'meter',
            },
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
        source_file_ext: asset.fileExt || null,
        preview_type: asset.previewType,
        license_status: asset.licenseStatus,
        source_listing: asset.sourceListing || null,
        proposed_soft_object_path: toUnrealImportPath(asset),
        stage_position: toOriginVector(asset.position),
        stage_scale: Number((asset.scale || 1).toFixed(3)),
        source_model: asset.sourceAssetId ? 'licensed_manifest' : 'local_upload',
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
            coordinate_system: {
                up_axis: 'Z',
                forward_axis: 'X',
                unit: 'centimeter',
            },
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
            {
                id: 'layer-a',
                name: 'Background',
                type: 'video',
                visible: true,
                keyframes: [{ id: 'kf-a', t: 0, v: 1 }],
                clips: [{ id: 'clip-a', name: 'Background Base', start: 0, end: 90, enabled: true, blend: 'normal' }],
            },
            {
                id: 'layer-b',
                name: 'FX Particles',
                type: 'particles',
                visible: true,
                keyframes: [{ id: 'kf-b', t: 8, v: 0.6 }],
                clips: [{ id: 'clip-b', name: 'Particle Burst', start: 6, end: 84, enabled: true, blend: 'additive' }],
            },
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
    const deferredAssetSearch = useDeferredValue(assetSearch)
    const [assetKindFilter, setAssetKindFilter] = useState('all')
    const [assetPickerLimit, setAssetPickerLimit] = useState(ASSET_PICKER_PAGE_SIZE)
    const [selectedPreviewAssetId, setSelectedPreviewAssetId] = useState('')
    const [previewAssets, setPreviewAssets] = useState([])
    const [selectedOutlinerIds, setSelectedOutlinerIds] = useState([])
    const [activeEditorTab, setActiveEditorTab] = useState('editor')
    const [showShortcutOverlay, setShowShortcutOverlay] = useState(false)
    const [timelineSnapEnabled, setTimelineSnapEnabled] = useState(true)
    const [timelineSnapStep, setTimelineSnapStep] = useState('0.25')
    const [licensedManifest, setLicensedManifest] = useState([])
    const [manifestLoadState, setManifestLoadState] = useState('loading')
    const [sessionLoadState, setSessionLoadState] = useState('checking')
    const [lastSessionSavedAt, setLastSessionSavedAt] = useState(null)

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
    const [midiProfileId, setMidiProfileId] = useState('bubba-dj')
    const [deckState, setDeckState] = useState({
        jogDelta: 0,
        tempoNormalized: 0.5,
        crossfaderNormalized: 0.5,
        lowEqNormalized: 0.5,
        highEqNormalized: 0.5,
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
    const throttledControlBufferRef = useRef(new Map())
    const throttledControlTimerRef = useRef(null)
    const sessionHydratedRef = useRef(false)

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
    const licensedRenderableAssets = useMemo(
        () => licensedManifest.filter((item) => SUPPORTED_PREVIEW_FILE_EXTENSIONS.includes(String(item.fileExt || '').toLowerCase())),
        [licensedManifest]
    )
    const licensedAssetCounts = useMemo(() => {
        const totals = { models: 0, sprites: 0 }
        for (const item of licensedRenderableAssets) {
            if (item.kind === 'sprite') totals.sprites += 1
            else totals.models += 1
        }
        return totals
    }, [licensedRenderableAssets])
    const assetPickerResult = useMemo(() => {
        const query = deferredAssetSearch.trim().toLowerCase()
        const filtered = licensedRenderableAssets.filter((item) => {
            const ext = String(item.fileExt || '').toLowerCase()
            if (assetKindFilter === 'sprite' && item.kind !== 'sprite') return false
            if (assetKindFilter === 'model' && item.kind === 'sprite') return false
            if (assetKindFilter === 'map' && !isMapAssetCandidate(item)) return false
            if (!query) return true
            const haystack = `${item.title || ''} ${item.creator || ''} ${item.sourcePack || ''} ${item.relativePath || ''} ${ext}`.toLowerCase()
            return haystack.includes(query)
        })
        const safeLimit = clamp(assetPickerLimit, ASSET_PICKER_PAGE_SIZE, ASSET_PICKER_MAX_RESULTS)
        const visible = filtered.slice(0, safeLimit)
        return {
            total: filtered.length,
            visible,
            hasMore: filtered.length > visible.length,
        }
    }, [assetKindFilter, assetPickerLimit, deferredAssetSearch, licensedRenderableAssets])
    const filteredPreviewAssetOptions = assetPickerResult.visible
    const totalFilteredPreviewAssetOptions = assetPickerResult.total
    const canLoadMorePreviewAssetOptions = assetPickerResult.hasMore
    const selectedPreviewAsset = useMemo(
        () => filteredPreviewAssetOptions.find((item) => item.id === selectedPreviewAssetId) || null,
        [filteredPreviewAssetOptions, selectedPreviewAssetId]
    )
    const outlinerItems = useMemo(
        () => [
            ...scene.layers.map((layer) => ({
                id: `layer:${layer.id}`,
                type: 'layer',
                sourceId: layer.id,
                label: layer.name,
                meta: layer.type,
            })),
            ...scene.nodes.map((node) => ({
                id: `node:${node.id}`,
                type: 'node',
                sourceId: node.id,
                label: node.label,
                meta: node.type,
            })),
            ...previewAssets.map((asset) => ({
                id: `asset:${asset.id}`,
                type: 'asset',
                sourceId: asset.id,
                label: asset.title,
                meta: asset.fileExt || asset.previewType || 'asset',
            })),
        ],
        [previewAssets, scene.layers, scene.nodes]
    )
    const selectedOutlinerItemSet = useMemo(() => new Set(selectedOutlinerIds), [selectedOutlinerIds])
    const selectedOutlinerLayerIds = useMemo(
        () =>
            selectedOutlinerIds
                .filter((id) => id.startsWith('layer:'))
                .map((id) => id.slice('layer:'.length))
                .filter(Boolean),
        [selectedOutlinerIds]
    )
    const selectedOutlinerNodeIds = useMemo(
        () =>
            selectedOutlinerIds
                .filter((id) => id.startsWith('node:'))
                .map((id) => id.slice('node:'.length))
                .filter(Boolean),
        [selectedOutlinerIds]
    )
    const selectedOutlinerAssetIds = useMemo(
        () =>
            selectedOutlinerIds
                .filter((id) => id.startsWith('asset:'))
                .map((id) => id.slice('asset:'.length))
                .filter(Boolean),
        [selectedOutlinerIds]
    )
    const selectedOutlinerAssets = useMemo(
        () => previewAssets.filter((asset) => selectedOutlinerAssetIds.includes(asset.id)),
        [previewAssets, selectedOutlinerAssetIds]
    )
    const averageSelectedAssetScale = useMemo(() => {
        if (!selectedOutlinerAssets.length) return 1
        const total = selectedOutlinerAssets.reduce((sum, asset) => sum + (Number(asset.scale) || 1), 0)
        return Number((total / selectedOutlinerAssets.length).toFixed(2))
    }, [selectedOutlinerAssets])
    const selectedLayerClips = useMemo(
        () => (selectedLayer ? ensureLayerClips(selectedLayer, scene.duration) : []),
        [scene.duration, selectedLayer]
    )
    const performanceBudget = useMemo(() => {
        const presetBudget = PERFORMANCE_BUDGET_PRESETS[viewportQuality] || PERFORMANCE_BUDGET_PRESETS.quality
        const resolution = parseResolution(outputResolution)
        const resolutionFactor = (resolution.x * resolution.y) / (1920 * 1080)
        const estimatedDrawCalls = Math.round(scene.layers.length * 8 + scene.nodes.length * 3 + previewAssets.length * 6)
        const estimatedVramMb = Math.round(previewAssets.length * 46 + scene.layers.length * 22 + resolutionFactor * 680)
        const estimatedFps = Math.max(12, Math.round(scene.fps - estimatedDrawCalls / 8 - estimatedVramMb / 520))
        const warnings = []
        if (previewAssets.length > presetBudget.maxAssets) {
            warnings.push(`Asset count ${previewAssets.length} exceeds ${presetBudget.maxAssets} for ${viewportQuality} preset.`)
        }
        if (estimatedDrawCalls > presetBudget.drawCalls) {
            warnings.push(`Estimated draw calls ${estimatedDrawCalls} exceed ${presetBudget.drawCalls}.`)
        }
        if (estimatedVramMb > presetBudget.vramMb) {
            warnings.push(`Estimated VRAM ${estimatedVramMb}MB exceeds ${presetBudget.vramMb}MB.`)
        }
        if (estimatedFps < presetBudget.minFps) {
            warnings.push(`Estimated FPS ${estimatedFps} is below ${presetBudget.minFps} target.`)
        }
        return {
            preset: viewportQuality,
            drawCalls: estimatedDrawCalls,
            vramMb: estimatedVramMb,
            fps: estimatedFps,
            thresholds: presetBudget,
            warnings,
        }
    }, [outputResolution, previewAssets.length, scene.fps, scene.layers.length, scene.nodes.length, viewportQuality])
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
        let active = true
        const controller = new AbortController()
        const loadManifest = async () => {
            setManifestLoadState('loading')
            try {
                const response = await fetch('/licensed-assets/manifest.json', { signal: controller.signal })
                if (!response.ok) throw new Error(`Manifest request failed (${response.status})`)
                const payload = await response.json()
                if (!active) return
                setLicensedManifest(Array.isArray(payload) ? payload : [])
                setManifestLoadState('ready')
            } catch (error) {
                if (!active || error?.name === 'AbortError') return
                setLicensedManifest([])
                setManifestLoadState('error')
            }
        }
        loadManifest()
        return () => {
            active = false
            controller.abort()
        }
    }, [])
    useEffect(() => {
        let restored = false
        if (typeof window !== 'undefined') {
            try {
                const raw = window.localStorage.getItem(ENGINE_EDITOR_SESSION_STORAGE_KEY)
                if (raw) {
                    const parsed = JSON.parse(raw)
                    if (parsed && typeof parsed === 'object') {
                        if (parsed.scene && typeof parsed.scene === 'object') setScene(parsed.scene)
                        if (Array.isArray(parsed.playhead) && Number.isFinite(Number(parsed.playhead[0]))) {
                            setPlayhead([Math.max(0, Number(parsed.playhead[0]))])
                        }
                        if (typeof parsed.selectedLayerId === 'string' && parsed.selectedLayerId) setSelectedLayerId(parsed.selectedLayerId)
                        if (typeof parsed.selectedNodeId === 'string' && parsed.selectedNodeId) setSelectedNodeId(parsed.selectedNodeId)
                        if (typeof parsed.scenePresetId === 'string' && SCENE_PRESETS.some((preset) => preset.id === parsed.scenePresetId)) {
                            setScenePresetId(parsed.scenePresetId)
                        }
                        if (typeof parsed.viewportQuality === 'string' && ['performance', 'quality', 'cinematic'].includes(parsed.viewportQuality)) {
                            setViewportQuality(parsed.viewportQuality)
                        }
                        if (
                            typeof parsed.outputResolution === 'string' &&
                            OUTPUT_RESOLUTION_OPTIONS.some((option) => option.value === parsed.outputResolution)
                        ) {
                            setOutputResolution(parsed.outputResolution)
                        }
                        if (Array.isArray(parsed.clipDuration) && Number.isFinite(Number(parsed.clipDuration[0]))) {
                            setClipDuration([clamp(Number(parsed.clipDuration[0]), 2, 30)])
                        }
                        if (typeof parsed.assetSearch === 'string') setAssetSearch(parsed.assetSearch.slice(0, 160))
                        if (typeof parsed.assetKindFilter === 'string' && ['all', 'model', 'sprite', 'map'].includes(parsed.assetKindFilter)) {
                            setAssetKindFilter(parsed.assetKindFilter)
                        }
                        if (typeof parsed.activeEditorTab === 'string' && ['editor', 'targets'].includes(parsed.activeEditorTab)) {
                            setActiveEditorTab(parsed.activeEditorTab)
                        }
                        if (Array.isArray(parsed.previewAssets)) {
                            const nextAssets = parsed.previewAssets
                                .map((asset) => toPersistedPreviewAsset(asset))
                                .filter(Boolean)
                                .slice(0, ASSET_PICKER_MAX_RESULTS)
                                .map((asset) => ({
                                    ...asset,
                                    id: typeof asset.id === 'string' && asset.id ? asset.id : makeId('preview-asset'),
                                    position:
                                        Array.isArray(asset.position) && asset.position.length === 3
                                            ? asset.position.map((value) => Number(value) || 0)
                                            : [0, 0, 0],
                                    scale: Number.isFinite(Number(asset.scale)) ? clamp(Number(asset.scale), 0.2, 4) : 1,
                                }))
                            setPreviewAssets(nextAssets)
                        }
                        if (Array.isArray(parsed.selectedOutlinerIds)) {
                            setSelectedOutlinerIds(parsed.selectedOutlinerIds.filter((id) => typeof id === 'string').slice(0, 180))
                        }
                        if (typeof parsed.lastSavedAt === 'string') setLastSessionSavedAt(parsed.lastSavedAt)
                        restored = true
                    }
                }
            } catch {
                restored = false
            }
        }
        setSessionLoadState(restored ? 'restored' : 'fresh')
        sessionHydratedRef.current = true
    }, [])
    useEffect(() => {
        setAssetPickerLimit(ASSET_PICKER_PAGE_SIZE)
    }, [assetKindFilter, deferredAssetSearch])
    useEffect(() => {
        if (!sessionHydratedRef.current) return
        const timer = setTimeout(() => {
            if (typeof window === 'undefined') return
            try {
                const payload = {
                    version: 1,
                    lastSavedAt: new Date().toISOString(),
                    scene,
                    playhead,
                    selectedLayerId,
                    selectedNodeId,
                    scenePresetId,
                    viewportQuality,
                    outputResolution,
                    clipDuration,
                    previewAssets: previewAssets.map((asset) => toPersistedPreviewAsset(asset)).filter(Boolean),
                    selectedOutlinerIds,
                    assetSearch,
                    assetKindFilter,
                    activeEditorTab,
                }
                window.localStorage.setItem(ENGINE_EDITOR_SESSION_STORAGE_KEY, JSON.stringify(payload))
                setLastSessionSavedAt(payload.lastSavedAt)
            } catch {}
        }, ENGINE_EDITOR_AUTOSAVE_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [
        activeEditorTab,
        assetKindFilter,
        assetSearch,
        clipDuration,
        outputResolution,
        playhead,
        previewAssets,
        scene,
        scenePresetId,
        selectedLayerId,
        selectedNodeId,
        selectedOutlinerIds,
        viewportQuality,
    ])

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
        const validIds = new Set(outlinerItems.map((item) => item.id))
        setSelectedOutlinerIds((prev) => prev.filter((id) => validIds.has(id)))
    }, [outlinerItems])
    useEffect(() => {
        return () => {
            const blobUrls = new Set()
            for (const item of previewAssetsRef.current) {
                for (const blobUrl of getBlobUrlsFromAsset(item)) {
                    blobUrls.add(blobUrl)
                }
            }
            for (const blobUrl of blobUrls) {
                URL.revokeObjectURL(blobUrl)
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
    useEffect(() => {
        const bufferedMessages = throttledControlBufferRef.current
        return () => {
            if (throttledControlTimerRef.current) {
                clearTimeout(throttledControlTimerRef.current)
                throttledControlTimerRef.current = null
            }
            bufferedMessages.clear()
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
            if (midiProfileId === 'bubba-dj') {
                if (message.messageType === 'cc' && message.controller === BUBBA_DJ_MAP.jogCc) {
                    const jogDelta = clamp(Math.round(Number(message.value) - 64), -63, 63)
                    if (Number.isFinite(jogDelta) && jogDelta !== 0) {
                        const duration = Math.max(1, Number(sceneDurationRef.current) || 1)
                        setPlayhead((prev) => {
                            const previous = Array.isArray(prev) ? Number(prev[0]) || 0 : 0
                            const next = clamp(Number((previous + jogDelta * 0.08).toFixed(2)), 0, duration)
                            return [next]
                        })
                        setDeckState((prev) => ({
                            ...prev,
                            jogDelta,
                            lastSignalAt: new Date().toISOString(),
                        }))
                        logControl(`BuBBa deck jog (CC0x21) -> delta ${jogDelta}`)
                    }
                    return
                }

                if (message.messageType === 'cc' && message.controller === BUBBA_DJ_MAP.tempoCc) {
                    const normalized = toNormalizedValue(message.normalized ?? message.value)
                    if (normalized == null) return
                    const fps = Math.round(24 + normalized * 96)
                    setScene((prev) => ({ ...prev, fps }))
                    setDeckState((prev) => ({
                        ...prev,
                        tempoNormalized: normalized,
                        lastSignalAt: new Date().toISOString(),
                    }))
                    logControl(`BuBBa tempo (CC0x19) -> scene FPS ${fps}`)
                    return
                }

                if (message.messageType === 'cc' && message.controller === BUBBA_DJ_MAP.crossfaderCc) {
                    const normalized = toNormalizedValue(message.normalized ?? message.value)
                    if (normalized == null) return
                    setSelectedLayerValue(normalized)
                    setDeckState((prev) => ({
                        ...prev,
                        crossfaderNormalized: normalized,
                        lastSignalAt: new Date().toISOString(),
                    }))
                    logControl(`BuBBa crossfader (CC0x20) -> selected-layer value ${normalized.toFixed(2)}`)
                    return
                }

                if (message.messageType === 'cc' && message.controller === BUBBA_DJ_MAP.lowEqCc) {
                    const normalized = toNormalizedValue(message.normalized ?? message.value)
                    if (normalized == null) return
                    setDeckState((prev) => ({
                        ...prev,
                        lowEqNormalized: normalized,
                        lastSignalAt: new Date().toISOString(),
                    }))
                    logControl(`BuBBa low EQ (CC0x16) -> ${normalized.toFixed(2)}`)
                    return
                }

                if (message.messageType === 'cc' && message.controller === BUBBA_DJ_MAP.highEqCc) {
                    const normalized = toNormalizedValue(message.normalized ?? message.value)
                    if (normalized == null) return
                    setDeckState((prev) => ({
                        ...prev,
                        highEqNormalized: normalized,
                        lastSignalAt: new Date().toISOString(),
                    }))
                    logControl(`BuBBa high EQ (CC0x17) -> ${normalized.toFixed(2)}`)
                    return
                }

                if (message.messageType === 'note_on' && message.note === BUBBA_DJ_MAP.playNote) {
                    toggleSelectedLayer()
                    setDeckState((prev) => ({
                        ...prev,
                        playing: !prev.playing,
                        lastSignalAt: new Date().toISOString(),
                    }))
                    logControl('BuBBa play (Note0x0B) -> toggled selected layer visibility')
                    return
                }

                if (message.messageType === 'note_on' && message.note === BUBBA_DJ_MAP.cueNote) {
                    const cueValue = Number(deckState.crossfaderNormalized) || 1
                    addCueKeyframeAtPlayhead(cueValue)
                    setDeckState((prev) => ({
                        ...prev,
                        cueCount: prev.cueCount + 1,
                        lastSignalAt: new Date().toISOString(),
                    }))
                    logControl('BuBBa cue (Note0x0C) -> added keyframe at playhead')
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

    const flushThrottledControlMessages = () => {
        throttledControlTimerRef.current = null
        const buffered = throttledControlBufferRef.current
        if (!buffered.size) return
        const pendingMessages = [...buffered.values()]
        buffered.clear()
        for (const message of pendingMessages) {
            applyLiveControlMessage(message)
        }
    }

    const handleIncomingLiveControlMessage = (message) => {
        if (!isContinuousLiveControlMessage(message)) {
            applyLiveControlMessage(message)
            return
        }
        const key = getLiveControlMessageBufferKey(message)
        throttledControlBufferRef.current.set(key, message)
        if (!throttledControlTimerRef.current) {
            throttledControlTimerRef.current = setTimeout(flushThrottledControlMessages, LIVE_CONTROL_UPDATE_THROTTLE_MS)
        }
    }

    const addLayer = () => {
        if (!canUseEditor) return
        const layer = {
            id: makeId('layer'),
            name: newLayerName || `${newLayerType} layer`,
            type: newLayerType,
            visible: true,
            keyframes: [],
            clips: ensureLayerClips({ name: newLayerName || `${newLayerType} layer`, clips: [] }, scene.duration),
        }
        setScene((prev) => ({ ...prev, layers: [...prev.layers, layer] }))
        setSelectedLayerId(layer.id)
        setSelectedOutlinerIds([`layer:${layer.id}`])
        setNewLayerName('')
    }

    const addNode = () => {
        if (!canUseEditor) return
        const node = { id: makeId('node'), type: newNodeType, label: newNodeLabel || `${newNodeType} node` }
        setScene((prev) => ({ ...prev, nodes: [...prev.nodes, node] }))
        setSelectedNodeId(node.id)
        setSelectedOutlinerIds([`node:${node.id}`])
        setNewNodeLabel('')
    }

    const removeLayer = (layerId) => {
        if (!canUseEditor || scene.layers.length <= 1) return
        setScene((prev) => ({ ...prev, layers: prev.layers.filter((item) => item.id !== layerId) }))
        setSelectedOutlinerIds((prev) => prev.filter((item) => item !== `layer:${layerId}`))
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
        setSelectedOutlinerIds((prev) => prev.filter((item) => item !== `node:${nodeId}`))
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
        const modelUrl = toPreviewUrl(selectedPreviewAsset.renderUrl)
        const fileExt = String(selectedPreviewAsset.fileExt || getFileExt(modelUrl)).toLowerCase()
        if (!SUPPORTED_PREVIEW_FILE_EXTENSIONS.includes(fileExt)) {
            toast.error('Selected asset is not renderable in preview.')
            return
        }
        const nextId = makeId('preview-asset')
        setPreviewAssets((prev) => [
                ...prev,
                {
                    id: nextId,
                    sourceAssetId: selectedPreviewAsset.id,
                    title: selectedPreviewAsset.title,
                    creator: selectedPreviewAsset.creator,
                    previewType: selectedPreviewAsset.previewType || inferPreviewAssetType(selectedPreviewAsset.title),
                    position: getPreviewAssetPosition(prev.length),
                    scale: 1,
                    modelUrl,
                    fileExt,
                    kind: selectedPreviewAsset.kind || (SUPPORTED_SPRITE_FILE_EXTENSIONS.includes(fileExt) ? 'sprite' : 'model'),
                    resourcePath: getResourcePath(modelUrl),
                    licenseStatus: selectedPreviewAsset.licenseStatus || 'verified',
                    sourceListing: selectedPreviewAsset.sourceListing,
                },
            ])
        setSelectedOutlinerIds([`asset:${nextId}`])
        toast.success(`${selectedPreviewAsset.title} staged in preview.`)
    }
    const buildMapPreviewFromLicensedAssets = () => {
        if (!licensedRenderableAssets.length) {
            toast.error('Licensed manifest is empty. Run npm run assets:manifest first.')
            return
        }

        const mapCandidates = licensedRenderableAssets
            .filter((asset) => asset.kind === 'model' && isMapAssetCandidate(asset))
            .slice(0, MAP_PREVIEW_LIMIT)

        if (!mapCandidates.length) {
            toast.error('No map-like assets found in the licensed manifest.')
            return
        }

        setScenePresetId('licensed-map-assembly')
        const mappedAssets = mapCandidates.map((asset, index) => {
                const modelUrl = toPreviewUrl(asset.renderUrl)
                const fileExt = String(asset.fileExt || getFileExt(modelUrl)).toLowerCase()
                return {
                    id: makeId('preview-map'),
                    sourceAssetId: asset.id,
                    title: asset.title,
                    creator: asset.creator,
                    previewType: asset.previewType || inferPreviewAssetType(asset.title),
                    position: getMapPreviewAssetPosition(index),
                    scale: asset.previewType === 'building' || asset.previewType === 'nature' ? 1.8 : 1.2,
                    modelUrl,
                    fileExt,
                    kind: 'model',
                    resourcePath: getResourcePath(modelUrl),
                    licenseStatus: asset.licenseStatus || 'verified',
                    sourceListing: asset.sourceListing,
                }
            })
        setPreviewAssets(mappedAssets)
        setSelectedOutlinerIds(mappedAssets.map((asset) => `asset:${asset.id}`))
        toast.success(`Built map preview from ${mapCandidates.length} licensed map assets.`)
    }
    const removeStagedAsset = (assetId) => {
        setPreviewAssets((prev) => {
            const target = prev.find((item) => item.id === assetId)
            if (!target) return prev
            const next = prev.filter((item) => item.id !== assetId)
            const targetBlobUrls = getBlobUrlsFromAsset(target)
            for (const blobUrl of targetBlobUrls) {
                const stillUsed = next.some((item) => assetReferencesBlobUrl(item, blobUrl))
                if (!stillUsed) URL.revokeObjectURL(blobUrl)
            }
            return next
        })
        setSelectedOutlinerIds((prev) => prev.filter((item) => item !== `asset:${assetId}`))
    }
    const clearStagedAssets = () => {
        setPreviewAssets((prev) => {
            const blobUrls = new Set()
            for (const item of prev) {
                for (const blobUrl of getBlobUrlsFromAsset(item)) {
                    blobUrls.add(blobUrl)
                }
            }
            for (const blobUrl of blobUrls) {
                URL.revokeObjectURL(blobUrl)
            }
            return []
        })
        setSelectedOutlinerIds((prev) => prev.filter((item) => !item.startsWith('asset:')))
    }
    const handleModelUpload = (event) => {
        const files = Array.from(event.target.files || [])
        event.target.value = ''
        if (!files.length) return

        const acceptedFiles = files.filter((file) => {
            const ext = file.name.split('.').pop()?.toLowerCase()
            return ext && SUPPORTED_PREVIEW_FILE_EXTENSIONS.includes(ext)
        })

        if (!acceptedFiles.length) {
            toast.error('Upload .glb, .gltf, .fbx, .obj, or sprite image files.')
            return
        }

        const uploadFileMap = {}
        acceptedFiles.forEach((file) => {
            const key = normalizeUploadFileName(file.name)
            if (!key || uploadFileMap[key]) return
            uploadFileMap[key] = URL.createObjectURL(file)
        })

        const addedIds = []
        setPreviewAssets((prev) => {
            const next = [...prev]
            acceptedFiles.forEach((file) => {
                const fileExt = file.name.split('.').pop()?.toLowerCase() || ''
                const fileKey = normalizeUploadFileName(file.name)
                const modelUrl = uploadFileMap[fileKey]
                const kind = SUPPORTED_SPRITE_FILE_EXTENSIONS.includes(fileExt) ? 'sprite' : 'model'
                const nextId = makeId('preview-upload')
                addedIds.push(nextId)
                next.push({
                    id: nextId,
                    sourceAssetId: null,
                    title: file.name,
                    creator: 'Local Upload',
                    previewType: inferPreviewAssetType(file.name),
                    position: getPreviewAssetPosition(next.length),
                    scale: 1,
                    modelUrl,
                    fileExt,
                    kind,
                    uploadFileMap: fileExt === 'fbx' ? uploadFileMap : undefined,
                    licenseStatus: 'local',
                    sourceListing: 'local-upload',
                })
            })
            return next
        })
        if (addedIds.length > 0) {
            setSelectedOutlinerIds(addedIds.map((id) => `asset:${id}`))
        }

        if (acceptedFiles.length !== files.length) {
            toast.warning(`Imported ${acceptedFiles.length} files. Unsupported files were skipped.`)
        } else {
            toast.success(`${acceptedFiles.length} file(s) uploaded to preview.`)
        }
    }

    const toggleOutlinerSelection = (itemId, { additive = false } = {}) => {
        const normalizedId = String(itemId || '')
        if (!normalizedId) return
        setSelectedOutlinerIds((prev) => {
            if (!additive) return [normalizedId]
            if (prev.includes(normalizedId)) return prev.filter((id) => id !== normalizedId)
            return [...prev, normalizedId]
        })
        if (normalizedId.startsWith('layer:')) {
            setSelectedLayerId(normalizedId.slice('layer:'.length))
        } else if (normalizedId.startsWith('node:')) {
            setSelectedNodeId(normalizedId.slice('node:'.length))
        }
    }

    const setSelectedAssetScale = (scale) => {
        const value = clamp(Number(scale) || 1, 0.1, 10)
        if (!selectedOutlinerAssetIds.length) return
        setPreviewAssets((prev) =>
            prev.map((asset) =>
                selectedOutlinerAssetIds.includes(asset.id)
                    ? {
                        ...asset,
                        scale: Number(value.toFixed(3)),
                    }
                    : asset
            )
        )
    }

    const nudgeSelectedAssets = (axis, delta) => {
        if (!selectedOutlinerAssetIds.length) return
        setPreviewAssets((prev) =>
            prev.map((asset) => {
                if (!selectedOutlinerAssetIds.includes(asset.id)) return asset
                const position = Array.isArray(asset.position) ? [...asset.position] : [0, 0, 0]
                if (axis === 'x') position[0] = Number((position[0] + delta).toFixed(3))
                if (axis === 'y') position[1] = Number((position[1] + delta).toFixed(3))
                if (axis === 'z') position[2] = Number((position[2] + delta).toFixed(3))
                return {
                    ...asset,
                    position,
                }
            })
        )
    }

    const setSelectedLayerVisibility = (visible) => {
        if (!selectedOutlinerLayerIds.length) return
        setScene((prev) => ({
            ...prev,
            layers: prev.layers.map((layer) =>
                selectedOutlinerLayerIds.includes(layer.id)
                    ? {
                        ...layer,
                        visible: Boolean(visible),
                    }
                    : layer
            ),
        }))
    }

    const addClipToSelectedLayer = () => {
        if (!selectedLayer) return
        const snapStep = Number(timelineSnapStep) || 0.25
        const start = normalizeTimelineValue(playhead[0], { duration: scene.duration, snapEnabled: timelineSnapEnabled, snapStep })
        const defaultLength = Math.max(0.5, snapStep * 8)
        const end = normalizeTimelineValue(start + defaultLength, {
            duration: scene.duration,
            snapEnabled: timelineSnapEnabled,
            snapStep,
        })
        if (end <= start) return
        setScene((prev) => ({
            ...prev,
            layers: prev.layers.map((layer) => {
                if (layer.id !== selectedLayer.id) return layer
                const clips = ensureLayerClips(layer, prev.duration)
                return {
                    ...layer,
                    clips: [
                        ...clips,
                        {
                            id: makeId('clip'),
                            name: `${layer.name} Clip ${clips.length + 1}`,
                            start,
                            end,
                            enabled: true,
                            blend: 'normal',
                        },
                    ],
                }
            }),
        }))
    }

    const updateSelectedLayerClip = (clipId, updates = {}) => {
        if (!selectedLayer || !clipId) return
        const snapStep = Number(timelineSnapStep) || 0.25
        setScene((prev) => ({
            ...prev,
            layers: prev.layers.map((layer) => {
                if (layer.id !== selectedLayer.id) return layer
                const clips = ensureLayerClips(layer, prev.duration)
                    .map((clip) => {
                        if (clip.id !== clipId) return clip
                        const nextStart =
                            updates.start == null
                                ? clip.start
                                : normalizeTimelineValue(updates.start, {
                                    duration: prev.duration,
                                    snapEnabled: timelineSnapEnabled,
                                    snapStep,
                                })
                        const nextEnd =
                            updates.end == null
                                ? clip.end
                                : normalizeTimelineValue(updates.end, {
                                    duration: prev.duration,
                                    snapEnabled: timelineSnapEnabled,
                                    snapStep,
                                })
                        if (nextEnd <= nextStart) return clip
                        return {
                            ...clip,
                            ...updates,
                            start: nextStart,
                            end: nextEnd,
                            enabled: updates.enabled == null ? clip.enabled : Boolean(updates.enabled),
                        }
                    })
                    .sort((a, b) => a.start - b.start)
                return {
                    ...layer,
                    clips,
                }
            }),
        }))
    }

    const removeSelectedLayerClip = (clipId) => {
        if (!selectedLayer || !clipId) return
        setScene((prev) => ({
            ...prev,
            layers: prev.layers.map((layer) => {
                if (layer.id !== selectedLayer.id) return layer
                const clips = ensureLayerClips(layer, prev.duration).filter((clip) => clip.id !== clipId)
                return {
                    ...layer,
                    clips: clips.length > 0 ? clips : ensureLayerClips(layer, prev.duration),
                }
            }),
        }))
    }

    const removeOutlinerSelection = () => {
        if (!selectedOutlinerIds.length) return
        const layerIds = selectedOutlinerLayerIds
        const nodeIds = selectedOutlinerNodeIds
        const assetIds = selectedOutlinerAssetIds

        if (assetIds.length > 0) {
            setPreviewAssets((prev) => {
                const next = prev.filter((asset) => !assetIds.includes(asset.id))
                for (const asset of prev) {
                    if (!assetIds.includes(asset.id)) continue
                    for (const blobUrl of getBlobUrlsFromAsset(asset)) {
                        const stillUsed = next.some((item) => assetReferencesBlobUrl(item, blobUrl))
                        if (!stillUsed) URL.revokeObjectURL(blobUrl)
                    }
                }
                return next
            })
        }

        if (layerIds.length > 0) {
            setScene((prev) => {
                const remaining = prev.layers.filter((layer) => !layerIds.includes(layer.id))
                return {
                    ...prev,
                    layers: remaining.length > 0 ? remaining : prev.layers.slice(0, 1),
                }
            })
        }

        if (nodeIds.length > 0) {
            setScene((prev) => {
                const remainingNodes = prev.nodes.filter((node) => !nodeIds.includes(node.id))
                const safeNodes = remainingNodes.length > 0 ? remainingNodes : prev.nodes.slice(0, 1)
                const safeNodeIds = new Set(safeNodes.map((node) => node.id))
                return {
                    ...prev,
                    nodes: safeNodes,
                    links: prev.links.filter((link) => safeNodeIds.has(link.from) && safeNodeIds.has(link.to)),
                }
            })
        }

        setSelectedOutlinerIds([])
    }

    useEffect(() => {
        const onKeyDown = (event) => {
            if (!canUseEditor) return
            const targetTag = String(event.target?.tagName || '').toLowerCase()
            const isTypingTarget =
                targetTag === 'input' ||
                targetTag === 'textarea' ||
                targetTag === 'select' ||
                Boolean(event.target?.isContentEditable)
            const key = String(event.key || '')
            const normalized = key.toLowerCase()

            if (normalized === '?') {
                event.preventDefault()
                setShowShortcutOverlay((prev) => !prev)
                return
            }
            if (normalized === 'escape') {
                setShowShortcutOverlay(false)
                setSelectedOutlinerIds([])
                return
            }
            if (isTypingTarget) return

            if ((event.ctrlKey || event.metaKey) && normalized === 'd') {
                event.preventDefault()
                if (selectedOutlinerAssetIds.length === 0) return
                setPreviewAssets((prev) => {
                    const selected = prev.filter((asset) => selectedOutlinerAssetIds.includes(asset.id))
                    if (!selected.length) return prev
                    const duplicates = selected.map((asset, index) => ({
                        ...asset,
                        id: makeId('preview-copy'),
                        title: `${asset.title} Copy`,
                        position: Array.isArray(asset.position)
                            ? [asset.position[0] + 0.9 + index * 0.1, asset.position[1], asset.position[2] + 0.9]
                            : getPreviewAssetPosition(prev.length + index),
                    }))
                    return [...prev, ...duplicates]
                })
                toast.success(`Duplicated ${selectedOutlinerAssetIds.length} staged asset(s).`)
                return
            }

            if (event.shiftKey && normalized === 'a') {
                event.preventDefault()
                stageSelectedAsset()
                return
            }

            if (normalized === 'k') {
                event.preventDefault()
                addKeyframe()
                return
            }

            if (normalized === 'delete' || normalized === 'backspace') {
                if (selectedOutlinerIds.length === 0) return
                event.preventDefault()
                removeOutlinerSelection()
            }
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canUseEditor, selectedOutlinerAssetIds, selectedOutlinerIds])

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

    const clearSavedEditorSnapshot = () => {
        if (typeof window === 'undefined') return
        window.localStorage.removeItem(ENGINE_EDITOR_SESSION_STORAGE_KEY)
        setLastSessionSavedAt(null)
        setSessionLoadState('fresh')
        toast.success('Saved editor snapshot cleared.')
    }

    const resetEditorSession = () => {
        if (recordedClipUrl) URL.revokeObjectURL(recordedClipUrl)
        const blobUrls = new Set()
        for (const item of previewAssetsRef.current) {
            for (const blobUrl of getBlobUrlsFromAsset(item)) {
                blobUrls.add(blobUrl)
            }
        }
        for (const blobUrl of blobUrls) {
            URL.revokeObjectURL(blobUrl)
        }

        setScene(defaultScene())
        setPlayhead([0])
        setSelectedLayerId('layer-a')
        setSelectedNodeId('node-b')
        setScenePresetId(SCENE_PRESETS[0].id)
        setViewportQuality('quality')
        setOutputResolution('3840x2160')
        setClipDuration([8])
        setRecordingState('idle')
        setRecordedClipUrl(null)
        setAssetSearch('')
        setAssetKindFilter('all')
        setAssetPickerLimit(ASSET_PICKER_PAGE_SIZE)
        setSelectedPreviewAssetId('')
        setPreviewAssets([])
        setSelectedOutlinerIds([])
        setActiveEditorTab('editor')
        if (typeof window !== 'undefined') window.localStorage.removeItem(ENGINE_EDITOR_SESSION_STORAGE_KEY)
        setLastSessionSavedAt(null)
        setSessionLoadState('fresh')
        toast.success('Editor session reset to defaults.')
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
            if (session.mode === 'mock') {
                setBridgeState('degraded')
                log(`connected mock: ${session.reason || 'bridge fallback active'}`)
                return
            }
            setBridgeState('connected')
            log('connected live')
        } catch (error) {
            setBridgeState('error')
            log(error instanceof Error ? error.message : 'connect failed')
        }
    }

    const syncBridge = async () => {
        if (!canUseRuntimeBridge || !bridgeSession) return
        setBridgeState('syncing')
        const result = await syncRuntimeScene({ sessionId: bridgeSession.sessionId, target: bridgeTarget, endpoint: bridgeEndpoint, scene })
        if (result.ok) {
            setBridgeState('connected')
            log(`sync ${result.mode} ${result.payloadHash}`)
            return
        }
        setBridgeState(result.mode === 'mock' ? 'degraded' : 'error')
        const reason = result.error || result.warning || 'runtime bridge sync failed'
        log(`sync failed (${result.ack || 'no-ack'}): ${reason}`)
        toast.error(`Runtime sync failed: ${reason}`)
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
            if (throttledControlTimerRef.current) {
                clearTimeout(throttledControlTimerRef.current)
                throttledControlTimerRef.current = null
            }
            throttledControlBufferRef.current.clear()
            setControlState('connecting')
            if (controlProtocol === 'midi') {
                const session = await connectMidiControl({
                    inputId: midiInputId === 'auto' ? undefined : midiInputId,
                    allowMockFallback: controlAllowMock,
                    onMessage: handleIncomingLiveControlMessage,
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
                onMessage: handleIncomingLiveControlMessage,
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
        if (throttledControlTimerRef.current) {
            clearTimeout(throttledControlTimerRef.current)
            throttledControlTimerRef.current = null
        }
        throttledControlBufferRef.current.clear()
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
                    <div className='mx-auto max-w-3xl rounded-md border border-cyan-400/20 bg-[#081125] px-3 py-2 text-left text-xs text-slate-300'>
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                            <p>
                                Session: {
                                    sessionLoadState === 'restored'
                                        ? 'Restored previous editor workspace.'
                                        : sessionLoadState === 'checking'
                                          ? 'Checking local editor snapshot...'
                                          : 'Autosave is active for this editor.'
                                }
                            </p>
                            <Badge variant='outline' className='border-cyan-400/45 text-cyan-200 bg-cyan-500/10'>
                                Last saved: {formatTimestampLabel(lastSessionSavedAt)}
                            </Badge>
                        </div>
                        <div className='mt-2 flex flex-wrap gap-2'>
                            <Button size='sm' variant='outline' onClick={resetEditorSession}>
                                Reset Editor Session
                            </Button>
                            <Button size='sm' variant='ghost' onClick={clearSavedEditorSnapshot}>
                                Clear Saved Snapshot
                            </Button>
                        </div>
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
                        <CardTitle className='text-cyan-100'>Licensed Asset Scene Preview</CardTitle>
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
                                    <div className='rounded border border-cyan-500/20 bg-[#0b1730] px-2 py-1 text-[11px] text-slate-300'>
                                        {manifestLoadState === 'loading' && 'Loading licensed manifest...'}
                                        {manifestLoadState === 'error' && 'Failed to load /licensed-assets/manifest.json. Run npm run assets:manifest and reload.'}
                                        {manifestLoadState === 'ready' &&
                                            `Licensed manifest: ${licensedRenderableAssets.length} assets (${licensedAssetCounts.models} models, ${licensedAssetCounts.sprites} sprites).`}
                                        {' '}Run <code>npm run assets:manifest</code> after adding files into <code>public/licensed-assets</code>.
                                    </div>
                                    <div className='grid gap-2'>
                                        <div className='grid gap-2 sm:grid-cols-2'>
                                            <Input
                                                value={assetSearch}
                                                onChange={(event) => setAssetSearch(event.target.value)}
                                                placeholder='Search by title, creator, pack, or path'
                                            />
                                            <Select value={assetKindFilter} onValueChange={setAssetKindFilter}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder='Filter asset type' />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value='all'>All Assets</SelectItem>
                                                    <SelectItem value='model'>Models Only</SelectItem>
                                                    <SelectItem value='sprite'>Sprites Only</SelectItem>
                                                    <SelectItem value='map'>Map Candidates</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className='rounded border border-cyan-500/20 bg-[#0b1730] px-2 py-1 text-[11px] text-slate-300'>
                                            Showing {filteredPreviewAssetOptions.length} of {totalFilteredPreviewAssetOptions} filtered assets.
                                        </div>
                                        <Select value={selectedPreviewAssetId} onValueChange={setSelectedPreviewAssetId}>
                                            <SelectTrigger>
                                                <SelectValue placeholder='Choose licensed asset' />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {filteredPreviewAssetOptions.map((item) => (
                                                    <SelectItem key={item.id} value={item.id}>
                                                        {item.title} - {item.creator} ({item.fileExt})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {canLoadMorePreviewAssetOptions && (
                                            <Button
                                                size='sm'
                                                variant='ghost'
                                                onClick={() =>
                                                    setAssetPickerLimit((prev) => Math.min(prev + ASSET_PICKER_PAGE_SIZE, ASSET_PICKER_MAX_RESULTS))
                                                }
                                            >
                                                Load More Assets ({totalFilteredPreviewAssetOptions - filteredPreviewAssetOptions.length} remaining)
                                            </Button>
                                        )}
                                        {totalFilteredPreviewAssetOptions === 0 && (
                                            <p className='text-[11px] text-amber-200'>No assets match this filter. Try a broader search.</p>
                                        )}
                                        {selectedPreviewAsset && (
                                            <div className='rounded border border-cyan-500/20 bg-[#0b1730] px-2 py-1.5 text-[11px] text-slate-300 space-y-0.5'>
                                                <p className='text-cyan-100 font-medium'>{selectedPreviewAsset.title}</p>
                                                <p>
                                                    {selectedPreviewAsset.creator} • {selectedPreviewAsset.kind} • {selectedPreviewAsset.fileExt}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    <div className='flex flex-wrap gap-2'>
                                        <Button variant='outline' onClick={stageSelectedAsset} disabled={!selectedPreviewAsset}>
                                            Add Licensed Asset To Preview
                                        </Button>
                                        <Button variant='outline' onClick={buildMapPreviewFromLicensedAssets} disabled={manifestLoadState !== 'ready'}>
                                            Build Map From Licensed Assets
                                        </Button>
                                        <Button variant='outline' onClick={clearStagedAssets} disabled={!previewAssets.length}>
                                            Clear Preview Assets
                                        </Button>
                                        <Input
                                            type='file'
                                            accept='.glb,.gltf,.fbx,.obj,.png,.jpg,.jpeg,.webp'
                                            multiple
                                            onChange={handleModelUpload}
                                            className='max-w-xs'
                                        />
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
                                                    {asset.creator} | {asset.previewType} | {asset.fileExt || 'model'}
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

                <Tabs value={activeEditorTab} onValueChange={setActiveEditorTab}>
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
                                        <div className='flex items-center justify-between gap-3'>
                                            <div>
                                                <CardTitle className='text-cyan-100'>Scene Outliner + Inspector</CardTitle>
                                                <CardDescription className='text-slate-300'>
                                                    Multi-select objects, inspect properties, and edit groups like Unreal/Unity workflows.
                                                </CardDescription>
                                            </div>
                                            <Button variant='outline' size='sm' onClick={() => setShowShortcutOverlay(true)}>
                                                Keyboard Shortcuts
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
                                        <div className='rounded-md border border-cyan-400/20 bg-[#081125] p-3 space-y-2'>
                                            <p className='text-sm text-cyan-100 font-medium'>Outliner</p>
                                            <p className='text-xs text-slate-400'>Tip: Ctrl/Cmd click for multi-select.</p>
                                            <div className='max-h-64 overflow-y-auto space-y-1 pr-1'>
                                                {outlinerItems.map((item) => {
                                                    const selected = selectedOutlinerItemSet.has(item.id)
                                                    return (
                                                        <button
                                                            key={item.id}
                                                            type='button'
                                                            onClick={(event) =>
                                                                toggleOutlinerSelection(item.id, {
                                                                    additive: event.ctrlKey || event.metaKey || event.shiftKey,
                                                                })
                                                            }
                                                            className={`w-full text-left rounded-md border px-2 py-1.5 ${
                                                                selected
                                                                    ? 'border-cyan-300/60 bg-cyan-500/20'
                                                                    : 'border-cyan-500/20 bg-[#0b1730]'
                                                            }`}
                                                        >
                                                            <p className='text-sm text-slate-100'>{item.label}</p>
                                                            <p className='text-[11px] text-slate-400'>
                                                                {item.type} • {item.meta}
                                                            </p>
                                                        </button>
                                                    )
                                                })}
                                                {outlinerItems.length === 0 && <p className='text-xs text-slate-400'>Nothing in outliner yet.</p>}
                                            </div>
                                        </div>

                                        <div className='rounded-md border border-cyan-400/20 bg-[#081125] p-3 space-y-3'>
                                            <p className='text-sm text-cyan-100 font-medium'>Inspector</p>
                                            <p className='text-xs text-slate-400'>Selected items: {selectedOutlinerIds.length}</p>
                                            {selectedOutlinerAssetIds.length > 0 && (
                                                <div className='space-y-2 rounded-md border border-cyan-500/20 bg-[#0b1730] p-2'>
                                                    <p className='text-xs text-cyan-200'>Staged Assets ({selectedOutlinerAssetIds.length})</p>
                                                    <Label className='text-xs text-slate-300'>
                                                        Uniform scale ({averageSelectedAssetScale.toFixed(2)})
                                                    </Label>
                                                    <Slider
                                                        value={[averageSelectedAssetScale]}
                                                        onValueChange={(value) => setSelectedAssetScale(value[0])}
                                                        min={0.1}
                                                        max={6}
                                                        step={0.05}
                                                    />
                                                    <div className='grid grid-cols-3 gap-2'>
                                                        <Button size='sm' variant='outline' onClick={() => nudgeSelectedAssets('x', -0.5)}>
                                                            Nudge X-
                                                        </Button>
                                                        <Button size='sm' variant='outline' onClick={() => nudgeSelectedAssets('z', -0.5)}>
                                                            Nudge Z-
                                                        </Button>
                                                        <Button size='sm' variant='outline' onClick={() => nudgeSelectedAssets('y', 0.25)}>
                                                            Nudge Y+
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                            {selectedOutlinerLayerIds.length > 0 && (
                                                <div className='space-y-2 rounded-md border border-cyan-500/20 bg-[#0b1730] p-2'>
                                                    <p className='text-xs text-cyan-200'>Layers ({selectedOutlinerLayerIds.length})</p>
                                                    <div className='flex flex-wrap gap-2'>
                                                        <Button size='sm' variant='outline' onClick={() => setSelectedLayerVisibility(true)}>
                                                            Set Visible
                                                        </Button>
                                                        <Button size='sm' variant='outline' onClick={() => setSelectedLayerVisibility(false)}>
                                                            Set Hidden
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                            {selectedOutlinerNodeIds.length > 0 && (
                                                <div className='space-y-2 rounded-md border border-cyan-500/20 bg-[#0b1730] p-2'>
                                                    <p className='text-xs text-cyan-200'>Nodes ({selectedOutlinerNodeIds.length})</p>
                                                    <p className='text-xs text-slate-300'>Use delete to remove selected nodes and reconnect links manually.</p>
                                                </div>
                                            )}
                                            {selectedOutlinerIds.length === 0 && (
                                                <p className='text-xs text-slate-400'>Select layers, nodes, or assets from outliner to edit here.</p>
                                            )}
                                            <div className='flex flex-wrap gap-2'>
                                                <Button variant='outline' size='sm' onClick={() => setSelectedOutlinerIds([])}>
                                                    Clear Selection
                                                </Button>
                                                <Button variant='ghost' size='sm' onClick={removeOutlinerSelection} disabled={selectedOutlinerIds.length === 0}>
                                                    Remove Selected
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className='bg-[#0b1730] border-cyan-400/20'>
                                    <CardHeader>
                                        <CardTitle className='text-cyan-100'>Performance Budget Panel</CardTitle>
                                        <CardDescription className='text-slate-300'>
                                            Live budget guardrails tied to viewport/export preset: {performanceBudget.preset}.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className='space-y-3'>
                                        <div className='grid gap-3 md:grid-cols-4'>
                                            <div className='rounded-md border border-cyan-500/20 bg-[#081125] px-3 py-2'>
                                                <p className='text-[11px] text-slate-400'>Draw Calls</p>
                                                <p className='text-lg text-cyan-100 font-semibold'>
                                                    {performanceBudget.drawCalls} / {performanceBudget.thresholds.drawCalls}
                                                </p>
                                            </div>
                                            <div className='rounded-md border border-cyan-500/20 bg-[#081125] px-3 py-2'>
                                                <p className='text-[11px] text-slate-400'>VRAM (est)</p>
                                                <p className='text-lg text-cyan-100 font-semibold'>
                                                    {performanceBudget.vramMb}MB / {performanceBudget.thresholds.vramMb}MB
                                                </p>
                                            </div>
                                            <div className='rounded-md border border-cyan-500/20 bg-[#081125] px-3 py-2'>
                                                <p className='text-[11px] text-slate-400'>FPS (est)</p>
                                                <p className='text-lg text-cyan-100 font-semibold'>
                                                    {performanceBudget.fps} / {performanceBudget.thresholds.minFps}
                                                </p>
                                            </div>
                                            <div className='rounded-md border border-cyan-500/20 bg-[#081125] px-3 py-2'>
                                                <p className='text-[11px] text-slate-400'>Assets</p>
                                                <p className='text-lg text-cyan-100 font-semibold'>
                                                    {previewAssets.length} / {performanceBudget.thresholds.maxAssets}
                                                </p>
                                            </div>
                                        </div>
                                        {performanceBudget.warnings.length > 0 ? (
                                            <div className='rounded-md border border-amber-400/35 bg-amber-500/10 px-3 py-2 space-y-1'>
                                                {performanceBudget.warnings.map((warning) => (
                                                    <p key={warning} className='text-xs text-amber-200'>
                                                        {warning}
                                                    </p>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className='rounded-md border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200'>
                                                Budget is within selected preset targets.
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

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
                                                            <button
                                                                type='button'
                                                                className='text-left'
                                                                onClick={() => toggleOutlinerSelection(`layer:${layer.id}`, { additive: false })}
                                                            >
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
                                            <div className='grid gap-2 md:grid-cols-2'>
                                                <Button onClick={addKeyframe}>Add Keyframe To Selected Layer</Button>
                                                <Button variant='outline' onClick={addClipToSelectedLayer}>
                                                    Add Clip At Playhead
                                                </Button>
                                            </div>
                                            <div className='grid gap-2 md:grid-cols-2'>
                                                <div className='flex items-center gap-2 rounded-md border border-cyan-500/20 bg-[#081125] px-2 py-1.5'>
                                                    <Switch checked={timelineSnapEnabled} onCheckedChange={setTimelineSnapEnabled} />
                                                    <Label className='text-xs text-slate-300'>Snap enabled</Label>
                                                </div>
                                                <Select value={timelineSnapStep} onValueChange={setTimelineSnapStep}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value='0.1'>0.1s</SelectItem>
                                                        <SelectItem value='0.25'>0.25s</SelectItem>
                                                        <SelectItem value='0.5'>0.5s</SelectItem>
                                                        <SelectItem value='1'>1.0s</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className='rounded-md border border-cyan-400/20 bg-[#081125] p-3 text-xs text-slate-300 max-h-52 overflow-y-auto'>
                                                {(selectedLayer?.keyframes || []).length === 0 && <p>No keyframes on selected layer.</p>}
                                                {(selectedLayer?.keyframes || []).map((frame) => (
                                                    <div key={frame.id} className='flex justify-between py-1 border-b border-cyan-500/10'>
                                                        <span>{frame.t}s</span>
                                                        <span>value {frame.v}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className='rounded-md border border-cyan-400/20 bg-[#081125] p-3 text-xs text-slate-300 max-h-64 overflow-y-auto space-y-2'>
                                                <p className='text-cyan-200'>Track Clips (non-destructive)</p>
                                                {selectedLayerClips.length === 0 && <p>No clips for selected layer.</p>}
                                                {selectedLayerClips.map((clip) => (
                                                    <div key={clip.id} className='rounded border border-cyan-500/20 bg-[#0b1730] p-2 space-y-2'>
                                                        <div className='flex items-center justify-between gap-2'>
                                                            <p className='text-[11px] text-slate-100'>{clip.name}</p>
                                                            <div className='flex items-center gap-2'>
                                                                <Button
                                                                    size='sm'
                                                                    variant={clip.enabled ? 'outline' : 'ghost'}
                                                                    className='h-6 px-2'
                                                                    onClick={() => updateSelectedLayerClip(clip.id, { enabled: !clip.enabled })}
                                                                >
                                                                    {clip.enabled ? 'Enabled' : 'Muted'}
                                                                </Button>
                                                                <Button
                                                                    size='sm'
                                                                    variant='ghost'
                                                                    className='h-6 px-2 text-red-300'
                                                                    onClick={() => removeSelectedLayerClip(clip.id)}
                                                                >
                                                                    Remove
                                                                </Button>
                                                            </div>
                                                        </div>
                                                        <div className='grid grid-cols-2 gap-2'>
                                                            <div className='space-y-1'>
                                                                <Label className='text-[10px] text-slate-400'>Start</Label>
                                                                <Input
                                                                    type='number'
                                                                    step={timelineSnapStep}
                                                                    min={0}
                                                                    max={scene.duration}
                                                                    value={clip.start}
                                                                    onChange={(event) =>
                                                                        updateSelectedLayerClip(clip.id, { start: Number(event.target.value) })
                                                                    }
                                                                />
                                                            </div>
                                                            <div className='space-y-1'>
                                                                <Label className='text-[10px] text-slate-400'>End</Label>
                                                                <Input
                                                                    type='number'
                                                                    step={timelineSnapStep}
                                                                    min={0}
                                                                    max={scene.duration}
                                                                    value={clip.end}
                                                                    onChange={(event) =>
                                                                        updateSelectedLayerClip(clip.id, { end: Number(event.target.value) })
                                                                    }
                                                                />
                                                            </div>
                                                        </div>
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
                                                            <button
                                                                type='button'
                                                                className='text-left'
                                                                onClick={() => toggleOutlinerSelection(`node:${node.id}`, { additive: false })}
                                                            >
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
                                            <Button
                                                variant='outline'
                                                onClick={syncBridge}
                                                disabled={!bridgeSession || bridgeSession.mode !== 'live' || bridgeState === 'syncing' || !canUseRuntimeBridge}
                                            >
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
                                        {controlProtocol === 'midi' && midiProfileId === 'bubba-dj' && (
                                            <div className='space-y-2'>
                                                <BubbaDeckPanel
                                                    deckState={deckState}
                                                    onControlChange={(field, value) => {
                                                        const normalized = clamp(Number(value), 0, 1)
                                                        if (field === 'tempoNormalized') {
                                                            const fps = Math.round(24 + normalized * 96)
                                                            setScene((prev) => ({ ...prev, fps }))
                                                            setDeckState((prev) => ({ ...prev, tempoNormalized: normalized }))
                                                            return
                                                        }
                                                        if (field === 'crossfaderNormalized') {
                                                            setSelectedLayerValue(normalized)
                                                            setDeckState((prev) => ({ ...prev, crossfaderNormalized: normalized }))
                                                            return
                                                        }
                                                        if (field === 'lowEqNormalized' || field === 'highEqNormalized') {
                                                            setDeckState((prev) => ({ ...prev, [field]: normalized }))
                                                        }
                                                    }}
                                                />
                                                <p className='text-[11px] text-slate-400'>
                                                    Mapping source: BuBBa deck profile (cue/play notes + jog/tempo/crossfader/EQ CC values).
                                                </p>
                                                <Button variant='ghost' size='sm' asChild>
                                                    <a href='https://github.com/CiprianVladGherga/BuBBa-DJ' target='_blank' rel='noopener noreferrer'>
                                                        <ArrowSquareOut size={14} className='mr-1.5' />
                                                        BuBBa DJ source
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

                <Dialog open={showShortcutOverlay} onOpenChange={setShowShortcutOverlay}>
                    <DialogContent className='sm:max-w-lg'>
                        <DialogHeader>
                            <DialogTitle>Keyboard Shortcuts</DialogTitle>
                            <DialogDescription>
                                Fast actions for timeline authoring, multi-select edits, and outliner operations.
                            </DialogDescription>
                        </DialogHeader>
                        <div className='space-y-2'>
                            {SHORTCUT_ITEMS.map((item) => (
                                <div key={item.keys} className='rounded-md border border-slate-700/60 bg-slate-900/50 px-3 py-2'>
                                    <p className='text-xs text-cyan-300 font-mono'>{item.keys}</p>
                                    <p className='text-sm text-slate-200'>{item.action}</p>
                                </div>
                            ))}
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </>
    )
}

