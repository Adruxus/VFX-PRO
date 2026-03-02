import { Helmet } from 'react-helmet-async'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from 'react-router-dom'
import { Zap, Sparkles, Download, Layers, Wand2, Palette, Video, Music } from 'lucide-react'

export default function Home() {
    const features = [
        { icon: Wand2, title: 'AI-Powered Generation', description: 'Create stunning visual assets with Galaxy AI' },
        { icon: Layers, title: 'Multi-Format Export', description: 'Export to all major VJ software' },
        { icon: Video, title: 'Real-Time Preview', description: 'See your creations instantly' },
        { icon: Palette, title: 'Custom Styles', description: 'Hundreds of visual styles' },
        { icon: Music, title: 'Audio Reactive', description: 'Sync visuals with music' },
        { icon: Download, title: 'Instant Download', description: 'High-quality assets instantly' }
    ]

    return (
        <>
            <Helmet><title>VJ Studio Pro - Professional Visual Asset Creation</title></Helmet>
            <div className="space-y-20">
                <section className="text-center space-y-8 py-12">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-full mb-6">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        <span className="text-sm text-purple-400 font-medium">AI-Powered Visual Creation</span>
                    </div>
                    <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
                        <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">Create Epic Visuals</span>
                        <br /><span className="text-white">For Any Stage</span>
                    </h1>
                    <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-8">
                        Professional VJ visual asset creation platform powered by Galaxy AI. Generate stunning content for Resolume, TouchDesigner, MadMapper, and more.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link to="/generator"><Button size="lg" className="bg-gradient-to-r from-purple-500 to-pink-500"><Sparkles className="w-5 h-5 mr-2" />Start Creating</Button></Link>
                        <Link to="/marketplace"><Button size="lg" variant="outline" className="border-purple-500/20">Browse Marketplace</Button></Link>
                    </div>
                </section>
                <section className="space-y-8">
                    <div className="text-center space-y-4">
                        <h2 className="text-3xl md:text-4xl font-bold text-white">Everything You Need</h2>
                        <p className="text-gray-400 max-w-2xl mx-auto">Powerful tools for VJ professionals</p>
                    </div>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {features.map(f => (
                            <Card key={f.title} className="bg-slate-900/50 border-purple-500/20">
                                <CardHeader>
                                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg flex items-center justify-center mb-4">
                                        <f.icon className="w-6 h-6 text-purple-400" />
                                    </div>
                                    <CardTitle className="text-white">{f.title}</CardTitle>
                                    <CardDescription className="text-gray-400">{f.description}</CardDescription>
                                </CardHeader>
                            </Card>
                        ))}
                    </div>
                </section>
            </div>
        </>
    )
}