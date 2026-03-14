# Desktop Pack Source Reference

This maps the assets from `C:\Users\chadh\Desktop\game assets` to source pages and integration notes used in the engine.

## Imported Desktop Packs

1. `brackeys_3d_game_assets.zip`
- Reference: https://github.com/Mediocre/3DAssets
- Integration: extracted into `public/licensed-assets/desktop-import/brackeys_3d_game_assets`

2. `Characters_psx.rar`
- Reference: https://heart-some.itch.io/characters-psx
- Integration: extracted into `public/licensed-assets/desktop-import/Characters_psx`

3. `KayKit_Adventurers_2.0_FREE.zip`
- Reference: https://kaylousberg.itch.io/kaykit-adventurers
- Integration: extracted into `public/licensed-assets/desktop-import/KayKit_Adventurers_2.0_FREE`

4. `KayKit_City_Builder_Bits_1.0_FREE.zip`
- Reference: https://kaylousberg.itch.io/kaykit-city-builder-bits
- Integration: extracted into `public/licensed-assets/desktop-import/KayKit_City_Builder_Bits_1.0_FREE`

5. `modular_village_collection.zip`
- Reference: https://fennecchen.itch.io/modular-village-collection
- Integration: extracted into `public/licensed-assets/desktop-import/modular_village_collection`

6. `Modular Character Outfits - Fantasy[Standard].zip`
- Reference: https://quaternius.itch.io/modular-character-outfits-fantasy
- Integration: extracted into `public/licensed-assets/desktop-import/Modular_Character_Outfits_-_Fantasy_Standard_`

7. `Stylized Nature MegaKit[Standard].zip`
- Reference: https://quaternius.itch.io/stylized-nature-megakit
- Integration: extracted into `public/licensed-assets/desktop-import/Stylized_Nature_MegaKit_Standard_`

8. `Ultimate Platformer Pack by Quaternius.zip`
- Reference: https://quaternius.itch.io/ultimate-platformer-pack
- Integration: extracted into `public/licensed-assets/desktop-import/Ultimate_Platformer_Pack_by_Quaternius`

9. `Universal Base Characters[Standard].zip`
- Reference: https://quaternius.itch.io/universal-base-characters
- Integration: extracted into `public/licensed-assets/desktop-import/Universal_Base_Characters_Standard_`

10. `futuristic low poly city by niko.blend`
- Source page not conclusively identified by filename alone.
- Integration: copied into `public/licensed-assets/desktop-import/futuristic_low_poly_city_by_niko`

## File Format Implementation Rules

- Runtime-rendered formats in this app:
  - `.glb`, `.gltf`, `.fbx`, `.obj`, `.png`, `.jpg`, `.jpeg`, `.webp`
- Primary technical references:
  - three.js glTF loading guidance: https://threejs.org/manual/#en/load-gltf
  - three.js OBJ loading guidance: https://threejs.org/manual/#en/load-obj
  - three.js FBX loader API: https://threejs.org/docs/#examples/en/loaders/FBXLoader
  - Blender glTF export docs: https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html

## Notes on `.blend`

- `.blend` is not a direct runtime input for three.js in this engine.
- Recommended conversion path is Blender export to `.glb`/`.gltf`, then re-run:
  1. `npm run assets:manifest`
  2. `npm run verify:engine`

