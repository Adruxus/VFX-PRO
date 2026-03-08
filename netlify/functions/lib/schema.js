import { z } from 'zod'

const ResolutionPattern = /^\d{3,5}x\d{3,5}$/
const VersionPattern = /^\d+\.\d+\.\d+$/

export const GenerationRequestSchema = z.object({
    project_name: z.string().min(1).max(120),
    seed_prompt: z.string().min(3).max(4000),
    style: z.string().min(1).max(120),
    duration_seconds: z.number().min(1).max(600),
    frame_rate: z.number().int().min(12).max(240),
    resolution: z.string().regex(ResolutionPattern, 'Expected format: WIDTHxHEIGHT'),
    loop_type: z.string().min(1).max(80),
    tempo_bpm: z.number().min(20).max(300).nullable(),
    audio_reactive: z.boolean(),
    color_palette: z.array(z.string().min(1).max(32)).max(16),
    asset_type: z.string().min(1).max(80),
    export_targets: z.array(z.string().min(1).max(80)).min(1).max(12),
    variants: z.object({
        count: z.number().int().min(1).max(20),
        diversity: z.string().min(1).max(64),
    }),
    constraints: z.object({
        max_triangles: z.number().int().min(1).max(20000000).nullable(),
        max_texture_size: z.number().int().min(128).max(16384).nullable(),
        max_file_size_mb: z.number().min(1).max(4096).nullable(),
        gpu_budget_ms: z.number().min(0.1).max(200).nullable(),
    }),
    metadata: z.object({
        tags: z.array(z.string().min(1).max(64)).max(32),
        license: z.string().min(1).max(120),
        author: z.string().min(1).max(120),
        project_version: z.string().regex(VersionPattern, 'Expected semantic version (e.g. 1.0.0)'),
    }),
    callbacks: z.object({
        webhook_url: z.string().url().nullable(),
        notify_on_complete: z.boolean(),
    }),
})

export const EnginePushSchema = z.object({
    asset_id: z.string().min(3).max(120),
    target: z.enum(['unreal', 'unity']),
    endpoint: z.string().url().or(z.string().startsWith('ws://')).or(z.string().startsWith('wss://')).optional(),
    hot_reload: z.boolean().optional().default(true),
    fidelity_mode: z.enum(['performance', 'quality']).optional().default('quality'),
})

export const PipelineExecuteSchema = z.object({
    request_id: z.string().min(1).max(120),
    scene_name: z.string().min(1).max(200),
    target: z.enum(['unreal', 'unity']),
    terrain: z.object({
        resolution: z.number().int().min(33).max(4097),
        world_scale: z.number().min(1).max(10000),
        height_scale: z.number().min(1).max(20000),
        seed: z.number().int().min(0).max(2147483647),
    }),
    asset_staging: z.object({
        asset_paths: z.array(z.string().min(1).max(512)).max(200),
        stage_origin: z.object({
            x: z.number(),
            y: z.number(),
            z: z.number(),
        }),
        grid_spacing: z.number().min(1).max(5000),
        validate_pbr: z.boolean(),
    }),
    morph: z.object({
        source_asset_path: z.string().min(1).max(512),
        target_asset_path: z.string().min(1).max(512),
        alpha: z.number().min(0).max(1),
        use_sdf_fallback: z.boolean(),
    }),
    wormhole: z.object({
        mode: z.enum(['wormhole', 'blackhole']),
        center: z.object({
            x: z.number(),
            y: z.number(),
            z: z.number(),
        }),
        radius: z.number().min(0.01).max(100000),
        distortion_strength: z.number().min(0).max(100),
        particle_budget: z.number().int().min(0).max(1000000),
    }),
    capture: z.object({
        camera_names: z.array(z.string().min(1).max(120)).min(1).max(64),
        resolution: z.object({
            x: z.number().int().min(256).max(16384),
            y: z.number().int().min(256).max(16384),
        }),
        frame_rate: z.number().int().min(1).max(240),
        output_directory: z.string().min(1).max(512),
    }),
})

export const ProviderJobCreateSchema = z.object({
    type: z.enum(['video', 'image', '3d']).optional().default('video'),
    provider: z.string().min(1).max(80),
    model_id: z.string().min(1).max(200),
    user_id: z.string().min(1).max(200).optional(),
    user_tier: z.string().min(1).max(80).optional(),
    prompt_excerpt: z.string().max(500).optional(),
    metadata: z.record(z.any()).nullable().optional(),
    webhook_url: z.string().url().nullable().optional(),
    external_job_id: z.string().max(200).optional(),
})

export const ProviderJobEventSchema = z.object({
    status: z.string().min(1).max(80),
    message: z.string().max(800).optional(),
    metadata: z.record(z.any()).nullable().optional(),
    result_url: z.string().max(2048).optional(),
    external_job_id: z.string().max(200).optional(),
    provider_payload: z.record(z.any()).nullable().optional(),
})

export const ProviderWebhookSchema = z
    .object({
        provider: z.string().min(1).max(80),
        provider_job_id: z.string().min(3).max(200).optional(),
        external_job_id: z.string().min(3).max(200).optional(),
        status: z.string().min(1).max(80),
        message: z.string().max(800).optional(),
        result_url: z.string().max(2048).optional(),
        metadata: z.record(z.any()).nullable().optional(),
        provider_payload: z.record(z.any()).nullable().optional(),
    })
    .refine((payload) => Boolean(payload.provider_job_id || payload.external_job_id), {
        message: 'provider_job_id or external_job_id is required',
        path: ['provider_job_id'],
    })

export const BillingLedgerEntrySchema = z.object({
    user_id: z.string().min(1).max(200),
    timestamp: z.string().datetime().optional(),
    operation: z.string().min(1).max(120),
    model_id: z.string().max(200).nullable().optional(),
    provider: z.string().min(1).max(120),
    credits: z.number().min(0),
    billed_usd: z.number().min(0),
    provider_reserve_usd: z.number().min(0),
    platform_profit_usd: z.number().min(0),
    charge_multiplier: z.number().min(0).nullable().optional(),
    configured_provider_cost_usd: z.number().min(0).nullable().optional(),
    model_tier: z.string().max(80).nullable().optional(),
    provider_settlement_bucket: z.string().max(120).nullable().optional(),
    platform_settlement_bucket: z.string().max(120).nullable().optional(),
    metadata: z.record(z.any()).nullable().optional(),
})

export function validateSchema(schema, payload) {
    const parsed = schema.safeParse(payload)
    if (parsed.success) return { ok: true, value: parsed.data }
    return {
        ok: false,
        errors: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.') || '(root)',
            message: issue.message,
        })),
    }
}
