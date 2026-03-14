# Cinematic Output Prompt Pack (Unreal + Unity)

Use these prompts to force high-fidelity cinematic output from any connected text/image/video generation model.

## 1) Global System Prompt

```text
You are a cinematic scene generation model for editor-only Unreal Engine 5.x and Unity 2023/2024 HDRP pipelines.
Always output deterministic, non-continuous commands and data.
Never rely on Tick, Update, Coroutines, Sequencer, Timeline, or frame-loop logic.
Target 4K EXR ACEScg path-traced output with physically based lighting and camera settings.
```

## 2) Scene Build Prompt

```text
Generate a production-ready scene package with these hard constraints:
- Resolution: 3840x2160 or 4096x2160
- Output: EXR half float, ACEScg
- Path tracing samples: 2048-4096
- Bounces: 6-12
- Denoiser: OFF for final
- Filmback: 36mm
- Camera focal lengths: 24, 35, 50, 85, 135
- Aperture range: f/1.4 to f/4
- Required AOVs: Beauty, Diffuse, Specular, Normal, Depth, MotionVectors, Emission, Cryptomatte
- Lighting: 8K-16K HDRI, physical key light, volumetric fog, ray-traced reflections and shadows
```

## 3) Asset Quality Enforcement Prompt

```text
Validate and reject assets that fail cinematic requirements:
- Reject BaseColor under 2K
- Reject missing Normal, Roughness, or Metallic/Roughness masks
- Reject missing displacement on terrain, rock, or architecture materials
- Warn if AO is missing
- Reject hero mesh under 10k vertices
- Reject missing UVs
- Reject missing LODs on large environment assets
- Reject non-PBR shaders
- Reject unbounded emission
- Require tags: Hero, Background, Terrain, Foliage, FX
- Require real-world meter scale
Output explicit reasons for every rejected asset.
```

## 4) Wormhole/Blackhole FX Prompt

```text
Generate a cinematic wormhole/blackhole effect specification:
- SDF volume core with domain-warped distortion
- Niagara/VFX Graph radial force + curl noise + dust/debris particles
- Post-process radial lensing with depth fade and chromatic aberration
- Event horizon absorption gradient (wormhole = violet core, blackhole = near-black core)
- Optional amoeba mass built from 128^3 SDF grid and marching cubes surface extraction
```

## 5) Camera Direction Prompt

```text
Generate five cinematic camera shots using cameras Cam_24mm, Cam_35mm, Cam_50mm, Cam_85mm, Cam_135mm.
For each camera, output:
- Lens intent
- Position and orientation
- Focus distance
- Exposure intent
- Expected emotional tone
Enforce physical camera behavior and shallow-to-medium depth of field.
```

## 6) One-Button Pipeline Prompt

```text
Produce a deterministic RunFullCinematicDemo execution payload with this exact sequence:
1) ValidateAssets
2) GenerateCinematicTerrain
3) StageHeroAssets
4) SetupCinematicLighting
5) SetupCameraRig
6) TriggerWormholeDemo
7) RenderCinematic
If any stage fails, stop execution and return stage-specific failure reason.
```

## 7) Negative Prompt Pack

```text
Do NOT output:
- low-poly placeholders in final shot
- non-PBR materials in hero frame
- blurry textures under 2K base color
- denoiser-smoothed final frames
- temporal smear from runtime frame loops
- UI overlays, debug widgets, gizmos, or editor chrome in final renders
```

## 8) Engine-Specific Extension Prompt (Unreal)

```text
Unreal extension:
- Use Nanite for hero meshes
- Configure Movie Render Queue for EXR half float and path tracing
- Use ACineCameraActor physical settings
- Use DirectionalLight + SkyLight(HDRI) + ExponentialHeightFog
- Emit validation report to Saved/Logs/CinematicAssetValidation.log
```

## 9) Engine-Specific Extension Prompt (Unity HDRP)

```text
Unity extension:
- Use HDRP physical camera mode
- Configure HDRP path tracing samples and bounces
- Use Global Volume with HDRI sky and volumetric fog
- Render EXR outputs per camera and include AOV manifest
- Emit validation report to Assets/CinematicValidationReport.txt
```
