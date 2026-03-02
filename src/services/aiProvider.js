/**
 * Multi-Provider AI Service
 * Supports Replicate + Hugging Face APIs
 * Replaces Galaxy AI SDK with real provider integrations
 */
import providers from '@/config/ai-providers.json'

// API Keys from env
const KEYS = {
    replicate: import.meta.env.VITE_REPLICATE_API_KEY || '',
    huggingface: import.meta.env.VITE_HUGGINGFACE_API_KEY || '',
}

// Base URLs
const URLS = {
    replicate: 'https://api.replicate.com/v1',
    huggingface: 'https://api-inference.huggingface.co',
}

// Get all available models
export function getVideoModels() { return providers.videoModels }
export function getImageModels() { return providers.imageModels }
export function getProviders() { return providers.providers }

// Filter models by tier
export function getModelsByTier(tier) {
    return {
        video: providers.videoModels.filter(m => m.tier === tier),
        image: providers.imageModels.filter(m => m.tier === tier),
    }
}

// Check which providers have valid keys
export function getActiveProviders() {
    const active = []
    if (KEYS.replicate) active.push('replicate')
    if (KEYS.huggingface) active.push('huggingface')
    return active
}

// ---- REPLICATE API ----

async function replicateRequest(path, body) {
    const res = await fetch(URLS.replicate + path, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${KEYS.replicate}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait',
        },
        body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Replicate error: ${res.status}`)
    return res.json()
}

async function replicateGenerate(modelId, input) {
    // Start prediction
    const prediction = await replicateRequest('/predictions', {
        model: modelId,
        input,
    })

    // If 'wait' header worked, result is immediate
    if (prediction.status === 'succeeded') return prediction.output

    // Otherwise poll
    return pollReplicate(prediction.urls.get)
}

async function pollReplicate(url, maxAttempts = 120) {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${KEYS.replicate}` },
        })
        const data = await res.json()
        if (data.status === 'succeeded') return data.output
        if (data.status === 'failed') throw new Error(data.error || 'Generation failed')
    }
    throw new Error('Generation timed out')
}

// ---- HUGGING FACE API ----

async function huggingfaceGenerate(modelId, input) {
    const res = await fetch(`${URLS.huggingface}/models/${modelId}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${KEYS.huggingface}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: input.prompt, parameters: input }),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HuggingFace error: ${res.status}`)
    }
    // Image models return blob
    const blob = await res.blob()
    return URL.createObjectURL(blob)
}

// ---- UNIFIED GENERATE FUNCTION ----

export async function generateVideo({ modelId, prompt, style, duration, resolution, onProgress }) {
    const model = providers.videoModels.find(m => m.id === modelId)
    if (!model) throw new Error('Unknown model: ' + modelId)

    const fullPrompt = style ? `${prompt}, ${style} style, seamless loop, VJ visual` : prompt

    if (model.provider === 'replicate') {
        return replicateGenerate(model.modelId, {
            prompt: fullPrompt,
            duration: duration || 5,
            resolution: resolution || '720p',
        })
    }

    throw new Error('Provider not supported for video: ' + model.provider)
}

export async function generateImage({ modelId, prompt, style, width, height }) {
    const model = providers.imageModels.find(m => m.id === modelId)
    if (!model) throw new Error('Unknown model: ' + modelId)

    const fullPrompt = style ? `${prompt}, ${style} style, VJ visual overlay` : prompt

    if (model.provider === 'replicate') {
        return replicateGenerate(model.modelId, {
            prompt: fullPrompt,
            width: width || 1024,
            height: height || 1024,
        })
    }

    if (model.provider === 'huggingface') {
        return huggingfaceGenerate(model.modelId, {
            prompt: fullPrompt,
            width: width || 1024,
            height: height || 1024,
        })
    }

    throw new Error('Provider not supported: ' + model.provider)
}

// ---- COST ESTIMATOR ----

export function estimateCost(modelId, type) {
    const models = type === 'video' ? providers.videoModels : providers.imageModels
    const model = models.find(m => m.id === modelId)
    return model ? model.price : 'Unknown'
}