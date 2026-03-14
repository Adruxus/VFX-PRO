import { useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PLAN_LABELS, useAccessControl } from '@/services/accessControl'
import {
    deleteCommunityTutorial,
    getCommunityTutorials,
    resolveTutorialPlaybackSource,
    saveCommunityTutorial,
    tutorialFileToDataUrl,
} from '@/services/tutorials'
import { FilmSlate, UploadSimple, Play, WarningCircle } from '@/components/icons/futureIcons'

const OFFICIAL_TUTORIALS = [
    {
        id: 'account-login',
        category: 'Account',
        level: 'Beginner',
        duration: '3 min',
        title: 'Sign In, Verify Access, and Pick a Plan',
        targetRoute: '/account',
        summary: 'Get team members signed in quickly and ensure plan/compliance access before generation.',
        steps: [
            'Click Sign In in the top navigation bar.',
            'Complete Clerk login, then open Account.',
            'Verify your plan tier and enable required compliance options for paid models.',
            'Confirm credits and provider readiness before opening Generator.',
        ],
    },
    {
        id: 'generator-2d',
        category: 'Generator',
        level: 'Beginner',
        duration: '6 min',
        title: '2D Image Generation Workflow',
        targetRoute: '/generator',
        summary: 'Create static overlays, textures, and mood boards with predictable credit usage.',
        steps: [
            'Select "2D Image Generation" tab.',
            'Choose model based on credit/quality balance.',
            'Set prompt, style, and resolution.',
            'Generate preview and review quality.',
            'Export PNG/JPG/WEBP to your project.',
        ],
    },
    {
        id: 'generator-video',
        category: 'Generator',
        level: 'Intermediate',
        duration: '8 min',
        title: '3D Text-to-Video Loop Workflow',
        targetRoute: '/generator',
        summary: 'Generate stage-ready loops with references, failover awareness, and export choices.',
        steps: [
            'Select "3D Text-to-Video Loops".',
            'Choose model and confirm required image/video references.',
            'Set duration, FPS, resolution, and loop settings.',
            'Generate and monitor provider job status.',
            'Export MP4/MOV/GIF after validating smooth looping.',
        ],
    },
    {
        id: 'generator-3d',
        category: 'Generator',
        level: 'Intermediate',
        duration: '9 min',
        title: '3D Asset Generation Workflow',
        targetRoute: '/generator',
        summary: 'Generate mesh assets from image references with production-friendly mesh settings.',
        steps: [
            'Switch to "3D Asset Generator".',
            'Upload a clear source image.',
            'Pick in-app 3D model (TRELLIS.2 or Hunyuan3D-2.1).',
            'Tune triangles/texture budget and generate.',
            'Export GLB/OBJ/FBX and validate in engine preview.',
        ],
    },
    {
        id: 'dashboard-library',
        category: 'Dashboard',
        level: 'Beginner',
        duration: '7 min',
        title: 'Dashboard Library, Preview, and Editing',
        targetRoute: '/dashboard',
        summary: 'Manage generated assets, filter by type, and perform quick image adjustments.',
        steps: [
            'Open Dashboard and refresh credit/library data.',
            'Use search and type filters to isolate outputs.',
            'Preview selected media in the inspector.',
            'Apply editor controls, then save edited versions to library.',
        ],
    },
    {
        id: 'setlist',
        category: 'Setlist',
        level: 'Intermediate',
        duration: '6 min',
        title: 'Setlist and Performance Preparation',
        targetRoute: '/setlist',
        summary: 'Build show-ready sequence structures that map visuals to performance segments.',
        steps: [
            'Create setlist from desired mood and performance structure.',
            'Review generated segments and timing.',
            'Adjust transitions and cue labels.',
            'Export or handoff setlist for rehearsal use.',
        ],
    },
    {
        id: 'engines',
        category: 'Engine',
        level: 'Advanced',
        duration: '10 min',
        title: 'Engine Preview and Asset Validation',
        targetRoute: '/engines',
        summary: 'Validate imported assets in browser engine viewport before deployment.',
        steps: [
            'Open 3D Engine page and load licensed asset manifest.',
            'Inspect geometry/material fidelity in viewport.',
            'Check format compatibility and fallback handling.',
            'Finalize assets for Unity/Unreal export pipelines.',
        ],
    },
    {
        id: 'billing-credits',
        category: 'Billing',
        level: 'Beginner',
        duration: '5 min',
        title: 'Credits, Billing, and Cost Control',
        targetRoute: '/billing',
        summary: 'Track usage, avoid failed generations, and keep provider reserve + margin healthy.',
        steps: [
            'Open Billing and review current plan allocation.',
            'Compare model credit costs before generation.',
            'Buy credits or upgrade plan when needed.',
            'Reconcile ledger with expected generation volume.',
        ],
    },
    {
        id: 'marketplace',
        category: 'Marketplace',
        level: 'Beginner',
        duration: '5 min',
        title: 'Marketplace Acquisition and Usage',
        targetRoute: '/marketplace',
        summary: 'Find compatible assets and bring them into your production flow quickly.',
        steps: [
            'Browse assets by style and engine compatibility.',
            'Review license/commercial terms before purchase.',
            'Acquire assets and store with your project metadata.',
            'Load in engine preview to verify fidelity.',
        ],
    },
    {
        id: 'integrations',
        category: 'Integrations',
        level: 'Advanced',
        duration: '8 min',
        title: 'SDK and Integration Setup',
        targetRoute: '/integrations',
        summary: 'Connect external workflows and automate generation or export triggers.',
        steps: [
            'Open Integrations and review SDK targets.',
            'Configure provider keys and environment settings.',
            'Validate request flow with test payloads.',
            'Deploy integration with monitoring and fallback policies.',
        ],
    },
]

const COMMUNITY_CATEGORY_OPTIONS = ['Generator', 'Dashboard', 'Engine', 'Setlist', 'Billing', 'Marketplace', 'Integrations', 'General']
const DIFFICULTY_OPTIONS = ['Beginner', 'Intermediate', 'Advanced']

function formatDate(value) {
    const parsed = new Date(value || '')
    if (Number.isNaN(parsed.getTime())) return 'Unknown'
    return parsed.toLocaleString()
}

function parseTags(input) {
    return String(input || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 8)
}

export default function Tutorials() {
    const { user } = useUser()
    const { isAdmin, effectivePlan } = useAccessControl()
    const [tab, setTab] = useState('official')
    const [search, setSearch] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('all')

    const [communityTutorials, setCommunityTutorials] = useState([])
    const [communityLoading, setCommunityLoading] = useState(true)
    const [publishing, setPublishing] = useState(false)

    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [category, setCategory] = useState('Generator')
    const [difficulty, setDifficulty] = useState('Intermediate')
    const [duration, setDuration] = useState('5 min')
    const [sourceMode, setSourceMode] = useState('url')
    const [videoUrl, setVideoUrl] = useState('')
    const [videoFile, setVideoFile] = useState(null)
    const [tags, setTags] = useState('')

    const loadCommunityTutorials = async () => {
        setCommunityLoading(true)
        const entries = await getCommunityTutorials()
        setCommunityTutorials(Array.isArray(entries) ? entries : [])
        setCommunityLoading(false)
    }

    useEffect(() => {
        void loadCommunityTutorials().catch(() => {
            setCommunityLoading(false)
            toast.error('Failed to load community tutorials.')
        })
    }, [])

    const officialCategories = useMemo(() => {
        const categories = OFFICIAL_TUTORIALS.map((item) => item.category)
        return Array.from(new Set(categories))
    }, [])

    const filteredOfficialTutorials = useMemo(() => {
        const query = search.trim().toLowerCase()
        return OFFICIAL_TUTORIALS.filter((item) => {
            if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
            if (!query) return true
            const text = `${item.title} ${item.summary} ${item.category}`.toLowerCase()
            return text.includes(query)
        })
    }, [categoryFilter, search])

    const filteredCommunityTutorials = useMemo(() => {
        const query = search.trim().toLowerCase()
        return communityTutorials.filter((item) => {
            if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
            if (!query) return true
            const text = `${item.title || ''} ${item.description || ''} ${item.owner_name || ''}`.toLowerCase()
            return text.includes(query)
        })
    }, [categoryFilter, communityTutorials, search])

    const handlePublishTutorial = async () => {
        const normalizedTitle = String(title || '').trim()
        if (!normalizedTitle) {
            toast.error('Tutorial title is required.')
            return
        }
        setPublishing(true)
        try {
            let sourceUrl = String(videoUrl || '').trim()
            if (sourceMode === 'upload') {
                const result = await tutorialFileToDataUrl(videoFile)
                if (!result.ok) {
                    toast.error(result.error || 'Unable to read uploaded video.')
                    setPublishing(false)
                    return
                }
                sourceUrl = result.dataUrl
            }
            const result = await saveCommunityTutorial({
                title: normalizedTitle,
                description,
                category,
                difficulty,
                duration,
                video_url: sourceUrl,
                owner_user_id: user?.id || 'guest',
                owner_name: user?.fullName || user?.username || 'Community Member',
                tags: parseTags(tags),
            })
            if (!result.ok) {
                toast.error(result.error || 'Failed to publish tutorial.')
                setPublishing(false)
                return
            }
            setCommunityTutorials(Array.isArray(result.tutorials) ? result.tutorials : [])
            setTitle('')
            setDescription('')
            setVideoUrl('')
            setVideoFile(null)
            setTags('')
            toast.success('Tutorial published to community feed.')
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to publish tutorial.')
        } finally {
            setPublishing(false)
        }
    }

    const handleDeleteTutorial = async (tutorialId) => {
        const result = await deleteCommunityTutorial({
            tutorialId,
            requesterUserId: user?.id || 'guest',
            isAdmin,
        })
        if (!result.ok) {
            toast.error(result.error || 'Could not delete tutorial.')
            return
        }
        setCommunityTutorials(Array.isArray(result.tutorials) ? result.tutorials : [])
        toast.success('Tutorial removed.')
    }

    return (
        <>
            <Helmet>
                <title>Tutorials - VFX Studios</title>
            </Helmet>

            <div className='space-y-6'>
                <div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
                    <div>
                        <h1 className='text-3xl font-bold text-cyan-100'>Tutorial Center</h1>
                        <p className='mt-1 text-sm text-slate-300'>
                            Official step-by-step guides for every core area plus community-contributed tutorial videos.
                        </p>
                    </div>
                    <div className='flex flex-wrap gap-2'>
                        <Badge variant='outline' className='border-cyan-400/35 text-cyan-100'>
                            Plan: {PLAN_LABELS[effectivePlan]}
                        </Badge>
                        <Badge variant='outline' className='border-fuchsia-400/35 text-fuchsia-100'>
                            <FilmSlate size={13} className='mr-1.5' />
                            Learn + Teach
                        </Badge>
                    </div>
                </div>

                <Card className='bg-slate-900/60 border-cyan-400/20'>
                    <CardContent className='pt-6'>
                        <div className='grid gap-3 md:grid-cols-2'>
                            <div className='space-y-2'>
                                <Label>Search Tutorials</Label>
                                <Input
                                    placeholder='Search by title, summary, or creator'
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                />
                            </div>
                            <div className='space-y-2'>
                                <Label>Category</Label>
                                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value='all'>All Categories</SelectItem>
                                        {Array.from(new Set([...officialCategories, ...COMMUNITY_CATEGORY_OPTIONS])).map((item) => (
                                            <SelectItem key={item} value={item}>{item}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Tabs value={tab} onValueChange={setTab}>
                    <TabsList className='grid w-full grid-cols-2 bg-slate-900/60'>
                        <TabsTrigger value='official'>Official Guides</TabsTrigger>
                        <TabsTrigger value='community'>Community Tutorials</TabsTrigger>
                    </TabsList>

                    <TabsContent value='official' className='space-y-4'>
                        {filteredOfficialTutorials.length === 0 && (
                            <Card className='bg-slate-900/60 border-cyan-400/20'>
                                <CardContent className='pt-6 text-sm text-slate-300'>
                                    No tutorials match your current filter.
                                </CardContent>
                            </Card>
                        )}
                        {filteredOfficialTutorials.map((tutorial) => (
                            <Card key={tutorial.id} className='bg-slate-900/60 border-cyan-400/20'>
                                <CardHeader>
                                    <div className='flex flex-wrap items-center gap-2'>
                                        <Badge variant='outline'>{tutorial.category}</Badge>
                                        <Badge variant='outline'>{tutorial.level}</Badge>
                                        <Badge variant='outline'>{tutorial.duration}</Badge>
                                    </div>
                                    <CardTitle className='text-white'>{tutorial.title}</CardTitle>
                                    <CardDescription className='text-slate-300'>{tutorial.summary}</CardDescription>
                                </CardHeader>
                                <CardContent className='space-y-3'>
                                    <ol className='space-y-2'>
                                        {tutorial.steps.map((step, index) => (
                                            <li key={`${tutorial.id}-${index + 1}`} className='flex items-start gap-2 text-sm text-slate-200'>
                                                <span className='mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-semibold text-cyan-100'>
                                                    {index + 1}
                                                </span>
                                                <span>{step}</span>
                                            </li>
                                        ))}
                                    </ol>
                                    <div className='pt-1'>
                                        <Link
                                            to={tutorial.targetRoute}
                                            className='inline-flex h-9 items-center justify-center rounded-md border border-cyan-400/35 px-3 text-sm text-cyan-100 hover:bg-cyan-500/10'
                                        >
                                            Open {tutorial.category}
                                        </Link>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </TabsContent>

                    <TabsContent value='community' className='space-y-4'>
                        <Card className='bg-slate-900/60 border-cyan-400/20'>
                            <CardHeader>
                                <CardTitle className='text-white'>Publish a Community Tutorial</CardTitle>
                                <CardDescription className='text-slate-300'>
                                    Upload a short video file or add an external video URL so other users can learn your workflow.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className='space-y-3'>
                                <div className='grid gap-3 md:grid-cols-2'>
                                    <div className='space-y-2'>
                                        <Label>Tutorial Title</Label>
                                        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder='Example: Fast loop setup for festival visuals' />
                                    </div>
                                    <div className='space-y-2'>
                                        <Label>Duration Label</Label>
                                        <Input value={duration} onChange={(event) => setDuration(event.target.value)} placeholder='Example: 6 min' />
                                    </div>
                                </div>
                                <div className='grid gap-3 md:grid-cols-2'>
                                    <div className='space-y-2'>
                                        <Label>Category</Label>
                                        <Select value={category} onValueChange={setCategory}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {COMMUNITY_CATEGORY_OPTIONS.map((item) => (
                                                    <SelectItem key={item} value={item}>{item}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className='space-y-2'>
                                        <Label>Difficulty</Label>
                                        <Select value={difficulty} onValueChange={setDifficulty}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {DIFFICULTY_OPTIONS.map((item) => (
                                                    <SelectItem key={item} value={item}>{item}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className='space-y-2'>
                                    <Label>Description</Label>
                                    <Textarea
                                        value={description}
                                        onChange={(event) => setDescription(event.target.value)}
                                        placeholder='What this tutorial teaches, expected result, and any prerequisites...'
                                    />
                                </div>
                                <div className='grid gap-3 md:grid-cols-2'>
                                    <div className='space-y-2'>
                                        <Label>Video Source</Label>
                                        <Select value={sourceMode} onValueChange={setSourceMode}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value='url'>External Video URL</SelectItem>
                                                <SelectItem value='upload'>Upload Video File</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className='space-y-2'>
                                        <Label>Tags (comma-separated)</Label>
                                        <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder='wan2.1, loops, quickstart' />
                                    </div>
                                </div>
                                {sourceMode === 'url' ? (
                                    <div className='space-y-2'>
                                        <Label>Video URL</Label>
                                        <Input
                                            value={videoUrl}
                                            onChange={(event) => setVideoUrl(event.target.value)}
                                            placeholder='https://youtube.com/... or direct https://...mp4'
                                        />
                                    </div>
                                ) : (
                                    <div className='space-y-2'>
                                        <Label>Video File</Label>
                                        <Input
                                            type='file'
                                            accept='video/*'
                                            onChange={(event) => setVideoFile(event.target.files?.[0] || null)}
                                        />
                                        <p className='text-[11px] text-slate-400'>
                                            Uploaded files are stored in browser prototype storage. Keep uploads short and small.
                                        </p>
                                    </div>
                                )}
                                <Button onClick={handlePublishTutorial} disabled={publishing} className='w-full md:w-auto'>
                                    <UploadSimple size={16} className='mr-2' />
                                    {publishing ? 'Publishing...' : 'Publish Tutorial'}
                                </Button>
                            </CardContent>
                        </Card>

                        <Card className='bg-slate-900/60 border-cyan-400/20'>
                            <CardHeader>
                                <CardTitle className='text-white'>Community Tutorial Feed</CardTitle>
                                <CardDescription className='text-slate-300'>
                                    Learn from creators. Publish your own reproducible workflows.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className='space-y-4'>
                                {communityLoading && <p className='text-sm text-slate-300'>Loading community tutorials...</p>}
                                {!communityLoading && filteredCommunityTutorials.length === 0 && (
                                    <div className='rounded-md border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100 flex items-center gap-2'>
                                        <WarningCircle size={16} />
                                        <span>No community tutorials yet for this filter. Publish the first one.</span>
                                    </div>
                                )}
                                {!communityLoading && filteredCommunityTutorials.map((item) => {
                                    const source = resolveTutorialPlaybackSource(item.video_url)
                                    const canDelete = isAdmin || (user?.id && user.id === item.owner_user_id)
                                    return (
                                        <div key={item.id} className='rounded-lg border border-cyan-500/20 bg-slate-800/40 p-3 space-y-3'>
                                            <div className='flex flex-wrap items-center justify-between gap-2'>
                                                <div>
                                                    <p className='text-sm font-semibold text-cyan-100'>{item.title}</p>
                                                    <p className='text-xs text-slate-400'>
                                                        by {item.owner_name} | {item.category} | {item.difficulty} | {item.duration}
                                                    </p>
                                                </div>
                                                <div className='flex items-center gap-2'>
                                                    <Badge variant='outline'>{formatDate(item.created_at)}</Badge>
                                                    {canDelete && (
                                                        <Button type='button' size='sm' variant='outline' onClick={() => handleDeleteTutorial(item.id)}>
                                                            Delete
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                            {item.description && <p className='text-sm text-slate-200'>{item.description}</p>}

                                            {source?.type === 'video' && (
                                                <video
                                                    src={source.src}
                                                    controls
                                                    className='w-full max-h-[380px] rounded-md border border-cyan-500/20 bg-black object-contain'
                                                />
                                            )}
                                            {source?.type === 'embed' && (
                                                <div className='aspect-video rounded-md overflow-hidden border border-cyan-500/20 bg-black'>
                                                    <iframe
                                                        src={source.src}
                                                        title={item.title}
                                                        allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
                                                        allowFullScreen
                                                        className='h-full w-full'
                                                    />
                                                </div>
                                            )}
                                            {source?.type === 'link' && (
                                                <a
                                                    href={source.src}
                                                    target='_blank'
                                                    rel='noreferrer'
                                                    className='inline-flex items-center gap-2 rounded-md border border-cyan-400/35 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/10'
                                                >
                                                    <Play size={14} />
                                                    Open Tutorial Video
                                                </a>
                                            )}

                                            {Array.isArray(item.tags) && item.tags.length > 0 && (
                                                <div className='flex flex-wrap gap-2'>
                                                    {item.tags.map((tag) => (
                                                        <Badge key={`${item.id}-${tag}`} variant='outline'>#{tag}</Badge>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </>
    )
}
