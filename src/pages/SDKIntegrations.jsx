import { Helmet } from 'react-helmet-async'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { ExternalLink, Check, Download, Zap } from 'lucide-react'
import SDKS from '@/config/sdks-data.json'

export default function SDKIntegrations() {
    const primary = SDKS.find(s => s.primary)
    const rest = SDKS.filter(s => !s.primary)
    return (
        <>
            <Helmet><title>SDK and Integrations - VJ Studio Pro</title></Helmet>
            <div className="space-y-10">
                <div className="text-center space-y-3">
                    <Badge variant="outline">9 Integrations</Badge>
                    <h1 className="text-4xl font-bold text-white mt-2">SDK and Integrations</h1>
                    <p className="text-xl text-gray-400 max-w-2xl mx-auto">Native support for every major VJ platform</p>
                </div>

                <Card className="border-purple-500/50 bg-gradient-to-br from-purple-900/30 to-pink-900/20">
                    <CardHeader>
                        <CardTitle className="text-white text-2xl">{primary.name}</CardTitle>
                        <CardDescription className="text-gray-300">{primary.desc}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                            {primary.features.map(f => <Badge key={f} variant="outline">{f}</Badge>)}
                        </div>
                        <div className="bg-slate-950 rounded-lg p-4">
                            <code className="text-purple-400 text-sm font-mono">{primary.install}</code>
                            <Separator className="my-3" />
                            <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap">
                {Array.isArray(primary.code) ? primary.code.join(String.fromCharCode(10)) : primary.code}
              </pre>
                        </div>
                    </CardContent>
                </Card>

                <div>
                    <h2 className="text-2xl font-bold text-white mb-6">VJ Software and Tools</h2>
                    <div className="grid gap-6 md:grid-cols-2">
                        {rest.map(sdk => (
                            <Card key={sdk.id} className="hover:border-purple-500/40 transition-all">
                                <CardHeader>
                                    <CardTitle className="text-white text-lg">{sdk.name}</CardTitle>
                                    <CardDescription className="text-gray-400 text-sm">{sdk.desc}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Tabs defaultValue="formats">
                                        <TabsList className="w-full grid grid-cols-3">
                                            <TabsTrigger value="formats">Formats</TabsTrigger>
                                            <TabsTrigger value="features">Features</TabsTrigger>
                                            <TabsTrigger value="code">Code</TabsTrigger>
                                        </TabsList>
                                        <TabsContent value="formats" className="mt-3">
                                            <div className="flex flex-wrap gap-2">
                                                {sdk.formats.map(f => <Badge key={f} variant="outline">{f}</Badge>)}
                                            </div>
                                        </TabsContent>
                                        <TabsContent value="features" className="mt-3">
                                            <ul className="space-y-1.5">
                                                {sdk.features.map(f => (
                                                    <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                                                        <Check className="w-3.5 h-3.5 text-purple-400" />{f}
                                                    </li>
                                                ))}
                                            </ul>
                                        </TabsContent>
                                        <TabsContent value="code" className="mt-3">
                      <pre className="bg-slate-950 rounded-lg p-3 text-xs text-gray-300 font-mono whitespace-pre-wrap">
                        {Array.isArray(sdk.code) ? sdk.code.join(String.fromCharCode(10)) : sdk.code}
                      </pre>
                                        </TabsContent>
                                    </Tabs>
                                    <div className="flex gap-2 mt-4">
                                        <Button variant="outline" size="sm" className="flex-1" asChild>
                                            <a href={sdk.docs} target="_blank" rel="noopener noreferrer">
                                                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />Docs
                                            </a>
                                        </Button>
                                        <Button variant="gradient" size="sm" className="flex-1">
                                            <Download className="w-3.5 h-3.5 mr-1.5" />Install
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            </div>
        </>
    )
}