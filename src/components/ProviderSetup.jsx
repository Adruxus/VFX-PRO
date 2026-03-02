import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, Check, AlertCircle } from 'lucide-react'
import { getActiveProviders } from '@/services/aiProvider'
import providers from '@/config/ai-providers.json'

export default function ProviderSetup() {
    const active = getActiveProviders()
    return (
        <div className='space-y-4'>
            <h3 className='text-lg font-semibold text-white'>AI Provider Setup</h3>
            <div className='grid gap-4 md:grid-cols-2'>
                {providers.providers.map(p => {
                    const isActive = active.includes(p.id)
                    return (
                        <Card key={p.id} className={isActive ? 'border-green-500/30' : 'border-red-500/30'}>
                            <CardHeader className='pb-3'>
                                <div className='flex items-center justify-between'>
                                    <CardTitle className='text-white text-base'>{p.name}</CardTitle>
                                    {isActive
                                        ? <Badge variant='outline' className='bg-green-600/20 text-green-400 border-green-500/30'><Check className='w-3 h-3 mr-1' />Connected</Badge>
                                        : <Badge variant='outline' className='bg-red-600/20 text-red-400 border-red-500/30'><AlertCircle className='w-3 h-3 mr-1' />Not Set</Badge>
                                    }
                                </div>
                                <CardDescription className='text-gray-400 text-sm'>
                                    Key: {p.envKey}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className='space-y-2'>
                                <Button variant='outline' size='sm' className='w-full' asChild>
                                    <a href={p.signupUrl} target='_blank' rel='noopener noreferrer'>
                                        <ExternalLink className='w-3.5 h-3.5 mr-1.5' />Sign Up
                                    </a>
                                </Button>
                                <Button variant='outline' size='sm' className='w-full' asChild>
                                    <a href={p.keyUrl} target='_blank' rel='noopener noreferrer'>
                                        <ExternalLink className='w-3.5 h-3.5 mr-1.5' />Get API Key
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