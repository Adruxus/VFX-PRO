/* eslint-disable react/no-unknown-property */
import { Suspense, lazy } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, Grid, OrbitControls, useTexture } from '@react-three/drei'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'

const ImportedAssetModel = lazy(() => import('@/components/ImportedAssetModel'))

function StageFloor() {
    return (
        <group>
            <mesh rotation-x={-Math.PI / 2} receiveShadow>
                <planeGeometry args={[72, 72]} />
                <meshStandardMaterial color='#0a1224' roughness={0.86} metalness={0.08} />
            </mesh>
            <Grid
                args={[72, 72]}
                position={[0, 0.01, 0]}
                cellColor='#1e293b'
                sectionColor='#0ea5e9'
                sectionSize={3}
                cellSize={1}
                cellThickness={0.5}
                sectionThickness={1.1}
                fadeDistance={42}
                fadeStrength={1}
            />
        </group>
    )
}

function getAutoPosition(index, presetId) {
    const safeIndex = Math.max(0, Number(index) || 0)
    if (presetId === 'licensed-map-assembly') {
        const columns = 12
        const spacing = 3
        const col = safeIndex % columns
        const row = Math.floor(safeIndex / columns)
        return [-16.5 + col * spacing, 0, -14 + row * spacing]
    }
    if (presetId === 'licensed-cinematic') {
        const lane = safeIndex % 10
        const row = Math.floor(safeIndex / 10)
        return [-12 + lane * 2.6, 0, -2 + row * 3.2]
    }
    const ring = 8 + Math.floor(safeIndex / 12) * 3.2
    const angle = ((safeIndex % 12) / 12) * Math.PI * 2
    return [Math.cos(angle) * ring, 0, Math.sin(angle) * ring]
}

function getAssetPosition(asset, index, presetId) {
    if (Array.isArray(asset?.position) && asset.position.length === 3) {
        return asset.position
    }
    return getAutoPosition(index, presetId)
}

function isSpriteAsset(asset) {
    const ext = String(asset?.fileExt || '')
    return asset?.kind === 'sprite' || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)
}

function SpriteBillboard({ asset, index, presetId }) {
    const texture = useTexture(asset.imageUrl || asset.modelUrl)
    const position = getAssetPosition(asset, index, presetId)
    const scale = typeof asset.scale === 'number' ? asset.scale : 1

    return (
        <group position={position} scale={scale}>
            <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
                <planeGeometry args={[1.8, 1.8]} />
                <meshStandardMaterial map={texture} transparent alphaTest={0.1} side={2} />
            </mesh>
        </group>
    )
}

function StagedAsset({ asset, index, presetId }) {
    if (!asset?.modelUrl) return null
    if (isSpriteAsset(asset)) {
        return <SpriteBillboard asset={asset} index={index} presetId={presetId} />
    }

    const position = getAssetPosition(asset, index, presetId)
    const normalized = {
        ...asset,
        position,
        scale: typeof asset.scale === 'number' ? asset.scale : 1,
    }

    return (
        <Suspense fallback={null}>
            <ImportedAssetModel asset={normalized} />
        </Suspense>
    )
}

function SceneWorld({ presetId, sceneAssets = [] }) {
    return (
        <group>
            <StageFloor />
            {sceneAssets.map((asset, index) => (
                <StagedAsset key={asset.id || `${asset.title}-${index}`} asset={asset} index={index} presetId={presetId} />
            ))}
            <ContactShadows position={[0, 0.01, 0]} opacity={0.55} blur={1.8} width={40} height={40} far={18} />
        </group>
    )
}

export default function SceneViewport3D({ presetId, quality = 'quality', canvasRef, sceneAssets = [] }) {
    const dpr = quality === 'cinematic' ? [1.25, 2] : quality === 'quality' ? [1, 1.75] : [1, 1.2]
    const camera =
        presetId === 'licensed-map-assembly'
            ? { position: [20, 22, 20], fov: 38 }
            : presetId === 'licensed-cinematic'
              ? { position: [16, 7, 16], fov: 36 }
              : { position: [11, 6, 11], fov: 42 }

    return (
        <div ref={canvasRef} className='h-[440px] w-full rounded-xl overflow-hidden border border-cyan-400/25 bg-[#060d1f]'>
            <Canvas
                shadows
                camera={camera}
                dpr={dpr}
                gl={{
                    toneMapping: ACESFilmicToneMapping,
                    outputColorSpace: SRGBColorSpace,
                }}
            >
                <color attach='background' args={['#020817']} />
                <fog attach='fog' args={['#020817', 16, 56]} />
                <ambientLight intensity={0.4} />
                <hemisphereLight intensity={0.42} color='#9ad7ff' groundColor='#060d1f' />
                <directionalLight castShadow position={[10, 14, 8]} intensity={1.15} shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
                <directionalLight position={[-8, 6, -10]} intensity={0.35} color='#67e8f9' />
                <SceneWorld presetId={presetId} sceneAssets={sceneAssets} />
                <OrbitControls
                    makeDefault
                    enablePan
                    enableZoom
                    enableRotate
                    maxPolarAngle={Math.PI * 0.49}
                    minDistance={4}
                    maxDistance={presetId === 'licensed-map-assembly' ? 55 : 28}
                />
            </Canvas>
        </div>
    )
}
