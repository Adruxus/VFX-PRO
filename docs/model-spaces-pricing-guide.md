# Model, Space, and Generator Pricing Guide

_Last regenerated: 2026-03-09T10:26:11.460Z_

## Billing Formula (Current App Logic)

- Credit value: `0.01 USD` per credit
- Charge multiplier: `3.0x` provider cost
- User billed USD: `provider_cost * 3.0`
- Credits deducted: `ceil(user_billed_usd / 0.01)`
- Provider reserve: `provider_cost`
- Platform profit: `user_billed_usd - provider_cost`

## Quick Picks (Video)

- Cheapest configured video model: **Wan 2.1 (Text-to-Video)** ($0.080 provider, 24 credits billed)
- Highest quality configured video model: **Google Veo 3** (quality 10)
- Best quality-per-dollar (configured): **Live Portrait (Space)** (quality/cost ratio 102.50)

## Video Models

| Model | ID | Provider | Tier | Provider Cost | Billed (3x) | Credits | Profit | Quality | Resolution | Duration | Speed |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|---|
| Wan 2.1 (Text-to-Video) | wan-2.1-t2v | huggingface | budget | $0.080 | $0.240 | 24 | $0.160 | 7 | 480p-720p | 5s | 17-57s |
| Live Portrait (Space) | live-portrait | huggingface | budget | $0.080 | $0.240 | 24 | $0.160 | 8.2 | Space-defined | Driver-video length | 20-90s |
| Seedance 1 Fast (Lite) | seedance-1-lite | replicate | budget | $0.090 | $0.270 | 27 | $0.180 | 7.5 | 480p-1080p | 5-10s | 25-70s |
| Wan 2.1 (Space) | wan-2.1-space | huggingface | budget | $0.100 | $0.300 | 31 | $0.200 | 8 | 480p-720p | 4-8s | 30-180s |
| Hailuo 02 Fast | hailuo-02-fast | replicate | budget | $0.120 | $0.360 | 36 | $0.240 | 8 | 512p | 6-10s | 41-76s |
| LTX Video Fast (Space) | ltx-video-fast | huggingface | standard | $0.140 | $0.420 | 42 | $0.280 | 8.3 | 512p-720p | 4-8s | 20-80s |
| AI Video Composer (Space) | ai-video-composer | huggingface | standard | $0.160 | $0.480 | 48 | $0.320 | 7.9 | Space-defined | Space-defined | 20-90s |
| Stable Video Diffusion 1.1 (Space) | stable-video-diffusion-1.1 | huggingface | standard | $0.180 | $0.540 | 54 | $0.360 | 8.1 | 576x1024 | 2-4s | 20-70s |
| NSFW Uncensored Video (Space) | nsfw-uncensored-video | huggingface | premium | $0.200 | $0.600 | 61 | $0.400 | 8.4 | Space-defined | 3-8s | 30-120s |
| Wan2.2 Animate (Space) | wan-2.2-animate | huggingface | standard | $0.240 | $0.720 | 72 | $0.480 | 8.7 | 720p-1080p | 4-8s | 40-120s |
| Hailuo 02 | hailuo-02 | replicate | standard | $0.300 | $0.900 | 90 | $0.600 | 8.5 | 768p-1080p | 6-10s | 41-400s |
| Runway Gen-4 Turbo | runway-gen4-turbo | replicate | standard | $0.380 | $1.140 | 115 | $0.760 | 9 | 720p | 5-10s | 22-32s |
| Wan2.2 14B Fast (Space) | wan-2.2-14b-fast | huggingface | premium | $0.420 | $1.260 | 126 | $0.840 | 8.8 | 512p-720p | 3-8s | 30-140s |
| Seedance 1 Pro | seedance-1-pro | replicate | standard | $0.500 | $1.500 | 150 | $1.000 | 8.5 | 480p-1080p | 5-10s | 31-95s |
| Kling 2.1 | kling-2.1 | replicate | premium | $0.580 | $1.740 | 174 | $1.160 | 9 | 720p-1080p | 5-10s | 122-154s |
| Google Veo 3 Fast | veo-3-fast | replicate | premium | $3.200 | $9.600 | 961 | $6.400 | 9.5 | 1080p | 8s | 59s |
| Google Veo 3 | veo-3 | replicate | ultra | $6.000 | $18.000 | 1800 | $12.000 | 10 | 1080p | 8s | 92s |

## Image Models

| Model | ID | Provider | Tier | Provider Cost | Billed (3x) | Credits | Profit | Quality | Resolution | Speed |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| FLUX Schnell | flux-schnell | replicate | budget | $0.003 | $0.009 | 1 | $0.006 | 7.5 | up to 1440p | 1-2s |
| Stable Diffusion XL | sdxl | huggingface | free | $0.005 | $0.015 | 2 | $0.010 | 8 | 1024x1024 | 2-5s |
| Stable Diffusion 3.5 Large | sd-3.5-large | huggingface | free | $0.010 | $0.030 | 3 | $0.020 | 8.5 | 1024x1024 | 3-8s |
| FLUX Dev | flux-dev | replicate | standard | $0.025 | $0.075 | 8 | $0.050 | 8.5 | up to 1440p | 5-10s |
| FLUX 1.1 Pro | flux-1.1-pro | replicate | premium | $0.040 | $0.120 | 12 | $0.080 | 9 | up to 1440p | 3-6s |

## 3D Models

| Model | ID | Provider | Tier | Provider Cost | Billed (3x) | Credits | Profit | Quality | Resolution | Speed |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|
| 3D Arena (Space) | 3d-arena | huggingface | standard | $0.300 | $0.900 | 90 | $0.600 | 8.5 | Space-defined | Space-defined |
| TRELLIS.2 (Image-to-3D) | trellis-2 | huggingface | standard | $0.350 | $1.050 | 105 | $0.700 | 9.1 | 512-1536 | 1-3 min |
| Sparc3D (Space) | sparc3d | huggingface | premium | $0.400 | $1.200 | 121 | $0.800 | 8.9 | Space-defined | Space-defined |
| Hunyuan3D-2.1 | hunyuan3d-2.1 | huggingface | premium | $0.450 | $1.350 | 135 | $0.900 | 9.2 | Turbo/Fast/Standard | 2-5 min |

## External Alternatives To Consider

### Runway API (official pricing docs)

Assuming Runway API pricing unit is `1 credit = $0.001`:

| Model | Official unit price | 5s provider cost | 10s provider cost | Estimated billed at 3x | Notes |
|---|---:|---:|---:|---:|---|
| `gen4_turbo` | 5 credits/sec | $0.025 | $0.050 | $0.075 / $0.150 | Low-cost, high speed |
| `gen4_aleph` | 12 credits/sec | $0.060 | $0.120 | $0.180 / $0.360 | Better fidelity than turbo |
| `veo3.1_fast` (no audio) | 10 credits/sec | $0.050 | $0.100 | $0.150 / $0.300 | Strong quality/cost balance |
| `veo3.1_fast` (audio) | 15 credits/sec | $0.075 | $0.150 | $0.225 / $0.450 | Useful for synced audio output |
| `veo3.1` (with audio) | 25 credits/sec | $0.125 | $0.250 | $0.375 / $0.750 | Higher quality tier |
| `veo3` | 40 credits/sec | $0.200 | $0.400 | $0.600 / $1.200 | Premium cinematic tier |

### Replicate models with published example costs

| Model | Example provider cost from official page | 3x billed estimate | Notes |
|---|---:|---:|---|
| `wan-video/wan-2.2-fast` | $0.050 (480p), $0.100 (720p) per video | $0.150 / $0.300 | Low-cost text-to-video candidate |
| `pixverse/pixverse-v4` | $0.400 for 5s 720p Normal; up to $1.160 for 8s 1080p Ultra | $1.200 to $3.480 | Premium stylized output range |
| `camenduru/damo-text-to-video` | ~$0.069 per run | ~$0.207 | Legacy, very cheap baseline |
| `cjwbw/videocrafter2` | ~$0.120 per run | ~$0.360 | Legacy mid-cost baseline |
| `tencent/hunyuan-video` | ~$1.270 per run | ~$3.810 | Expensive but strong prompt compliance |

### Hugging Face Spaces runtime baseline

Hugging Face publishes hardware hourly pricing (for example, `Nvidia T4 small: $0.40/hour`, `A10G small: $1.00/hour`).  
To estimate provider cost for a Space job:

- `provider_cost ~= (runtime_seconds / 3600) * hardware_hourly_rate`
- `billed_usd ~= provider_cost * 3.0`
- `credits ~= ceil(billed_usd / 0.01)`

## Maintenance Checklist

1. Sync provider costs monthly against official pricing docs.
2. Run a calibration batch of 20 prompts/model and update `quality` and `speed` metadata from observed telemetry.
3. Keep `failoverModelIds` populated for every production video model.
4. Rebuild this guide whenever `src/config/ai-providers.json` or `src/config/pricing.json` changes.

## Sources

- Runway API model pricing docs: https://docs.dev.runwayml.com/guides/pricing-and-model-costs
- Hugging Face pricing (Inference + Spaces hardware): https://huggingface.co/pricing
- Hugging Face Inference API pricing overview: https://huggingface.co/docs/inference-providers/pricing
- Replicate pricing overview (example model costs): https://replicate.com/pricing
- Replicate Wan 2.2 model notes (cost examples): https://replicate.com/blog/wan-2-2
- Replicate text-to-video collection (model/cost examples including PixVerse, Hunyuan, legacy baselines): https://replicate.com/collections/text-to-video
- Seedance technical report: https://arxiv.org/abs/2508.14915
- Hunyuan3D 2.0 technical report: https://arxiv.org/abs/2501.12202

## Notes

- This document is generated from `src/config/ai-providers.json` and `src/config/pricing.json`.
- If you update provider costs, rerun this generation step to keep the guide current.
- Quality/speed fields come from your model catalog metadata and should be calibrated with production telemetry over time.
