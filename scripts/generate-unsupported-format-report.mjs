import { promises as fs } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const assetRoot = path.join(root, 'public', 'licensed-assets')
const outputFile = path.join(root, 'docs', 'unsupported-asset-formats.json')
const supported = new Set(['.glb', '.gltf', '.fbx', '.obj', '.png', '.jpg', '.jpeg', '.webp'])
const auxiliary = new Set(['.bin', '.mtl', '.json', '.txt', '.url', '.ini'])

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

function toPosix(value) {
    return value.split(path.sep).join('/')
}

async function main() {
    const exists = await fs
        .access(assetRoot)
        .then(() => true)
        .catch(() => false)
    if (!exists) {
        await fs.mkdir(path.dirname(outputFile), { recursive: true })
        await fs.writeFile(outputFile, `${JSON.stringify({ generatedAt: new Date().toISOString(), extensions: [] }, null, 2)}\n`, 'utf8')
        return
    }

    const files = await walk(assetRoot)
    const grouped = new Map()

    for (const file of files) {
        const ext = path.extname(file).toLowerCase()
        if (!ext || supported.has(ext) || auxiliary.has(ext)) continue
        const key = ext
        const current = grouped.get(key) || { extension: key, count: 0, examples: [] }
        current.count += 1
        if (current.examples.length < 30) {
            current.examples.push(toPosix(path.relative(assetRoot, file)))
        }
        grouped.set(key, current)
    }

    const extensions = Array.from(grouped.values()).sort((a, b) => b.count - a.count || a.extension.localeCompare(b.extension))
    const payload = {
        generatedAt: new Date().toISOString(),
        supportedFormats: Array.from(supported).sort(),
        auxiliaryFormats: Array.from(auxiliary).sort(),
        extensions,
        recommendations: {
            blend: {
                reason: '.blend is not runtime-loadable in three.js.',
                convertTo: ['.glb', '.gltf'],
                docs: [
                    'https://threejs.org/manual/#en/load-obj',
                    'https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html',
                ],
            },
        },
    }

    await fs.mkdir(path.dirname(outputFile), { recursive: true })
    await fs.writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    console.log(`Unsupported format report: ${extensions.length} extension groups.`)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
