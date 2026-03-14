/* eslint-disable react/no-unknown-property */
import { useEffect, useMemo, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import { useLoader } from '@react-three/fiber'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { Box3, LoadingManager, Vector3 } from 'three'

function applyShadowFlags(root) {
    root.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true
            child.receiveShadow = true
        }
    })
    return root
}

function normalizeToStage(root, targetSize = 1.8) {
    const bounds = new Box3().setFromObject(root)
    if (bounds.isEmpty()) return root

    const size = bounds.getSize(new Vector3())
    const maxAxis = Math.max(size.x, size.y, size.z, 0.0001)
    const fitScale = targetSize / maxAxis
    root.scale.multiplyScalar(fitScale)

    const scaledBounds = new Box3().setFromObject(root)
    const center = scaledBounds.getCenter(new Vector3())
    root.position.x -= center.x
    root.position.z -= center.z
    root.position.y -= scaledBounds.min.y
    return root
}

function GLTFAsset({ url }) {
    const gltf = useGLTF(url)
    const modelScene = useMemo(() => normalizeToStage(applyShadowFlags(gltf.scene.clone(true))), [gltf.scene])
    return <primitive object={modelScene} />
}

function getResourcePath(url = '') {
    const normalized = String(url || '').split('?')[0]
    const separator = normalized.lastIndexOf('/')
    if (separator === -1) return ''
    return normalized.slice(0, separator + 1)
}

function normalizeAssetUrl(value = '') {
    const raw = String(value || '').trim()
    if (!raw) return ''
    if (/^(blob:|data:)/i.test(raw)) return raw
    return encodeURI(raw)
}

function toLookupFileName(value = '') {
    const normalized = String(value || '').split('?')[0].replace(/\\/g, '/')
    const leaf = normalized.slice(normalized.lastIndexOf('/') + 1)
    if (!leaf) return ''
    try {
        return decodeURIComponent(leaf).toLowerCase()
    } catch {
        return leaf.toLowerCase()
    }
}

function normalizeUploadFileMap(uploadFileMap) {
    const out = {}
    if (!uploadFileMap || typeof uploadFileMap !== 'object') return out
    for (const [key, value] of Object.entries(uploadFileMap)) {
        if (typeof value !== 'string' || !value) continue
        const normalizedKey = toLookupFileName(key)
        if (!normalizedKey) continue
        out[normalizedKey] = value
    }
    return out
}

function FBXAsset({ url, resourcePath, uploadFileMap }) {
    const [fbxScene, setFbxScene] = useState(null)
    const normalizedUploadFileMap = useMemo(() => normalizeUploadFileMap(uploadFileMap), [uploadFileMap])
    const normalizedModelUrl = useMemo(() => normalizeAssetUrl(url), [url])
    const normalizedResourcePath = useMemo(() => normalizeAssetUrl(resourcePath || getResourcePath(normalizedModelUrl)), [resourcePath, normalizedModelUrl])

    useEffect(() => {
        if (!normalizedModelUrl) {
            setFbxScene(null)
            return undefined
        }

        let active = true
        setFbxScene(null)
        const manager = new LoadingManager()
        manager.setURLModifier((requestUrl) => {
            const mapped = normalizedUploadFileMap[toLookupFileName(requestUrl)]
            if (mapped) return mapped
            if (/^(blob:|data:|https?:\/\/)/i.test(String(requestUrl || ''))) return requestUrl
            return encodeURI(String(requestUrl || ''))
        })
        const loader = new FBXLoader(manager)
        if (normalizedResourcePath) loader.setResourcePath(normalizedResourcePath)

        const fallbackUrl = encodeURI(String(url || ''))
        const attempts = Array.from(new Set([normalizedModelUrl, fallbackUrl].filter(Boolean)))
        let attemptIndex = 0

        const loadAttempt = () => {
            const targetUrl = attempts[attemptIndex]
            loader.load(
                targetUrl,
                (loadedScene) => {
                    if (!active) return
                    setFbxScene(loadedScene)
                },
                undefined,
                (error) => {
                    if (!active) return
                    if (attemptIndex < attempts.length - 1) {
                        attemptIndex += 1
                        loadAttempt()
                        return
                    }
                    console.error('Failed to load FBX preview asset.', error)
                    setFbxScene(null)
                }
            )
        }
        loadAttempt()

        return () => {
            active = false
        }
    }, [normalizedModelUrl, normalizedResourcePath, normalizedUploadFileMap, url])

    const modelScene = useMemo(() => {
        if (!fbxScene) return null
        return normalizeToStage(applyShadowFlags(fbxScene.clone(true)))
    }, [fbxScene])
    if (!modelScene) return null
    return <primitive object={modelScene} />
}

function OBJAsset({ url }) {
    const obj = useLoader(OBJLoader, normalizeAssetUrl(url))
    const modelScene = useMemo(() => normalizeToStage(applyShadowFlags(obj.clone(true))), [obj])
    return <primitive object={modelScene} />
}

function getFileExt(url = '') {
    const normalized = String(url || '').split('?')[0]
    const idx = normalized.lastIndexOf('.')
    if (idx === -1) return ''
    return normalized.slice(idx + 1).toLowerCase()
}

export default function ImportedAssetModel({ asset }) {
    const url = asset?.modelUrl || ''
    const position = Array.isArray(asset?.position) ? asset.position : [0, 0, 0]
    const scale = typeof asset?.scale === 'number' ? asset.scale : 1
    const ext = String(asset?.fileExt || getFileExt(url)).toLowerCase()
    const normalizedUrl = normalizeAssetUrl(url)

    if (!normalizedUrl) return null

    return (
        <group position={position} scale={scale}>
            {(ext === 'glb' || ext === 'gltf') && <GLTFAsset url={normalizedUrl} />}
            {ext === 'fbx' && <FBXAsset url={normalizedUrl} resourcePath={asset?.resourcePath} uploadFileMap={asset?.uploadFileMap} />}
            {ext === 'obj' && <OBJAsset url={normalizedUrl} />}
        </group>
    )
}
