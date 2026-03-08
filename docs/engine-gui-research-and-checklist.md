# Engine GUI Research and Applied Changes

## Research Inputs

Scientific/technical sources
- Fitts, P. M. (1954), *The information capacity of the human motor system in controlling the amplitude of movement*:
  - https://www.yorku.ca/mack/ijhcs2002/AI77.pdf
- Hick, W. E. (1952), *On the rate of gain of information*:
  - https://www.princeton.edu/~achaney/tmve/wiki100k/docs/Hick%27s_law.html
- Callahan et al. (1988), *An empirical comparison of pie vs linear menus*:
  - https://www.cs.umd.edu/class/spring2018/cmsc434/files/p39-callahan.pdf
- Split-attention effect overview and cited studies:
  - https://www.researchgate.net/publication/305646607_The_split-attention_effect

Comparable product UI documentation
- Blender workspaces and editor regioning:
  - https://docs.blender.org/manual/en/latest/interface/window_system/workspaces.html
- Unity Editor interface and dockable windows:
  - https://docs.unity3d.com/Manual/UsingTheEditor.html
- Unreal Editor interface:
  - https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-editor-interface

## What Was Implemented

1. Two-pane Scene Preview layout (viewport lane + staging lane)
- Why: reduces context switching and visual overlap by separating preview actions from asset queue management.
- Result in code: `src/pages/Engines.jsx` procedural preview card now uses split panes.

2. Dedicated Open Turntable hardware profile
- Why: prevents controller mismatch by binding controls to firmware-specific MIDI notes/CC values.
- Result in code: `src/pages/Engines.jsx` adds `open-turntable` profile and map:
  - Note `0x0C` cue -> add keyframe at playhead
  - Note `0x0B` play -> toggle selected layer visibility
  - CC `0x21` jog -> scrub playhead relative
  - CC `0x19` tempo -> map to scene FPS
  - CC `0x20` volume -> selected-layer intensity

3. Turntable deck state panel
- Why: increases recognition and reduces hidden state uncertainty during live performance.
- Result in code: `src/pages/Engines.jsx` adds live deck telemetry (jog delta, tempo/volume bars, cue count, last signal timestamp).

## Maintenance Notes

- If open-turntable firmware changes CC/note values, update `OPEN_TURNTABLE_MAP` in `src/pages/Engines.jsx`.
- Keep layout split unless a full docking system is introduced; this is the current low-complexity anti-overlap baseline.
- Re-run `npm run lint` and `npm run build` after any layout/control-map changes.

## Next UX Improvements

1. Add keyboard command palette for scene and staging actions (fewer pointer miles for expert users).
2. Add optional compact mode for laptops (smaller control lane and collapsible logs).
3. Add undo/redo history for live-control-driven changes (cue/keyframe safety).
4. Add latency and dropped-message diagnostics for MIDI/OSC sessions.
