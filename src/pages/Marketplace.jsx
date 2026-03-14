import { useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useUser } from '@clerk/clerk-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MagnifyingGlass, Star, ShoppingCart, UploadSimple, Eye, Heart, Sparkle } from '@/components/icons/futureIcons'
import { toast } from 'sonner'
import { importPresetToWorkspace } from '@/services/workspace'

const PURCHASED_PRESETS_KEY = 'vfx_pro_marketplace_purchased_presets'

const ASSETS = [
    { id: 1, title: 'Neon Geometry Pack', creator: 'VisualLab', price: 24, rating: 4.9, downloads: 1240, category: 'loops', formats: ['MP4', 'DXV'], featured: true },
    { id: 2, title: 'Psychedelic Shader Set', creator: 'ShaderForge', price: 18, rating: 4.7, downloads: 890, category: 'shaders', formats: ['GLSL', 'ISF'], featured: false },
    { id: 3, title: 'Festival LUT Collection', creator: 'ColorGrade Pro', price: 12, rating: 4.8, downloads: 2100, category: 'luts', formats: ['CUBE', '3DL'], featured: true },
    { id: 4, title: 'Laser Overlay Pack', creator: 'LaserArt', price: 29, rating: 4.6, downloads: 560, category: 'overlays', formats: ['PNG', 'WEBM'], featured: false },
]

const PRESETS = [
    {
        id: 'preset_cinematic_neon',
        title: 'Cinematic Neon Flythrough',
        creator: 'Studio Template Team',
        price: 19,
        rating: 4.9,
        tags: ['video', 'loop', 'cinematic'],
        description: 'Balanced prompt + settings package tuned for festival tunnel flythrough visuals.',
        generator_mode: 'video',
        prompt: 'neon tunnel fly-through, bass reactive particles, cinematic haze, smooth camera dolly, seamless loop',
        style: 'cinematic',
        resolution: '1920x1080',
        duration: 8,
        model_id: 'wan-2.1-space',
        settings: { frameRate: '24', loopType: 'seamless', audioReactive: true, diversity: 'balanced' },
    },
    {
        id: 'preset_hard_surface_asset',
        title: 'Hard-Surface Drone Asset',
        creator: 'Studio Template Team',
        price: 14,
        rating: 4.7,
        tags: ['3d', 'asset', 'hard-surface'],
        description: 'Image-to-3D preset with topology and texture budget defaults for engine export.',
        generator_mode: '3d',
        prompt: 'hard-surface drone body, emissive trim lines, game-ready topology',
        style: 'technical',
        resolution: '1024x1024',
        duration: 0,
        model_id: 'trellis-2',
        settings: { maxTriangles: 180000, maxTexture: 2048 },
    },
    {
        id: 'preset_texture_board',
        title: 'Stage Texture Board',
        creator: 'VisualLab',
        price: 9,
        rating: 4.6,
        tags: ['image', 'texture', 'board'],
        description: '2D prompt starter tuned for overlays, stage textures, and palette iteration.',
        generator_mode: 'image',
        prompt: 'high contrast abstract stage texture, cyan and magenta palette, subtle grain, tileable feel',
        style: 'editorial',
        resolution: '1024x1024',
        duration: 0,
        model_id: 'sdxl',
        settings: { diversity: 'wide' },
    },
]

const CATEGORIES = ['all', 'loops', 'shaders', 'luts', 'overlays', 'presets']
const GRADIENTS = ['from-cyan-900 to-blue-900', 'from-pink-900 to-fuchsia-900', 'from-orange-900 to-red-900', 'from-indigo-900 to-sky-900']

function storageKey(userId) {
    return `${PURCHASED_PRESETS_KEY}:${userId || 'guest'}`
}

function readPurchasedPresetIds(userId) {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.map((item) => String(item)) : []
    } catch {
        return []
    }
}

function writePurchasedPresetIds(userId, ids) {
    localStorage.setItem(storageKey(userId), JSON.stringify(Array.from(new Set(ids))))
}

export default function Marketplace() {
    const { user } = useUser()
    const [search, setSearch] = useState('')
    const [category, setCategory] = useState('all')
    const [sort, setSort] = useState('popular')
    const [cart, setCart] = useState([])
    const [purchasedPresetIds, setPurchasedPresetIds] = useState([])

    useEffect(() => {
        setPurchasedPresetIds(readPurchasedPresetIds(user?.id))
    }, [user?.id])

    const filteredAssets = useMemo(
        () =>
            ASSETS
                .filter((asset) => category === 'all' || category === 'presets' || asset.category === category)
                .filter((asset) => asset.title.toLowerCase().includes(search.toLowerCase()))
                .sort((left, right) =>
                    sort === 'popular'
                        ? right.downloads - left.downloads
                        : sort === 'price-low'
                            ? left.price - right.price
                            : right.price - left.price
                ),
        [category, search, sort]
    )

    const filteredPresets = useMemo(
        () =>
            PRESETS.filter((preset) => {
                if (category !== 'all' && category !== 'presets') {
                    return preset.tags.includes(category)
                }
                if (!search.trim()) return true
                const text = `${preset.title} ${preset.description} ${preset.tags.join(' ')}`.toLowerCase()
                return text.includes(search.toLowerCase())
            }).sort((left, right) => (sort === 'price-low' ? left.price - right.price : sort === 'price-high' ? right.price - left.price : right.rating - left.rating)),
        [category, search, sort]
    )

    const addToCart = (asset) => {
        setCart((prev) => [...prev, asset.id])
        toast.success(`${asset.title} added to cart`)
    }

    const markPresetPurchased = (presetId) => {
        const next = Array.from(new Set([...purchasedPresetIds, presetId]))
        setPurchasedPresetIds(next)
        writePurchasedPresetIds(user?.id, next)
    }

    const handlePurchasePreset = (preset) => {
        markPresetPurchased(preset.id)
        toast.success(`${preset.title} purchased`)
    }

    const handleImportPreset = (preset) => {
        if (!user?.id) {
            toast.error('Sign in to import marketplace presets.')
            return
        }
        importPresetToWorkspace(user.id, preset)
        toast.success(`${preset.title} imported into workspace`)
    }

    const handleBuyAndImport = (preset) => {
        if (!purchasedPresetIds.includes(preset.id)) {
            handlePurchasePreset(preset)
        }
        handleImportPreset(preset)
    }

    return (
        <>
            <Helmet>
                <title>Marketplace - VJ Studio Pro</title>
            </Helmet>
            <div className='space-y-6'>
                <div className='flex flex-col md:flex-row md:items-center justify-between gap-4'>
                    <div>
                        <h1 className='text-3xl font-bold text-white mb-1'>Asset Marketplace</h1>
                        <p className='text-gray-400'>Assets + one-click importable project presets</p>
                    </div>
                    <div className='flex gap-3'>
                        <Button variant='outline'>
                            <UploadSimple className='w-4 h-4 mr-2' />
                            Sell Assets
                        </Button>
                        <Button variant='gradient' className='relative'>
                            <ShoppingCart className='w-4 h-4 mr-2' />
                            Cart
                            {cart.length > 0 && (
                                <span className='absolute -top-2 -right-2 w-5 h-5 bg-pink-500 rounded-full text-xs flex items-center justify-center'>
                                    {cart.length}
                                </span>
                            )}
                        </Button>
                    </div>
                </div>

                <div className='flex flex-col md:flex-row gap-3'>
                    <div className='flex-1 relative'>
                        <MagnifyingGlass className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400' />
                        <Input placeholder='Search assets and presets...' value={search} onChange={(event) => setSearch(event.target.value)} className='pl-10' />
                    </div>
                    <Select value={sort} onValueChange={setSort}>
                        <SelectTrigger className='w-48'>
                            <SelectValue placeholder='Sort by' />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value='popular'>Most Popular</SelectItem>
                            <SelectItem value='price-low'>Price: Low to High</SelectItem>
                            <SelectItem value='price-high'>Price: High to Low</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <Tabs value={category} onValueChange={setCategory}>
                    <TabsList className='flex flex-wrap h-auto gap-1 bg-slate-900/80 p-1'>
                        {CATEGORIES.map((item) => (
                            <TabsTrigger key={item} value={item} className='capitalize'>
                                {item}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    <TabsContent value={category} className='mt-6 space-y-8'>
                        <div className='space-y-4'>
                            <div className='flex items-center gap-2'>
                                <h2 className='text-white font-semibold'>Assets</h2>
                                <Badge variant='outline'>{filteredAssets.length}</Badge>
                            </div>
                            <div className='grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
                                {filteredAssets.map((asset, index) => (
                                    <Card key={asset.id} className='overflow-hidden group hover:border-cyan-500/50 transition-all'>
                                        <div className={`aspect-video bg-gradient-to-br ${GRADIENTS[index % GRADIENTS.length]} relative`}>
                                            {asset.featured && (
                                                <div className='absolute top-2 left-2'>
                                                    <Badge>Featured</Badge>
                                                </div>
                                            )}
                                            <div className='absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3'>
                                                <button className='p-2 bg-white/20 backdrop-blur rounded-full'>
                                                    <Eye className='w-5 h-5 text-white' />
                                                </button>
                                                <button className='p-2 bg-white/20 backdrop-blur rounded-full'>
                                                    <Heart className='w-5 h-5 text-white' />
                                                </button>
                                            </div>
                                        </div>
                                        <CardHeader className='pb-2'>
                                            <CardTitle className='text-white text-base'>{asset.title}</CardTitle>
                                            <CardDescription className='text-cyan-400 text-sm'>by {asset.creator}</CardDescription>
                                        </CardHeader>
                                        <CardContent className='pb-3'>
                                            <div className='flex items-center justify-between mb-3'>
                                                <div className='flex items-center gap-1'>
                                                    <Star className='w-3.5 h-3.5 text-yellow-400 fill-yellow-400' />
                                                    <span className='text-sm text-white font-medium'>{asset.rating}</span>
                                                </div>
                                                <span className='text-xs text-gray-400'>{asset.downloads.toLocaleString()} downloads</span>
                                            </div>
                                            <div className='flex flex-wrap gap-1 mb-3'>
                                                {asset.formats.map((format) => (
                                                    <Badge key={format} variant='outline' className='text-xs'>
                                                        {format}
                                                    </Badge>
                                                ))}
                                            </div>
                                            <div className='flex items-center justify-between'>
                                                <span className='text-xl font-bold text-white'>${asset.price}</span>
                                                <Button size='sm' variant='gradient' onClick={() => addToCart(asset)}>
                                                    <ShoppingCart className='w-3.5 h-3.5 mr-1' />
                                                    Buy
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>

                        <div className='space-y-4'>
                            <div className='flex items-center gap-2'>
                                <h2 className='text-white font-semibold'>Preset Marketplace</h2>
                                <Badge variant='outline'>{filteredPresets.length}</Badge>
                                <Badge variant='outline' className='border-emerald-500/50 text-emerald-300 bg-emerald-500/10'>
                                    One-Click Import
                                </Badge>
                            </div>
                            <div className='grid gap-4 lg:grid-cols-2'>
                                {filteredPresets.map((preset) => {
                                    const purchased = purchasedPresetIds.includes(preset.id)
                                    return (
                                        <Card key={preset.id} className='bg-slate-900/60 border-cyan-500/20'>
                                            <CardHeader>
                                                <div className='flex items-start justify-between gap-3'>
                                                    <div>
                                                        <CardTitle className='text-white'>{preset.title}</CardTitle>
                                                        <CardDescription className='text-cyan-300 text-sm'>{preset.creator}</CardDescription>
                                                    </div>
                                                    <Badge variant={purchased ? 'success' : 'outline'}>{purchased ? 'Purchased' : `$${preset.price}`}</Badge>
                                                </div>
                                            </CardHeader>
                                            <CardContent className='space-y-3'>
                                                <p className='text-sm text-slate-300'>{preset.description}</p>
                                                <div className='flex flex-wrap gap-2'>
                                                    {preset.tags.map((tag) => (
                                                        <Badge key={tag} variant='outline' className='text-xs'>
                                                            {tag}
                                                        </Badge>
                                                    ))}
                                                </div>
                                                <div className='rounded-md border border-cyan-500/20 bg-[#081125] px-3 py-2 text-xs text-slate-300'>
                                                    <p>Model: {preset.model_id}</p>
                                                    <p>Mode: {preset.generator_mode}</p>
                                                    <p>Resolution: {preset.resolution}</p>
                                                </div>
                                                <div className='flex items-center gap-2'>
                                                    {!purchased && (
                                                        <Button variant='outline' onClick={() => handlePurchasePreset(preset)}>
                                                            <ShoppingCart className='w-4 h-4 mr-2' />
                                                            Purchase
                                                        </Button>
                                                    )}
                                                    <Button variant='gradient' onClick={() => handleBuyAndImport(preset)}>
                                                        <Sparkle className='w-4 h-4 mr-2' />
                                                        {purchased ? 'Import To Workspace' : 'Buy + Import'}
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )
                                })}
                            </div>
                        </div>

                        {filteredAssets.length === 0 && filteredPresets.length === 0 && (
                            <div className='text-center py-16'>
                                <MagnifyingGlass className='w-12 h-12 text-gray-600 mx-auto mb-4' />
                                <p className='text-gray-400'>No marketplace items found.</p>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </>
    )
}
