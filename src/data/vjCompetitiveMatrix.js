export const VJ_COMPETITIVE_SCOPE = {
    generatedAt: '2026-03-06',
    baselineProducts: ['Resolume Arena', 'TouchDesigner', 'MadMapper', 'Millumin', 'VDMX'],
    note: 'Comparison baseline uses official documentation and product manuals for major VJ platforms.',
}

export const VJ_COMPETITIVE_SOURCES = [
    {
        id: 'resolume-arena',
        label: 'Resolume Arena Product Page',
        url: 'https://resolume.com/software/arena',
    },
    {
        id: 'resolume-websocket',
        label: 'Resolume API (WebSocket)',
        url: 'https://resolume.com/support/en/api',
    },
    {
        id: 'touchdesigner-artnet',
        label: 'TouchDesigner Art-Net CHOP',
        url: 'https://docs.derivative.ca/Art-Net_CHOP',
    },
    {
        id: 'touchdesigner-ndi',
        label: 'TouchDesigner NDI Out TOP',
        url: 'https://docs.derivative.ca/NDI_Out_TOP',
    },
    {
        id: 'madmapper-quickstart',
        label: 'MadMapper QuickStart Guide',
        url: 'https://madmapper.com/manuals/MadMapper-Quickstart-Guide.pdf',
    },
    {
        id: 'millumin-protocols',
        label: 'Millumin Input/Output Protocol Support',
        url: 'https://help.millumin.com/docs/v4/control-devices/input-output-protocols/',
    },
    {
        id: 'vdmx-data-io',
        label: 'VDMX Data I/O Tutorials',
        url: 'https://vdmx.vidvox.net/tutorials/vdmx-data-io-basics',
    },
]

export const VJ_COMPETITIVE_FEATURES = [
    {
        id: 'scene-editor',
        capability: 'Layer timeline + node graph scene authoring',
        topTools: 'TouchDesigner, Resolume, VDMX',
        status: 'partial',
        evidence: 'Engines page has timeline, node graph, and keyframe authoring.',
        nextStep: 'Add live clip deck triggering and per-layer effect chains.',
    },
    {
        id: 'protocol-midi-osc',
        capability: 'Live protocol ingest (MIDI + OSC)',
        topTools: 'Resolume, TouchDesigner, Millumin, VDMX',
        status: 'done',
        evidence: 'Live Control panel supports Web MIDI input and OSC-over-WebSocket bridge.',
    },
    {
        id: 'protocol-dmx',
        capability: 'Lighting protocol ingest (Art-Net/DMX/sACN)',
        topTools: 'MadMapper, TouchDesigner, Millumin',
        status: 'todo',
        evidence: 'No Art-Net/DMX receiver is wired into editor controls yet.',
        nextStep: 'Add Art-Net/sACN gateway service and DMX patch matrix.',
    },
    {
        id: 'multi-output-mapping',
        capability: 'Projection mapping + soft-edge blend + multi-output routing',
        topTools: 'Resolume Arena, MadMapper, Millumin',
        status: 'todo',
        evidence: 'No output surface editor or edge blend controls are present.',
        nextStep: 'Implement surface mesh mapper and projector output profile manager.',
    },
    {
        id: 'runtime-bridge',
        capability: 'Engine runtime bridge for Unreal/Unity',
        topTools: 'TouchDesigner via TouchEngine and custom pipelines',
        status: 'partial',
        evidence: 'WebSocket bridge exists with scene payload sync and mock fallback.',
        nextStep: 'Harden with production listeners, auth, and persistent ACK telemetry.',
    },
    {
        id: 'audio-reactive-pipeline',
        capability: 'Audio analysis and reactive sequencing',
        topTools: 'Resolume, TouchDesigner, VDMX',
        status: 'partial',
        evidence: 'Backend includes audio analysis and mood-based visual suggestions.',
        nextStep: 'Add live BPM/onset stream to drive timeline and parameters in real time.',
    },
    {
        id: 'video-io',
        capability: 'Pro video I/O (NDI, Spout, Syphon)',
        topTools: 'TouchDesigner, Resolume, Millumin',
        status: 'todo',
        evidence: 'No NDI/Spout/Syphon transport currently exposed in UI or bridge.',
        nextStep: 'Add transport adapters and per-output endpoint configuration.',
    },
    {
        id: 'timecode-sync',
        capability: 'Timecode sync (LTC/MTC/OSC clock)',
        topTools: 'Millumin, VDMX, Resolume',
        status: 'todo',
        evidence: 'No dedicated timecode clock ingest/egress yet.',
        nextStep: 'Add global transport clock with LTC/MTC adapters.',
    },
    {
        id: 'cinematic-pipeline',
        capability: '4K cinematic scene generation for Unreal/Unity',
        topTools: 'Custom pipelines (not a primary feature in classic VJ apps)',
        status: 'partial',
        evidence: 'Manifests, terrain/morph/wormhole modules, and render orchestration scaffolding are present.',
        nextStep: 'Complete end-to-end automated render execution and output validation.',
    },
]
