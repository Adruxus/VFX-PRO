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
        const instance = ws.current
        instance.on('ready', () => { setReady(true); setDur(instance.getDuration()) })
        instance.on('play', () => setPlaying(true))
        instance.on('pause', () => setPlaying(false))
        instance.on('timeupdate', t => setTime(t))
        return () => {
            instance.unAll?.()
            instance.destroy?.({ removeMediaElement: true })
        }
    }, [audioUrl, containerRef])

    const toggle = useCallback(() => ws.current?.playPause(), [])
    const seek = useCallback(p => ws.current?.seekTo(p), [])

    return { playing, time, dur, ready, toggle, seek, ws: ws.current }
}
