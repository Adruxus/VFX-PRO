import { Slider } from '@/components/ui/slider'

function Meter({ value = 0, tone = 'from-cyan-400 via-sky-300 to-emerald-300' }) {
    const width = Math.max(0, Math.min(100, Math.round(Number(value || 0) * 100)))
    return (
        <div className='h-1.5 rounded bg-slate-900/80 overflow-hidden'>
            <div className={`h-full bg-gradient-to-r ${tone}`} style={{ width: `${width}%` }} />
        </div>
    )
}

function Knob({ label, value = 0, onChange }) {
    const angle = -135 + Math.round(Number(value || 0) * 270)
    return (
        <div className='rounded border border-cyan-500/20 bg-[#091327] p-2 text-center'>
            <div className='mx-auto h-12 w-12 rounded-full border border-cyan-400/30 bg-[#0c1833] relative'>
                <div
                    className='absolute left-1/2 top-1/2 h-[18px] w-[2px] -translate-x-1/2 -translate-y-[90%] rounded bg-cyan-200'
                    style={{ transform: `translate(-50%, -90%) rotate(${angle}deg)` }}
                />
            </div>
            <p className='mt-1 text-[11px] text-cyan-200'>{label}</p>
            <Slider value={[Number(value || 0)]} onValueChange={(next) => onChange(next?.[0] ?? 0)} min={0} max={1} step={0.01} />
        </div>
    )
}

export default function BubbaDeckPanel({ deckState, onControlChange }) {
    const crossfader = Number(deckState?.crossfaderNormalized ?? 0.5)
    const tempo = Number(deckState?.tempoNormalized ?? 0.5)
    const lowEq = Number(deckState?.lowEqNormalized ?? 0.5)
    const highEq = Number(deckState?.highEqNormalized ?? 0.5)
    const deckA = Math.max(0, Math.min(1, 1 - crossfader))
    const deckB = Math.max(0, Math.min(1, crossfader))

    return (
        <div className='rounded-md border border-cyan-500/30 bg-gradient-to-b from-[#071024] to-[#0b1730] p-3 text-xs text-slate-200 space-y-3'>
            <div className='flex items-center justify-between'>
                <p className='text-cyan-100 font-medium'>BuBBa Deck Mixer</p>
                <p className='text-[11px] text-slate-400'>{deckState?.playing ? 'Playback: Running' : 'Playback: Paused'}</p>
            </div>
            <div className='grid gap-3 md:grid-cols-2'>
                <div className='space-y-2 rounded border border-cyan-500/20 bg-[#081125] p-2'>
                    <p className='text-cyan-200'>Deck A</p>
                    <Meter value={deckA} tone='from-emerald-400 via-teal-300 to-cyan-300' />
                    <Knob label='Low EQ' value={lowEq} onChange={(value) => onControlChange('lowEqNormalized', value)} />
                </div>
                <div className='space-y-2 rounded border border-cyan-500/20 bg-[#081125] p-2'>
                    <p className='text-cyan-200'>Deck B</p>
                    <Meter value={deckB} tone='from-fuchsia-400 via-pink-300 to-amber-300' />
                    <Knob label='High EQ' value={highEq} onChange={(value) => onControlChange('highEqNormalized', value)} />
                </div>
            </div>
            <div className='space-y-1'>
                <p>Crossfader</p>
                <Slider value={[crossfader]} onValueChange={(next) => onControlChange('crossfaderNormalized', next?.[0] ?? 0.5)} min={0} max={1} step={0.01} />
            </div>
            <div className='space-y-1'>
                <p>Tempo</p>
                <Slider value={[tempo]} onValueChange={(next) => onControlChange('tempoNormalized', next?.[0] ?? 0.5)} min={0} max={1} step={0.01} />
            </div>
            <div className='grid gap-2 md:grid-cols-2 text-[11px] text-slate-400'>
                <p>Cue taps: {deckState?.cueCount || 0}</p>
                <p>Last jog: {deckState?.jogDelta || 0}</p>
            </div>
        </div>
    )
}

