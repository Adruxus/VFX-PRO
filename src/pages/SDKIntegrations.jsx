import { Helmet } from 'react-helmet-async'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowSquareOut, Cube, Cpu, CheckCircle } from '@/components/icons/futureIcons'
import sdkData from '@/config/sdks-data.json'

const THREE_D_ENGINES = [
    {
        id: 'unreal-engine-5',
        name: 'Unreal Engine 5',
        description: 'Native UE5 export profile for high-end cinematic and real-time stage visuals.',
        formats: ['uasset', 'fbx', 'glb', 'mp4', 'mov'],
        features: [
            'Niagara-ready particle payloads',
            'Sequencer-safe loop timing',
            'Blueprint metadata for automation',
            'Optimized texture packaging',
        ],
        docs: 'https://dev.epicgames.com/documentation/en-us/unreal-engine',
    },
    {
        id: 'unity-3d',
        name: 'Unity 3D',
        description: 'Unity asset pipeline with Shader Graph and VFX Graph focused exports.',
        formats: ['prefab', 'mat', 'shadergraph', 'mp4', 'png'],
        features: [
            'URP and HDRP compatible output',
            'Timeline cue compatibility',
            'VFX Graph particle templates',
            'Addressables-friendly bundles',
        ],
        docs: 'https://docs.unity3d.com',
    },
]

export default function SDKIntegrations() {
    const integrations = Array.isArray(sdkData?.sdks) ? sdkData.sdks : []
    const assetTypes = Array.isArray(sdkData?.assetTypes) ? sdkData.assetTypes : []

    return (
        <>
            <Helmet><title>SDK and Integrations - VJ Studio Pro</title></Helmet>
            <div className='space-y-10'>
                <div className='text-center space-y-3'>
                    <Badge variant='outline'>Integrations Hub</Badge>
                    <h1 className='text-4xl font-bold text-white'>SDK and Integrations</h1>
                    <p className='text-xl text-gray-400 max-w-2xl mx-auto'>
                        Unreal 3D Engine, Unity, and VJ software integrations from one export pipeline.
                    </p>
                </div>

                <section className='space-y-4'>
                    <h2 className='text-2xl font-bold text-white'>3D Engines</h2>
                    <div className='grid gap-6 lg:grid-cols-2'>
                        {THREE_D_ENGINES.map((engine) => (
                            <Card key={engine.id} className='border-purple-500/30 bg-gradient-to-br from-slate-900 to-slate-900/40'>
                                <CardHeader>
                                    <CardTitle className='text-white flex items-center gap-2'>
                                        <Cube className='w-5 h-5 text-purple-400' />
                                        {engine.name}
                                    </CardTitle>
                                    <CardDescription className='text-gray-300'>{engine.description}</CardDescription>
                                </CardHeader>
                                <CardContent className='space-y-4'>
                                    <div className='flex flex-wrap gap-2'>
                                        {engine.formats.map((format) => (
                                            <Badge key={format} variant='outline' className='uppercase'>{format}</Badge>
                                        ))}
                                    </div>
                                    <ul className='space-y-2 text-sm text-gray-300'>
                                        {engine.features.map((feature) => (
                                            <li key={feature} className='flex items-start gap-2'>
                                                <CheckCircle className='w-4 h-4 text-purple-400 mt-0.5' />
                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <Button variant='outline' size='sm' asChild>
                                        <a href={engine.docs} target='_blank' rel='noopener noreferrer'>
                                            <ArrowSquareOut className='w-3.5 h-3.5 mr-1.5' />
                                            Open docs
                                        </a>
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </section>

                <section className='space-y-4'>
                    <h2 className='text-2xl font-bold text-white'>VJ Software and Tools</h2>
                    <div className='grid gap-6 md:grid-cols-2'>
                        {integrations.map((sdk) => (
                            <Card key={sdk.id} className='hover:border-purple-500/40 transition-all'>
                                <CardHeader>
                                    <CardTitle className='text-white text-lg flex items-center gap-2'>
                                        <span>{sdk.logo || '•'}</span>
                                        {sdk.name}
                                    </CardTitle>
                                    <CardDescription className='text-gray-400 text-sm'>{sdk.description}</CardDescription>
                                </CardHeader>
                                <CardContent className='space-y-4'>
                                    <Tabs defaultValue='formats'>
                                        <TabsList className='w-full grid grid-cols-2'>
                                            <TabsTrigger value='formats'>Formats</TabsTrigger>
                                            <TabsTrigger value='features'>Features</TabsTrigger>
                                        </TabsList>
                                        <TabsContent value='formats' className='mt-3'>
                                            <div className='flex flex-wrap gap-2'>
                                                {(sdk.formats || []).map((format) => (
                                                    <Badge key={format} variant='outline' className='uppercase'>{format}</Badge>
                                                ))}
                                            </div>
                                        </TabsContent>
                                        <TabsContent value='features' className='mt-3'>
                                            <ul className='space-y-1.5'>
                                                {(sdk.features || ['Format support']).map((feature) => (
                                                    <li key={feature} className='flex items-center gap-2 text-sm text-gray-300'>
                                                        <CheckCircle className='w-3.5 h-3.5 text-purple-400' />
                                                        {feature}
                                                    </li>
                                                ))}
                                            </ul>
                                        </TabsContent>
                                    </Tabs>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </section>

                <section className='space-y-4'>
                    <h2 className='text-2xl font-bold text-white'>Supported Asset Types</h2>
                    <Card className='bg-slate-900/40 border-purple-500/20'>
                        <CardContent className='pt-6'>
                            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                                {assetTypes.map((assetType) => (
                                    <div key={assetType.id} className='rounded-lg border border-purple-500/20 bg-slate-950/60 p-3'>
                                        <div className='flex items-center gap-2 mb-2'>
                                            <Cpu className='w-4 h-4 text-purple-400' />
                                            <p className='text-sm font-semibold text-white'>{assetType.name}</p>
                                        </div>
                                        <div className='flex flex-wrap gap-1.5'>
                                            {(assetType.formats || []).map((format) => (
                                                <Badge key={format} variant='outline' className='text-[10px] uppercase'>{format}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </>
    )
}

