import { useRef, useState, useCallback, useEffect } from 'react'
import WaveSurfer from 'wavesurfer.js'

export function useWaveform(containerRef, audioUrl) {
    const ws = useRef(null)
    const [playing, setPlaying] = useState(false)
    const [time, setTime] = useState(0)
    const [dur, setDur] = useState(0)
    const [ready, setReady] = useState(false)

    useEffect(() => {
        if (!containerRef.current || !audioUrl) return
        ws.current = WaveSurfer.create({
            container: containerRef.current,
            waveColor: 'rgba(168,85,247,0.4)',
            progressColor: 'rgba(236,72,153,0.8)',
            cursorColor: '#a855f7',
            barWidth: 2, barGap: 1, barRadius: 2,
            height: 80, normalize: true, url: audioUrl,
        })
        ws.current.on('ready', () => { setReady(true); setDur(ws.current.getDuration()) })
        ws.current.on('play', () => setPlaying(true))
        ws.current.on('pause', () => setPlaying(false))
        ws.current.on('timeupdate', t => setTime(t))
        return () => ws.current?.destroy()
    }, [audioUrl])

    const toggle = useCallback(() => ws.current?.playPause(), [])
    const seek = useCallback(p => ws.current?.seekTo(p), [])

    return { playing, time, dur, ready, toggle, seek, ws: ws.current }
}