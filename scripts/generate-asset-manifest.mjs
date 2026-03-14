import { promises as fs } from 'node:fs'
import path from 'node:path'

const MODELS = new Set(['.glb', '.gltf', '.fbx', '.obj'])
const SPRITES = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const PROJECT_ROOT = process.cwd()
const ASSET_ROOT = path.join(PROJECT_ROOT, 'public', 'licensed-assets')
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'src', 'data', 'licensedAssetManifest.generated.js')
const OUTPUT_JSON_FILE = path.join(PROJECT_ROOT, 'public', 'licensed-assets', 'manifest.json')

function toPosix(value) {
    return value.split(path.sep).join('/')
}

function toEncodedUrlPath(relativePath) {
    return String(relativePath || '')
        .split('/')
        .filter((segment) => segment.length > 0)
        .map((segment) => encodeURIComponent(segment))
        .join('/')
}

function toTitle(name) {
    return name
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function inferKind(ext) {
    if (MODELS.has(ext)) return 'model'
    if (SPRITES.has(ext)) return 'sprite'
    return null
}

function inferPreviewType(filePath) {
    const value = filePath.toLowerCase()
    if (/(character|human|npc|knight|villager|zombie|soldier)/.test(value)) return 'character'
    if (/(house|building|city|dungeon|castle|hospital|market|village|interior)/.test(value)) return 'building'
    if (/(car|vehicle|ship|bike|tank|bus|plane|spaceship|hover)/.test(value)) return 'vehicle'
    if (/(tree|forest|nature|rock|mountain|beach|grass|terrain)/.test(value)) return 'nature'
    if (/(weapon|gun|rifle|sword|shield|tool)/.test(value)) return 'weapon'
    return 'prop'
}

function inferCreatorAndPack(relativePath) {
    const segments = String(relativePath || '').split('/').filter(Boolean)
    const root = segments[0] || 'unknown'
    const pack = segments[1] || root

    if (root === 'desktop-import') {
        return {
            creator: toTitle(pack),
            sourcePack: pack,
            sourceRoot: root,
        }
    }

    if (root === 'itch-quaternius') {
        return {
            creator: 'Quaternius',
            sourcePack: pack,
            sourceRoot: root,
        }
    }

    return {
        creator: toTitle(root),
        sourcePack: pack,
        sourceRoot: root,
    }
}

async function walk(dir, out = []) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            await walk(fullPath, out)
            continue
        }
        if (!entry.isFile()) continue
        out.push(fullPath)
    }
    return out
}

async function readFileSize(filePath) {
    const stat = await fs.stat(filePath)
    return stat.size
}

async function buildManifest() {
    const exists = await fs
        .access(ASSET_ROOT)
        .then(() => true)
        .catch(() => false)

    if (!exists) {
        return []
    }

    const files = await walk(ASSET_ROOT, [])
    const manifest = []
    let index = 1

    for (const fullPath of files) {
        const ext = path.extname(fullPath).toLowerCase()
        const kind = inferKind(ext)
        if (!kind) continue

        const relative = toPosix(path.relative(ASSET_ROOT, fullPath))
        const pathKey = relative.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
        const id = `licensed-${String(index).padStart(4, '0')}-${pathKey.slice(0, 42)}`
        const { creator, sourcePack, sourceRoot } = inferCreatorAndPack(relative)
        const title = toTitle(path.basename(relative))
        const sizeBytes = await readFileSize(fullPath)

        manifest.push({
            id,
            title,
            creator: creator || 'Unknown',
            sourcePack,
            sourceRoot,
            kind,
            previewType: inferPreviewType(relative),
            fileExt: ext.replace('.', ''),
            fileSizeBytes: sizeBytes,
            relativePath: relative,
            renderUrl: `/licensed-assets/${toEncodedUrlPath(relative)}`,
            sourceListing: 'local-licensed-assets',
            licenseStatus: 'verified',
            engineStatus: kind === 'model' ? 'prepared' : 'not-applicable',
        })
        index += 1
    }

    manifest.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    return manifest
}

async function writeManifest(manifest) {
    const modelCount = manifest.filter((item) => item.kind === 'model').length
    const spriteCount = manifest.filter((item) => item.kind === 'sprite').length
    const meta = {
        generatedAt: new Date().toISOString(),
        total: manifest.length,
        models: modelCount,
        sprites: spriteCount,
        runtimeManifestUrl: '/licensed-assets/manifest.json',
    }
    const body = `export const LICENSED_ASSET_MANIFEST_META = ${JSON.stringify(meta, null, 4)}\nexport const LICENSED_ASSET_MANIFEST = []\n`
    await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true })
    await fs.writeFile(OUTPUT_FILE, body, 'utf8')
    await fs.mkdir(path.dirname(OUTPUT_JSON_FILE), { recursive: true })
    await fs.writeFile(OUTPUT_JSON_FILE, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

async function main() {
    const manifest = await buildManifest()
    await writeManifest(manifest)
    const modelCount = manifest.filter((item) => item.kind === 'model').length
    const spriteCount = manifest.filter((item) => item.kind === 'sprite').length
    console.log(`Generated ${manifest.length} licensed assets (${modelCount} models, ${spriteCount} sprites).`)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
