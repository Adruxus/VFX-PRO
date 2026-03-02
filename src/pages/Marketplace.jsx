import { Helmet } from 'react-helmet-async'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useState } from 'react'
import { Search, Download, Star, ShoppingCart, Upload, Eye, Heart, Zap } from 'lucide-react'
import { toast } from 'sonner'

const ASSETS = [
    { id:1, title:'Neon Geometry Pack', creator:'VisualLab', price:24, rating:4.9, downloads:1240, category:'loops', formats:['MP4','DXV'], featured:true },
    { id:2, title:'Psychedelic Shader Set', creator:'ShaderForge', price:18, rating:4.7, downloads:890, category:'shaders', formats:['GLSL','ISF'], featured:false },
    { id:3, title:'Festival LUT Collection', creator:'ColorGrade Pro', price:12, rating:4.8, downloads:2100, category:'luts', formats:['CUBE','3DL'], featured:true },
    { id:4, title:'Laser Overlay Pack', creator:'LaserArt', price:29, rating:4.6, downloads:560, category:'overlays', formats:['PNG','WEBM'], featured:false },
    { id:5, title:'Generative Particles', creator:'GenArt Studio', price:35, rating:5.0, downloads:340, category:'generative', formats:['TOE','TOX'], featured:true },
    { id:6, title:'Glitch Transition Pack', creator:'GlitchMaster', price:15, rating:4.5, downloads:780, category:'transitions', formats:['MP4','MOV'], featured:false },
    { id:7, title:'Cyberpunk Loop Bundle', creator:'NeonDreams', price:42, rating:4.9, downloads:1560, category:'loops', formats:['MP4','DXV'], featured:true },
    { id:8, title:'Abstract Fractal Shaders', creator:'FractalLab', price:22, rating:4.7, downloads:430, category:'shaders', formats:['GLSL','FRAG'], featured:false },
]

const CATEGORIES = ['all','loops','shaders','luts','overlays','generative','transitions']
const GRADIENTS = ['from-purple-900 to-blue-900','from-pink-900 to-purple-900','from-orange-900 to-red-900','from-cyan-900 to-teal-900','from-violet-900 to-purple-900','from-green-900 to-emerald-900','from-yellow-900 to-orange-900','from-indigo-900 to-blue-900']

export default function Marketplace() {
    const [search, setSearch] = useState('')
    const [category, setCategory] = useState('all')
    const [sort, setSort] = useState('popular')
    const [cart, setCart] = useState([])

    const filtered = ASSETS
        .filter(a => category === 'all' || a.category === category)
        .filter(a => a.title.toLowerCase().includes(search.toLowerCase()))
        .sort((a,b) => sort === 'popular' ? b.downloads - a.downloads : sort === 'price-low' ? a.price - b.price : b.price - a.price)

    const addToCart = (asset) => {
        setCart(prev => [...prev, asset.id])
        toast.success(`${asset.title} added to cart`)
    }

    return (
        <>
            <Helmet><title>Marketplace - VJ Studio Pro</title></Helmet>
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-1">Asset Marketplace</h1>
                        <p className="text-gray-400">Professional VJ assets from top creators</p>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline"><Upload className="w-4 h-4 mr-2" />Sell Assets</Button>
                        <Button variant="gradient" className="relative">
                            <ShoppingCart className="w-4 h-4 mr-2" />Cart
                            {cart.length > 0 && <span className="absolute -top-2 -right-2 w-5 h-5 bg-pink-500 rounded-full text-xs flex items-center justify-center">{cart.length}</span>}
                        </Button>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-3">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input placeholder="Search assets..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
                    </div>
                    <Select value={sort} onValueChange={setSort}>
                        <SelectTrigger className="w-48"><SelectValue placeholder="Sort by" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="popular">Most Popular</SelectItem>
                            <SelectItem value="price-low">Price: Low to High</SelectItem>
                            <SelectItem value="price-high">Price: High to Low</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <Tabs value={category} onValueChange={setCategory}>
                    <TabsList className="flex flex-wrap h-auto gap-1 bg-slate-900/80 p-1">
                        {CATEGORIES.map(cat => <TabsTrigger key={cat} value={cat} className="capitalize">{cat}</TabsTrigger>)}
                    </TabsList>
                    <TabsContent value={category} className="mt-6">
                        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {filtered.map((asset, i) => (
                                <Card key={asset.id} className="overflow-hidden group hover:border-purple-500/50 transition-all">
                                    <div className={`aspect-video bg-gradient-to-br ${GRADIENTS[i % GRADIENTS.length]} relative`}>
                                        {asset.featured && <div className="absolute top-2 left-2"><Badge>Featured</Badge></div>}
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                            <button className="p-2 bg-white/20 backdrop-blur rounded-full"><Eye className="w-5 h-5 text-white" /></button>
                                            <button className="p-2 bg-white/20 backdrop-blur rounded-full"><Heart className="w-5 h-5 text-white" /></button>
                                        </div>
                                    </div>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-white text-base">{asset.title}</CardTitle>
                                        <CardDescription className="text-purple-400 text-sm">by {asset.creator}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="pb-3">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-1">
                                                <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                                                <span className="text-sm text-white font-medium">{asset.rating}</span>
                                            </div>
                                            <span className="text-xs text-gray-400">{asset.downloads.toLocaleString()} downloads</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1 mb-3">
                                            {asset.formats.map(f => <Badge key={f} variant="outline" className="text-xs">{f}</Badge>)}
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xl font-bold text-white">${asset.price}</span>
                                            <Button size="sm" variant="gradient" onClick={() => addToCart(asset)}>
                                                <ShoppingCart className="w-3.5 h-3.5 mr-1" />Buy
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                        {filtered.length === 0 && (
                            <div className="text-center py-16">
                                <Search className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                                <p className="text-gray-400">No assets found.</p>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </>
    )
}