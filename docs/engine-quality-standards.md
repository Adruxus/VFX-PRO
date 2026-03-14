# Engine Quality Standards (Cross-Verified)

This document maps implementation decisions to technical standards and references used during the current engine pass.

## Standards and References

- Three.js renderer color/tone mapping guidance:
  - https://threejs.org/manual/#en/color-management
  - https://threejs.org/docs/#api/en/renderers/WebGLRenderer.toneMapping
- glTF 2.0 ecosystem and PBR workflow:
  - https://www.khronos.org/gltf/
  - https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- Engine coordinate/unit conventions:
  - Unity manual (world units and scale): https://docs.unity3d.com/Manual/ModelingOptimizedCharacters.html
  - Unreal scale conventions (centimeter world): https://dev.epicgames.com/documentation/en-us/unreal-engine/units-of-measurement-in-unreal-engine
- Mesh simplification and LOD research baselines:
  - Garland & Heckbert, Quadric Error Metrics (SIGGRAPH 1997): https://www.cs.cmu.edu/~garland/quadrics/
  - Hoppe, Progressive Meshes (SIGGRAPH 1996): https://hhoppe.com/proj/pm/

## What Was Implemented

1. Real-asset runtime manifest pipeline
- Runtime source moved to `public/licensed-assets/manifest.json`.
- The engine fetches the manifest at runtime to avoid large JS bundles.

2. Real file ingestion and extraction
- Automated itch and open-library downloader: `scripts/fetch-licensed-assets.ps1`.
- Manifest generation and metadata normalization: `scripts/generate-asset-manifest.mjs`.

3. Renderer quality and model normalization
- ACES filmic tone mapping + sRGB output configured in viewport.
- Imported model bounds are normalized to a stable stage size for consistent framing.

4. Cross-verification automation
- `scripts/verify-engine-implementation.mjs` checks:
  - no legacy demo presets
  - no open-turntable references
  - no procedural proxy path
  - loader coverage for GLTF/FBX/OBJ
  - manifest volume and required fields
  - actual model files in storage
- Report output: `docs/engine-verification.json`.

## Ongoing Maintenance

1. Add/update asset packs under `public/licensed-assets`.
2. Run `npm run assets:manifest`.
3. Run `npm run verify:engine`.
4. Run `npm run qa:full` before deploy.

