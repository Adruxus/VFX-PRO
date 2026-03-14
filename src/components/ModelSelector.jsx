import { useMemo } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { getVideoModels, getImageModels, getThreeDModels, getActiveProviders } from '@/services/aiProvider'
import { getModelCreditCost } from '@/services/creditSystem'

const TIER_COLORS = {
    budget: 'bg-green-600/20 text-green-400 border-green-500/30',
    standard: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
    premium: 'bg-purple-600/20 text-purple-400 border-purple-500/30',
    ultra: 'bg-pink-600/20 text-pink-400 border-pink-500/30',
}

const TIER_LABELS = {
    budget: 'Budget',
    standard: 'Standard',
    premium: 'Premium',
    ultra: 'Ultra',
}

export default function ModelSelector({ type = 'video', value, onChange, className = '' }) {
    const models = useMemo(() => {
        if (type === 'video') return getVideoModels()
        if (type === '3d') return getThreeDModels()
        return getImageModels()
    }, [type])
    const active = useMemo(() => getActiveProviders(), [])
    const available = models.filter(m => active.includes(m.provider))
    const grouped = useMemo(() => {
        const g = { budget: [], standard: [], premium: [], ultra: [] }
        available.forEach(m => { if (g[m.tier]) g[m.tier].push(m) })
        return g
    }, [available])

    const selected = models.find(m => m.id === value)
    const getCreditLabel = (modelId) => {
        const creditCost = getModelCreditCost(modelId)
        if (creditCost > 0) return `${creditCost} credits`
        return 'Credits vary'
    }

    return (
        <div className={className}>
            <Label className='text-white mb-2 block'>
                {type === 'video' ? 'Video Model' : type === '3d' ? '3D Asset Model' : 'Image Model'}
            </Label>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger className='bg-slate-800 border-purple-500/20 text-white'>
                    <SelectValue placeholder='Select a model...' />
                </SelectTrigger>
                <SelectContent className='max-h-80'>
                    {Object.entries(grouped).map(([tier, tierModels]) => (
                        tierModels.length > 0 && (
                            <div key={tier}>
                                <div className='px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider'>
                                    {TIER_LABELS[tier]}
                                </div>
                                {tierModels.map(m => (
                                    <SelectItem key={m.id} value={m.id} disabled={m.supportedInApp === false}>
                                        <div className='flex items-center justify-between w-full gap-3'>
                                            <div className='flex-1'>
                                                <span className='font-medium'>{m.name}</span>
                                                <span className='text-xs text-gray-400 ml-2'>{getCreditLabel(m.id)}</span>
                                                {m.supportedInApp === false && <span className='text-[10px] text-amber-300 ml-2'>External Space</span>}
                                            </div>
                                            <Badge variant='outline' className={TIER_COLORS[m.tier] + ' text-xs'}>
                                                {m.provider === 'replicate' ? 'R' : 'HF'}
                                            </Badge>
                                        </div>
                                    </SelectItem>
                                ))}
                            </div>
                        )
                    ))}
                </SelectContent>
            </Select>

            {/* Model details */}
            {selected && (
                <div className='mt-2 p-3 bg-slate-800/50 rounded-lg border border-purple-500/10'>
                    <div className='flex items-center justify-between mb-1'>
                        <span className='text-sm font-medium text-white'>{selected.name}</span>
                        <Badge variant='outline' className={TIER_COLORS[selected.tier] + ' text-xs'}>{selected.tier}</Badge>
                    </div>
                    <div className='grid grid-cols-2 gap-1 text-xs text-gray-400'>
                        <span>Credit Cost: {getCreditLabel(selected.id)}</span>
                        <span>Quality: {selected.quality}/10</span>
                        {selected.resolution && <span>Res: {selected.resolution}</span>}
                        {selected.speed && <span>Speed: {selected.speed}</span>}
                        {selected.duration && <span>Duration: {selected.duration}</span>}
                        {selected.fps && <span>FPS: {selected.fps}</span>}
                    </div>
                    <p className='text-xs text-purple-400 mt-1'>{selected.bestFor}</p>
                    {selected.supportedInApp === false && selected.supportNote && (
                        <p className='text-[11px] text-amber-300 mt-1'>{selected.supportNote}</p>
                    )}
                </div>
            )}

            {available.length === 0 && (
                <p className='text-xs text-red-400 mt-2'>
                    No providers are currently available. Configure server-side provider tokens in Netlify environment variables.
                </p>
            )}
        </div>
    )
}
