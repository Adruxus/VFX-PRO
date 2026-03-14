import { promises as fs } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFile(path.join(root, file), 'utf8')

function passResult(id, message, details = {}) {
    return { id, pass: true, message, details }
}

function failResult(id, message, details = {}) {
    return { id, pass: false, message, details }
}

async function countFilesByExt(dir, exts) {
    let count = 0
    async function walk(current) {
        const entries = await fs.readdir(current, { withFileTypes: true })
        for (const entry of entries) {
            const full = path.join(current, entry.name)
            if (entry.isDirectory()) {
                await walk(full)
                continue
            }
            if (!entry.isFile()) continue
            const ext = path.extname(entry.name).toLowerCase()
            if (exts.has(ext)) count += 1
        }
    }
    const exists = await fs
        .access(dir)
        .then(() => true)
        .catch(() => false)
    if (!exists) return 0
    await walk(dir)
    return count
}

async function main() {
    const enginesSrc = await read('src/pages/Engines.jsx')
    const viewportSrc = await read('src/components/SceneViewport3D.jsx')
    const modelSrc = await read('src/components/ImportedAssetModel.jsx')
    const scenePresetSrc = await read('src/data/scenePresets.js')
    const manifestSrc = await read('src/data/licensedAssetManifest.generated.js')
    const runtimeManifestJson = JSON.parse(await read('public/licensed-assets/manifest.json'))

    const manifest = Array.isArray(runtimeManifestJson) ? runtimeManifestJson : []

    const checks = []

    if (
        scenePresetSrc.includes("id: 'licensed-showroom'") &&
        scenePresetSrc.includes("id: 'licensed-cinematic'") &&
        scenePresetSrc.includes("id: 'licensed-map-assembly'") &&
        !scenePresetSrc.includes('house-woods-red-rider') &&
        !scenePresetSrc.includes('city-block-red-dress')
    ) {
        checks.push(passResult('scene-presets', 'Legacy demo presets removed and licensed presets are active.'))
    } else {
        checks.push(failResult('scene-presets', 'Scene preset migration is incomplete.'))
    }

    if (!/open-turntable|Open Turntable/.test(enginesSrc)) {
        checks.push(passResult('control-profile', 'Open Turntable references removed from engine controls.'))
    } else {
        checks.push(failResult('control-profile', 'Open Turntable references still exist in engine controls.'))
    }

    if (enginesSrc.includes('/licensed-assets/manifest.json') && enginesSrc.includes('licensedRenderableAssets')) {
        checks.push(passResult('asset-staging-source', 'Preview staging is wired to runtime licensed manifest JSON.'))
    } else {
        checks.push(failResult('asset-staging-source', 'Preview staging is not fully wired to runtime manifest JSON.'))
    }

    if (
        enginesSrc.includes('buildMapPreviewFromLicensedAssets') &&
        enginesSrc.includes('Build Map From Licensed Assets') &&
        viewportSrc.includes('licensed-map-assembly')
    ) {
        checks.push(passResult('map-assembly', 'Map assembly flow is wired in UI and viewport layout.'))
    } else {
        checks.push(failResult('map-assembly', 'Map assembly flow is missing from engine UI or viewport.'))
    }

    if (!/HouseInWoodsScene|CityBlockScene|AssetProxyMesh/.test(viewportSrc)) {
        checks.push(passResult('viewport-proxies', 'Procedural proxy/demo scene mesh path removed.'))
    } else {
        checks.push(failResult('viewport-proxies', 'Viewport still includes demo/proxy mesh code.'))
    }

    if (/useGLTF/.test(modelSrc) && /FBXLoader/.test(modelSrc) && /OBJLoader/.test(modelSrc)) {
        checks.push(passResult('model-loaders', 'GLTF/FBX/OBJ loaders are present.'))
    } else {
        checks.push(failResult('model-loaders', 'One or more model loaders are missing.'))
    }

    if (
        /SUPPORTED_MODEL_FILE_EXTENSIONS\s*=\s*\[[^\]]*'fbx'/.test(enginesSrc) &&
        /accept='\.glb,\.gltf,\.fbx,\.obj/.test(enginesSrc) &&
        /uploadFileMap/.test(modelSrc)
    ) {
        checks.push(passResult('fbx-preview-flow', 'FBX is enabled in preview upload and model loader sidecar resolution.'))
    } else {
        checks.push(failResult('fbx-preview-flow', 'FBX preview flow is incomplete in upload controls or loader wiring.'))
    }

    const manifestModels = manifest.filter((item) => item?.kind === 'model').length
    const manifestSprites = manifest.filter((item) => item?.kind === 'sprite').length
    if (manifest.length >= 100 && manifestModels >= 100) {
        checks.push(
            passResult('manifest-volume', 'Licensed manifest has substantial real assets.', {
                total: manifest.length,
                models: manifestModels,
                sprites: manifestSprites,
            })
        )
    } else {
        checks.push(
            failResult('manifest-volume', 'Licensed manifest has too few assets.', {
                total: manifest.length,
                models: manifestModels,
                sprites: manifestSprites,
            })
        )
    }

    if (/runtimeManifestUrl/.test(manifestSrc) && manifest.every((item) => item.renderUrl && item.fileExt)) {
        checks.push(passResult('manifest-fields', 'Runtime manifest includes render URL and file extension metadata.'))
    } else {
        checks.push(failResult('manifest-fields', 'Runtime manifest is missing required render metadata fields.'))
    }

    const unescapedRenderUrls = manifest.filter((item) => typeof item?.renderUrl === 'string' && /\s/.test(item.renderUrl))
    if (unescapedRenderUrls.length === 0) {
        checks.push(passResult('manifest-url-encoding', 'Manifest render URLs are URL-safe (no raw spaces).'))
    } else {
        checks.push(
            failResult('manifest-url-encoding', 'Manifest has render URLs with unescaped spaces.', {
                count: unescapedRenderUrls.length,
                examples: unescapedRenderUrls.slice(0, 5).map((item) => item.renderUrl),
            })
        )
    }

    const modelFileCount = await countFilesByExt(path.join(root, 'public/licensed-assets'), new Set(['.glb', '.gltf', '.fbx', '.obj']))
    const spriteFileCount = await countFilesByExt(path.join(root, 'public/licensed-assets'), new Set(['.png', '.jpg', '.jpeg', '.webp']))
    if (modelFileCount >= 100) {
        checks.push(
            passResult('asset-storage', 'Asset root contains real model files for runtime rendering.', {
                modelFileCount,
                spriteFileCount,
            })
        )
    } else {
        checks.push(
            failResult('asset-storage', 'Asset root does not contain enough real model files.', {
                modelFileCount,
                spriteFileCount,
            })
        )
    }

    const passed = checks.filter((check) => check.pass).length
    const failed = checks.length - passed
    const summary = {
        generatedAt: new Date().toISOString(),
        passed,
        failed,
        checks,
    }

    const outFile = path.join(root, 'docs', 'engine-verification.json')
    await fs.mkdir(path.dirname(outFile), { recursive: true })
    await fs.writeFile(outFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

    console.log(`Engine verification: ${passed} passed, ${failed} failed.`)
    console.log(`Report: ${outFile}`)

    if (failed > 0) {
        process.exitCode = 1
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
