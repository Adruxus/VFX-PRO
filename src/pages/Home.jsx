import { Helmet } from 'react-helmet-async'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Link } from 'react-router-dom'
import {
    Sparkle,
    Lightning,
    MusicNotes,
    VideoCamera,
    FilmSlate,
    HandCoins,
    Rows,
    MagicWand,
    Waveform,
    DesktopTower,
    RocketLaunch,
    Users,
} from '@/components/icons/futureIcons'

const audienceCards = [
    {
        icon: MusicNotes,
        title: 'DJs and Musicians',
        description:
            'Generate unique AI-driven VJ loops and music videos that react to sound and live audience energy with faster production cycles.',
    },
    {
        icon: VideoCamera,
        title: 'YouTubers and Vloggers',
        description:
            'Design high-impact intros, dynamic cutscenes, and visual stories with storyboard tools and a growing asset catalog.',
    },
    {
        icon: FilmSlate,
        title: 'Filmmakers',
        description:
            'Rapidly prototype visual concepts, organize sequence timing, and build striking VFX scenes for production workflows.',
    },
    {
        icon: HandCoins,
        title: 'Asset Creators',
        description:
            'Publish and monetize custom assets, reusable templates, and unique AI styles in a creator-first marketplace.',
    },
]

const keyFeatures = [
    {
        icon: MagicWand,
        title: 'AI-Driven VJ Asset Creation',
        description: 'Generate bespoke loops and visuals from audio, mood, and creative briefs.',
    },
    {
        icon: Waveform,
        title: 'Real-Time AI Visual Suggestions',
        description: 'Live adaptation pipeline that recommends visual changes using reaction and audio telemetry.',
    },
    {
        icon: Rows,
        title: 'Setlist and Storyboard Tools',
        description: 'Drag-and-drop planning for performances, intros, segments, and film sequence structures.',
    },
    {
        icon: DesktopTower,
        title: 'Engine-Ready Scene Pipeline',
        description: 'Build once, preview instantly, and sync assets into Unreal and Unity runtime targets.',
    },
]

export default function Home() {
    return (
        <>
            <Helmet>
                <title>VFX Studios - The AI-Powered Canvas for Dynamic Visuals</title>
            </Helmet>
            <div className='space-y-14'>
                <section className='relative overflow-hidden rounded-3xl border border-cyan-400/30 bg-[#07152f]/70 p-8 md:p-12'>
                    <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(34,211,238,0.18),transparent_45%),radial-gradient(circle_at_100%_10%,rgba(244,114,182,0.18),transparent_40%)]' />
                    <div className='relative space-y-6 max-w-4xl'>
                        <Badge variant='outline' className='border-cyan-400/40 text-cyan-200'>
                            <Sparkle size={14} className='mr-1.5' />
                            AI-Powered Canvas
                        </Badge>
                        <h1 className='text-4xl md:text-6xl font-bold tracking-tight text-white'>
                            VFX Studios: The AI-Powered Canvas for Dynamic Visuals
                        </h1>
                        <p className='text-lg md:text-xl text-cyan-50/85 leading-relaxed'>
                            Unleash your visual potential. VFX Studios is the all-in-one platform for VJs, musicians,
                            YouTubers, vloggers, filmmakers, and visual creators to create, organize, and monetize
                            stunning content with intelligent AI workflows.
                        </p>
                        <p className='text-slate-300 max-w-3xl'>
                            Dubbed the canvas of VFX, we combine generation, scene editing, live sync, and publishing
                            into one cybernetic workspace focused on accessibility, creativity, and profitability.
                        </p>
                        <div className='flex flex-col sm:flex-row gap-3'>
                            <Button asChild size='lg' variant='gradient'>
                                <Link to='/generator'>
                                    <Lightning size={18} className='mr-2' />
                                    Launch Generator
                                </Link>
                            </Button>
                            <Button asChild size='lg' variant='outline' className='border-cyan-400/40'>
                                <Link to='/engines'>Open 3D Scene Editor</Link>
                            </Button>
                        </div>
                    </div>
                </section>

                <section className='space-y-6'>
                    <div className='flex items-center gap-2'>
                        <Users size={20} className='text-cyan-300' />
                        <h2 className='text-2xl md:text-3xl font-bold text-white'>Who Is VFX Studios For?</h2>
                    </div>
                    <div className='grid gap-5 md:grid-cols-2'>
                        {audienceCards.map((item) => (
                            <Card key={item.title} className='bg-[#09152d]/70 border-cyan-400/25'>
                                <CardHeader>
                                    <CardTitle className='text-cyan-100 flex items-center gap-2'>
                                        <item.icon size={20} weight='duotone' className='text-fuchsia-300' />
                                        {item.title}
                                    </CardTitle>
                                    <CardDescription className='text-slate-300'>{item.description}</CardDescription>
                                </CardHeader>
                            </Card>
                        ))}
                    </div>
                </section>

                <section className='space-y-6'>
                    <div className='flex items-center gap-2'>
                        <RocketLaunch size={20} className='text-cyan-300' />
                        <h2 className='text-2xl md:text-3xl font-bold text-white'>Key Features</h2>
                    </div>
                    <div className='grid gap-5 md:grid-cols-2'>
                        {keyFeatures.map((feature) => (
                            <Card key={feature.title} className='bg-[#081327]/80 border-fuchsia-400/25'>
                                <CardHeader>
                                    <CardTitle className='text-white flex items-center gap-2'>
                                        <feature.icon size={20} weight='duotone' className='text-cyan-300' />
                                        {feature.title}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className='text-slate-300 text-sm'>{feature.description}</p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </section>

                <section className='grid gap-6 lg:grid-cols-2'>
                    <Card className='bg-[#0a1222]/80 border-cyan-400/25'>
                        <CardHeader>
                            <CardTitle className='text-white'>Empowering Monetization Ecosystem</CardTitle>
                            <CardDescription className='text-slate-300'>
                                VFX Studios supports 15 monetization avenues for creators and businesses.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className='space-y-3 text-sm text-slate-300'>
                            <p>Sell custom assets, templates, and AI styles directly through the platform.</p>
                            <p>
                                Activate B2B collaborations with music hardware companies, venues, and festivals
                                through partnership-ready pipeline tools.
                            </p>
                            <p>
                                Move from idea to distribution with licensing metadata, export packages, and engine sync.
                            </p>
                        </CardContent>
                    </Card>
                    <Card className='bg-[#0a1222]/80 border-fuchsia-400/25'>
                        <CardHeader>
                            <CardTitle className='text-white'>Why VFX Studios?</CardTitle>
                            <CardDescription className='text-slate-300'>
                                Built to be powerful for pros and usable for independents.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className='space-y-3 text-sm text-slate-300'>
                            <p>
                                We focus on intelligent tooling that removes repetitive complexity while preserving
                                artistic control for live shows, social content, and film production.
                            </p>
                            <p>
                                Join the visual revolution: create, perform, and earn with VFX Studios.
                            </p>
                            <Button asChild variant='gradient'>
                                <Link to='/pricing'>Choose a Plan</Link>
                            </Button>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </>
    )
}

