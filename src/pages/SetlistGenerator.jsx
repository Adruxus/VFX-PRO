import { Helmet } from 'react-helmet-async'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { UploadSimple, MusicNotes, MagicWand, DownloadSimple, Play, Sparkle, Clock, Lightning } from '@/components/icons/futureIcons'
import { toast } from 'sonner'
import { analyzeAudio, getCredits } from '@/services/backend'
import { useUser } from '@clerk/clerk-react'
import { parseMetadata } from '@/services/audioAnalysis'
import { useAccessControl } from '@/services/accessControl'

export default function SetlistGenerator() {
    const { user } = useUser()
    const { effectivePlan } = useAccessControl()
    const [audioFiles, setAudioFiles] = useState([])
    const [analyzing, setAnalyzing] = useState(false)
    const [setlist, setSetlist] = useState(null)
    const [credits, setCredits] = useState(100)

    useEffect(() => {
        let active = true
        if (user) {
            getCredits(user.id, effectivePlan)
                .then(data => {
                    if (!active) return
                    setCredits(data.credits || 0)
                })
                .catch(() => {
                    if (!active) return
                    setCredits(0)
                })
        } else {
            setCredits(100)
        }
        return () => {
            active = false
        }
    }, [effectivePlan, user])

    const onDrop = useCallback(async (acceptedFiles) => {
        const audio = acceptedFiles.filter(f =>
            f.type.startsWith('audio/') || f.name.match(/\.(mp3|wav)$/i)
        )
        if (audio.length === 0) {
            toast.error('Please upload MP3 or WAV files')
            return
        }

        const processed = await Promise.all(audio.map(async (file) => {
            try {
                const metadata = await parseMetadata(file)
                return {
                    file,
                    name: metadata.title || file.name.replace(/\.(mp3|wav)$/i, ''),
                    duration: metadata.duration || 180,
                    bpm: metadata.bpm || 120,
                    key: metadata.key || null,
                    energy: 0.5
                }
            } catch {
                return {
                    file,
                    name: file.name.replace(/\.(mp3|wav)$/i, ''),
                    duration: 180,
                    bpm: 120,
                    key: null,
                    energy: 0.5
                }
            }
        }))

        setAudioFiles(processed)
        toast.success(`${processed.length} files uploaded`)
    }, [])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'audio/mpeg': ['.mp3'], 'audio/wav': ['.wav'] },
        multiple: true
    })

    const analyzeSetlist = async () => {
        if (!user) {
            toast.error('Please sign in to generate setlist')
            return
        }

        const cost = audioFiles.length * 20
        if (credits < cost) {
            toast.error(`Insufficient credits. Need ${cost}, have ${credits}`)
            return
        }

        setAnalyzing(true)
        toast.info('Analyzing with Galaxy AI...')

        try {
            const result = await analyzeAudio({
                userId: user.id,
                userTier: effectivePlan,
                email: user.primaryEmailAddress?.emailAddress,
                tracks: audioFiles.map(f => ({
                    name: f.name,
                    duration: f.duration,
                    bpm: f.bpm,
                    key: f.key,
                    energy: f.energy
                }))
            })

            if (result.error) {
                toast.error(result.error)
            } else {
                setSetlist({
                    id: result.setlist_id,
                    tracks: result.tracks,
                    totalDuration: result.total_duration
                })
                setCredits(result.credits_remaining)
                toast.success(`Setlist generated! ${result.credits_remaining} credits remaining`)
            }
        } catch (error) {
            toast.error('Analysis failed: ' + error.message)
        } finally {
            setAnalyzing(false)
        }
    }

    return (
        <>
            <Helmet><title>Setlist Generator - VJ Studio Pro</title></Helmet>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2">AI Setlist Generator</h1>
                        <p className="text-gray-400">Upload music and get AI-generated visual storyboards</p>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                        <Sparkle className="w-4 h-4 text-purple-400" />
                        <span className="text-sm font-medium text-purple-400">{credits} Credits</span>
                    </div>
                </div>

                {!setlist && (
                    <Card className="bg-slate-900/50 border-purple-500/20">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2">
                                <MusicNotes className="w-5 h-5" />Upload Audio Files
                            </CardTitle>
                            <CardDescription className="text-gray-400">
                                MP3/WAV files - AI analyzes BPM, key, energy, creates visual suggestions
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer ${isDragActive ? 'border-purple-500 bg-purple-500/10' : 'border-purple-500/20 hover:border-purple-500/40'}`}>
                                <input {...getInputProps()} />
                                <UploadSimple className="w-12 h-12 text-purple-400 mx-auto mb-4" />
                                <p className="text-white font-medium mb-2">
                                    {isDragActive ? 'Drop files here...' : 'Drag & drop audio files'}
                                </p>
                                <p className="text-sm text-gray-400">MP3 and WAV supported</p>
                            </div>

                            {audioFiles.length > 0 && (
                                <div className="mt-6 space-y-3">
                                    <h3 className="text-white font-medium">Files ({audioFiles.length})</h3>
                                    <div className="space-y-2 max-h-60 overflow-y-auto">
                                        {audioFiles.map((file, i) => (
                                            <div key={i} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                                                <MusicNotes className="w-4 h-4 text-purple-400" />
                                                <span className="text-white text-sm flex-1">{file.name}</span>
                                                <span className="text-gray-400 text-xs">{Math.floor(file.duration/60)}:{(file.duration%60).toString().padStart(2,'0')}</span>
                                                <span className="text-gray-400 text-xs">{file.bpm} BPM</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-400">
                                            Cost: {audioFiles.length * 20} credits
                                        </span>
                                        <Button 
                                            onClick={analyzeSetlist} 
                                            disabled={analyzing || !user} 
                                            className="bg-gradient-to-r from-purple-500 to-pink-500"
                                        >
                                            {analyzing ? (
                                                <><Sparkle className="w-4 h-4 mr-2 animate-spin" />Analyzing...</>
                                            ) : (
                                                <><MagicWand className="w-4 h-4 mr-2" />Generate Setlist</>
                                            )}
                                        </Button>
                                    </div>
                                    {!user && <p className="text-xs text-yellow-400 text-center">Sign in to generate</p>}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {setlist && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-bold text-white">Visual Setlist</h2>
                                <p className="text-gray-400">{setlist.tracks.length} tracks • {Math.floor(setlist.totalDuration/60)} min</p>
                            </div>
                            <div className="flex gap-3">
                                <Button variant="outline" className="border-purple-500/20" onClick={() => setSetlist(null)}>New Set</Button>
                                <Button className="bg-gradient-to-r from-purple-500 to-pink-500">
                                    <DownloadSimple className="w-4 h-4 mr-2" />Export
                                </Button>
                            </div>
                        </div>

                        {setlist.tracks.map((track, i) => (
                            <Card key={i} className="bg-slate-900/50 border-purple-500/20">
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <CardTitle className="text-white flex items-center gap-3">
                                                <span className="text-purple-400">#{i+1}</span>{track.name}
                                            </CardTitle>
                                            <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{Math.floor(track.duration/60)}:{(track.duration%60).toString().padStart(2,'0')}</span>
                                                <span className="flex items-center gap-1"><Lightning className="w-3 h-3" />{track.bpm} BPM</span>
                                                <span>Key: {track.key}</span>
                                                <span className="px-2 py-1 bg-purple-500/10 border border-purple-500/20 rounded text-purple-400">{track.mood}</span>
                                            </div>
                                        </div>
                                        <Button size="sm" variant="ghost"><Play className="w-4 h-4" /></Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <h4 className="text-white font-medium text-sm mb-3">Visual Storyboard</h4>
                                    <div className="grid gap-3">
                                        {(track.visualSuggestions || []).map((v, vi) => (
                                            <div key={vi} className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-lg border border-purple-500/10">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs font-medium text-purple-400 uppercase">{v.type}</span>
                                                        <span className="text-xs text-gray-400">{v.duration}s</span>
                                                    </div>
                                                    <p className="text-sm text-white">{v.style}</p>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <span className="text-xs px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded text-purple-400">{v.assetType}</span>
                                                        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                            <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500" style={{width: `${v.intensity*100}%`}} />
                                                        </div>
                                                        <span className="text-xs text-gray-400">{Math.round(v.intensity*100)}%</span>
                                                    </div>
                                                </div>
                                                <Button size="sm" variant="outline" className="border-purple-500/20">Generate</Button>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </>
    )
}

