# Licensed Asset Ingestion

This project now renders only real asset files in the engine preview.

## 1) Copy licensed files into the asset root

Use this folder structure:

```text
public/
  licensed-assets/
    PackNameA/
      character_knight.glb
      props_barrel.fbx
    PackNameB/
      ui_portrait.png
```

For your local desktop pack source, the ingestion flow now supports:
- `C:\Users\chadh\Desktop\game assets` archives (`.zip`, `.rar`) copied into `.cache/desktop-import-archives`
- extracted output into `public/licensed-assets/desktop-import/<pack_name>`

Supported model formats:
- `.glb`
- `.gltf`
- `.fbx`
- `.obj`

Supported sprite formats:
- `.png`
- `.jpg`
- `.jpeg`
- `.webp`

## 2) Regenerate the manifest

Run:

```bash
npm run assets:fetch   # optional: pulls configured itch/open-library packs
npm run assets:manifest
```

This writes:
- `public/licensed-assets/manifest.json` (runtime source used by the app)
- `src/data/licensedAssetManifest.generated.js` (small metadata snapshot)

The engine page fetches `manifest.json` at runtime, so large asset catalogs do not bloat the JS bundle.

## 3) Validate in the Engine page

1. Open `Engines`.
2. Confirm the "Licensed manifest" count is non-zero.
3. Stage assets into preview.
4. Export Unity/Unreal queues.

## 4) If you still see placeholders or no meshes

- Ensure actual model files exist in `public/licensed-assets` (not checklist JSON metadata).
- Prefer `.glb` for complete material/texture portability.
- Re-run `npm run assets:manifest` after every asset sync.
