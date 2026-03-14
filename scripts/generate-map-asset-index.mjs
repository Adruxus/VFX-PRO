import { promises as fs } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const manifestPath = path.join(root, 'public', 'licensed-assets', 'manifest.json')
const outputPath = path.join(root, 'docs', 'map-asset-index.json')
const mapPattern = /(map|terrain|village|city|dungeon|level|tile|road|street|environment|floor|wall|building|house|town|plaza)/i
const limit = 120

function getMapPosition(index) {
    const columns = 12
    const spacing = 3
    const col = index % columns
    const row = Math.floor(index / columns)
    return {
        x: Number((-16.5 + col * spacing).toFixed(3)),
        y: 0,
        z: Number((-14 + row * spacing).toFixed(3)),
    }
}

async function main() {
    const raw = await fs.readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(raw)
    const candidates = manifest.filter(
        (item) =>
            item?.kind === 'model' &&
            mapPattern.test(`${item.title || ''} ${item.relativePath || ''}`)
    )

    const selected = candidates.slice(0, limit).map((item, index) => ({
        id: item.id,
        title: item.title,
        sourcePack: item.sourcePack,
        fileExt: item.fileExt,
        renderUrl: item.renderUrl,
        suggestedPosition: getMapPosition(index),
    }))

    const payload = {
        generatedAt: new Date().toISOString(),
        totalCandidates: candidates.length,
        selectedCount: selected.length,
        layoutPreset: 'licensed-map-assembly',
        assets: selected,
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    console.log(`Map asset index generated: ${selected.length} selected from ${candidates.length} candidates.`)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})

