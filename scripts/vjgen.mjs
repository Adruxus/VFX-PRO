#!/usr/bin/env node
import fs from 'fs'

const args = process.argv.slice(2)
const command = args[0]

function parseFlag(name, fallback = null) {
    const index = args.indexOf(name)
    if (index === -1 || index + 1 >= args.length) return fallback
    return args[index + 1]
}

function parseBooleanFlag(name) {
    return args.includes(name)
}

function printUsage() {
    console.log(`
vjgen prototype CLI

Commands:
  generate --input <request.json> [--base <url>]
  job --id <job_id> [--base <url>]
  manifest --asset <asset_id> [--base <url>]
  download --asset <asset_id> [--base <url>]
  push --asset <asset_id> --target <unreal|unity> [--endpoint <ws-url>] [--base <url>] [--performance]
`)
}

function getBase() {
    return parseFlag('--base', process.env.VJ_API_BASE || 'https://vfx-studios.com')
}

async function request(method, path, body = null) {
    const base = getBase().replace(/\/+$/, '')
    const response = await fetch(`${base}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : null,
    })
    const text = await response.text()
    let data = null
    try {
        data = JSON.parse(text)
    } catch {
        data = { raw: text }
    }
    return { ok: response.ok, status: response.status, data }
}

async function runGenerate() {
    const inputPath = parseFlag('--input')
    if (!inputPath) throw new Error('Missing --input <request.json>')
    const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
    const result = await request('POST', '/api/v1/generate', payload)
    console.log(JSON.stringify(result, null, 2))
}

async function runJob() {
    const id = parseFlag('--id')
    if (!id) throw new Error('Missing --id <job_id>')
    const result = await request('GET', `/api/v1/jobs/${encodeURIComponent(id)}`)
    console.log(JSON.stringify(result, null, 2))
}

async function runManifest() {
    const asset = parseFlag('--asset')
    if (!asset) throw new Error('Missing --asset <asset_id>')
    const result = await request('GET', `/api/v1/assets/${encodeURIComponent(asset)}/manifest`)
    console.log(JSON.stringify(result, null, 2))
}

async function runDownload() {
    const asset = parseFlag('--asset')
    if (!asset) throw new Error('Missing --asset <asset_id>')
    const result = await request('GET', `/api/v1/assets/${encodeURIComponent(asset)}/download`)
    console.log(JSON.stringify(result, null, 2))
}

async function runPush() {
    const asset = parseFlag('--asset')
    const target = parseFlag('--target')
    const endpoint = parseFlag('--endpoint', null)
    if (!asset) throw new Error('Missing --asset <asset_id>')
    if (!target) throw new Error('Missing --target <unreal|unity>')
    const payload = {
        asset_id: asset,
        target,
        endpoint,
        hot_reload: true,
        fidelity_mode: parseBooleanFlag('--performance') ? 'performance' : 'quality',
    }
    const result = await request('POST', '/api/v1/engine/push', payload)
    console.log(JSON.stringify(result, null, 2))
}

async function main() {
    if (!command || ['-h', '--help', 'help'].includes(command)) {
        printUsage()
        return
    }

    if (command === 'generate') return runGenerate()
    if (command === 'job') return runJob()
    if (command === 'manifest') return runManifest()
    if (command === 'download') return runDownload()
    if (command === 'push') return runPush()

    throw new Error(`Unknown command: ${command}`)
}

main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
})
