import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowSquareOut, Check, WarningCircle } from '@/components/icons/futureIcons'
import { getActiveProviders, getProviderHealthSnapshot } from '@/services/aiProvider'
import providers from '@/config/ai-providers.json'

export default function ProviderSetup() {
    const active = getActiveProviders()
    const [health, setHealth] = useState({})

    useEffect(() => {
        let mounted = true
        getProviderHealthSnapshot()
            .then((snapshot) => {
                if (!mounted) return
                setHealth({
                    replicate: snapshot?.replicate || null,
                    huggingface: snapshot?.huggingface || null,
                })
            })
            .catch(() => {
                if (!mounted) return
                setHealth({})
            })
        return () => {
            mounted = false
        }
    }, [])

    return (
        <div className='space-y-4'>
            <h3 className='text-lg font-semibold text-white'>AI Provider Setup</h3>
            <div className='grid gap-4 md:grid-cols-2'>
                {providers.providers.map(p => {
                    const isActive = active.includes(p.id)
                    const providerHealth = health[p.id]
                    return (
                        <Card key={p.id} className={isActive ? 'border-green-500/30' : 'border-red-500/30'}>
                            <CardHeader className='pb-3'>
                                <div className='flex items-center justify-between'>
                                    <CardTitle className='text-white text-base'>{p.name}</CardTitle>
                                    {isActive
                                        ? <Badge variant='outline' className='bg-green-600/20 text-green-400 border-green-500/30'><Check className='w-3 h-3 mr-1' />Connected</Badge>
                                        : <Badge variant='outline' className='bg-red-600/20 text-red-400 border-red-500/30'><WarningCircle className='w-3 h-3 mr-1' />Not Set</Badge>
                                    }
                                </div>
                                <CardDescription className='text-gray-400 text-sm'>
                                    Key: {p.envKey}
                                </CardDescription>
                                {providerHealth && (
                                    <CardDescription className={`text-xs ${providerHealth.ok ? 'text-emerald-300' : 'text-amber-300'}`}>
                                        Health: {providerHealth.ok ? 'Healthy' : providerHealth.message || 'Unavailable'}
                                    </CardDescription>
                                )}
                            </CardHeader>
                            <CardContent className='space-y-2'>
                                <Button variant='outline' size='sm' className='w-full' asChild>
                                    <a href={p.signupUrl} target='_blank' rel='noopener noreferrer'>
                                        <ArrowSquareOut className='w-3.5 h-3.5 mr-1.5' />Sign Up
                                    </a>
                                </Button>
                                <Button variant='outline' size='sm' className='w-full' asChild>
                                    <a href={p.keyUrl} target='_blank' rel='noopener noreferrer'>
                                        <ArrowSquareOut className='w-3.5 h-3.5 mr-1.5' />Get API Key
                                    </a>
                                </Button>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}

