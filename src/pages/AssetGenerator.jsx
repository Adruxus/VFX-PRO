import { Helmet } from 'react-helmet-async'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { useState, useEffect } from 'react'
import { Wand2, Video, Code, Sparkles, Palette, Layers, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { generateVideo, generateImage, getCredits } from '@/services/backend'
import { useUser } from '@clerk/clerk-react'
import providers from '@/config/ai-providers.json'

export default function AssetGenerator() {
    const { user } = useUser()
    const [assetType, setAssetType] = useState('loops')
    const [prompt, setPrompt] = useState('')
    const [style, setStyle] = useState('psychedelic')
    const [duration, setDuration] = useState([10])
    const [credits, setCredits] = useState(100)
    const [generating, setGenerating] = useState(false)
    const [resultUrl, setResultUrl] = useState(null)
    const [selectedModel, setSelectedModel] = useState('')

    useEffect(() => {
        if (user) {
            getCredits(user.id).then(data => {
                setCredits(data.credits || 0)
            })
        }
    }, [user])

    const assetTypes = [
        { id: 'loops', name: 'Loops', icon: Video, formats: ['MP4','MOV','DXV'], type: 'video' },
        { id: 'shaders', name: 'Shaders', icon: Code, formats: ['GLSL','ISF'], type: 'image' },
        { id: 'generative', name: 'Generative', icon: Sparkles, formats: ['TOE','JS'], type: 'image' },
        { id: 'luts', name: 'LUTs', icon: Palette, formats: ['CUBE','3DL'], type: 'image' },
        { id: 'overlays', name: 'Overlays', icon: Layers, formats: ['PNG','WEBM'], type: 'image' }
    ]

    const currentType = assetTypes.find(t => t.id === assetType)
    const models = currentType?.type === 'video' 
        ? providers.videoModels 
        : providers.imageModels

    const handleGenerate = async () => {
        if (!user) {
            toast.error('Please sign in to generate assets')
            return
        }
        if (!prompt) {
            toast.error('Please enter a prompt')
            return
        }
        if (!selectedModel) {
            toast.error('Please select a model')
            return
        }

        const cost = currentType?.type === 'video' ? (duration[0] === 10 ? 100 : 50) : 10
        if (credits < cost) {
            toast.error(`Insufficient credits. Need ${cost}, have ${credits}`)
            return
        }

        setGenerating(true)
        setResultUrl(null)
        toast.info(`Generating with ${cost} credits...`)

        try {
            if (currentType?.type === 'video') {
                const result = await generateVideo({
                    userId: user.id,
                    email: user.primaryEmailAddress?.emailAddress,
                    modelId: selectedModel,
                    prompt,
                    style,
                    duration: duration[0],
                    resolution: '720p'
                })

                if (result.error) {
                    toast.error(result.error)
                } else {
                    setResultUrl(result.result_url)
                    setCredits(result.credits_remaining)
                    toast.success(`Generated! ${result.credits_remaining} credits remaining`)
                }
            } else {
                const model = models.find(m => m.id === selectedModel)
                const result = await generateImage({
                    userId: user.id,
                    email: user.primaryEmailAddress?.emailAddress,
                    modelId: selectedModel,
                    prompt,
                    style,
                    width: 1024,
                    height: 1024,
                    provider: model?.provider
                })

                if (result.error) {
                    toast.error(result.error)
                } else {
                    setResultUrl(result.result_url)
                    setCredits(result.credits_remaining)
                    toast.success(`Generated! ${result.credits_remaining} credits remaining`)
                }
            }
        } catch (error) {
            toast.error('Generation failed: ' + error.message)
        } finally {
            setGenerating(false)
        }
    }

    return (
        <>
            <Helmet><title>Asset Generator - VJ Studio Pro</title></Helmet>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2">Asset Generator</h1>
                        <p className="text-gray-400">Create VJ assets with Galaxy AI</p>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        <span className="text-sm font-medium text-purple-400">{credits} Credits</span>
                    </div>
                </div>

                <Tabs value={assetType} onValueChange={setAssetType}>
                    <TabsList className="grid w-full grid-cols-5 bg-slate-900/50">
                        {assetTypes.map(t => (
                            <TabsTrigger key={t.id} value={t.id} className="flex items-center gap-2">
                                <t.icon className="w-4 h-4" />{t.name}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {assetTypes.map(type => (
                        <TabsContent key={type.id} value={type.id} className="space-y-6">
                            <div className="grid lg:grid-cols-3 gap-6">
                                <Card className="bg-slate-900/50 border-purple-500/20">
                                    <CardHeader><CardTitle className="text-white">Settings</CardTitle></CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-2">
                                            <Label className="text-white">Prompt</Label>
                                            <Textarea placeholder={`Describe ${type.name}...`} value={prompt} onChange={e => setPrompt(e.target.value)} className="bg-slate-800 border-purple-500/20 text-white" />
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <Label className="text-white">Model</Label>
                                            <Select value={selectedModel} onValueChange={setSelectedModel}>
                                                <SelectTrigger className="bg-slate-800 border-purple-500/20 text-white">
                                                    <SelectValue placeholder="Select model" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {models.map(m => (
                                                        <SelectItem key={m.id} value={m.modelId}>
                                                            {m.name} - {m.price}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-white">Style</Label>
                                            <Select value={style} onValueChange={setStyle}>
                                                <SelectTrigger className="bg-slate-800 border-purple-500/20 text-white"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="psychedelic">Psychedelic</SelectItem>
                                                    <SelectItem value="geometric">Geometric</SelectItem>
                                                    <SelectItem value="glitch">Glitch</SelectItem>
                                                    <SelectItem value="abstract">Abstract</SelectItem>
                                                    <SelectItem value="neon">Neon</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        {type.id === 'loops' && (
                                            <div className="space-y-2">
                                                <Label className="text-white">Duration: {duration[0]}s</Label>
                                                <Slider value={duration} onValueChange={setDuration} min={5} max={60} step={5} />
                                            </div>
                                        )}
                                        <Button 
                                            onClick={handleGenerate} 
                                            disabled={generating || !user} 
                                            className="w-full bg-gradient-to-r from-purple-500 to-pink-500"
                                        >
                                            {generating ? (
                                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</>
                                            ) : (
                                                <><Wand2 className="w-4 h-4 mr-2" />Generate</>
                                            )}
                                        </Button>
                                        {!user && <p className="text-xs text-yellow-400 text-center">Sign in to generate</p>}
                                        <div className="pt-4 border-t border-purple-500/20">
                                            <Label className="text-white mb-3 block">Formats</Label>
                                            <div className="flex flex-wrap gap-2">
                                                {type.formats.map(f => (
                                                    <span key={f} className="px-2 py-1 bg-purple-500/10 border border-purple-500/20 rounded text-xs text-purple-400">{f}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <div className="lg:col-span-2">
                                    <Card className="bg-slate-900/50 border-purple-500/20 h-full">
                                        <CardHeader><CardTitle className="text-white">Preview</CardTitle></CardHeader>
                                        <CardContent>
                                            <div className="aspect-video bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-lg border border-purple-500/20 flex items-center justify-center">
                                                {resultUrl ? (
                                                    type.type === 'video' ? (
                                                        <video src={resultUrl} controls className="w-full h-full object-contain rounded" />
                                                    ) : (
                                                        <img src={resultUrl} alt="Generated" className="w-full h-full object-contain rounded" />
                                                    )
                                                ) : (
                                                    <div className="text-center">
                                                        <type.icon className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                                                        <p className="text-white font-medium">Ready to Generate</p>
                                                    </div>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        </TabsContent>
                    ))}
                </Tabs>
            </div>
        </>
    )
}
