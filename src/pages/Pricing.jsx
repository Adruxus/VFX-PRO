import { Helmet } from 'react-helmet-async'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Check, X, Lightning, Crown, InfinitySymbol as InfinityIcon, Sparkle, CreditCard } from '@/components/icons/futureIcons'
import { useState } from 'react'
import { Link } from 'react-router-dom'

const PLANS = [
    {
        name: 'Free', monthly: 0, yearly: 0, credits: '50 credits/mo', icon: Lightning,
        color: 'from-slate-500 to-slate-600',
        desc: 'Try VJ Studio Pro risk-free',
        features: [
            { t: '50 generation credits', ok: true },
            { t: 'Free-tier models only (SDXL, SD 3.5)', ok: true },
            { t: '720p max resolution', ok: true },
            { t: 'MP4 export only', ok: true },
            { t: 'Watermarked output', ok: true },
            { t: 'Setlist Generator', ok: false },
            { t: 'API access', ok: false },
            { t: 'Commercial license', ok: false },
        ],
        cta: 'Get Started Free', popular: false,
    },
    {
        name: 'Creator', monthly: 19, yearly: 15, credits: '500 credits/mo', icon: Sparkle,
        color: 'from-purple-500 to-violet-600',
        desc: 'For independent VJs',
        features: [
            { t: '500 generation credits', ok: true },
            { t: 'Free + Budget models (FLUX, Wan, Seedance)', ok: true },
            { t: '1080p resolution', ok: true },
            { t: 'MP4 + MOV export', ok: true },
            { t: 'No watermarks', ok: true },
            { t: 'Setlist Generator (5/mo)', ok: true },
            { t: 'API access', ok: false },
            { t: 'Commercial license', ok: false },
        ],
        cta: 'Start Free Trial', popular: false,
    },
    {
        name: 'Pro', monthly: 49, yearly: 39, credits: '2,000 credits/mo', icon: Crown,
        color: 'from-purple-500 to-pink-500',
        desc: 'For professional VJs & venues',
        features: [
            { t: '2,000 generation credits', ok: true },
            { t: 'All models up to Premium (Veo 3 Fast, Kling)', ok: true },
            { t: '4K resolution', ok: true },
            { t: 'All export formats (DXV, HAP, GLSL)', ok: true },
            { t: 'No watermarks', ok: true },
            { t: 'Unlimited Setlist Generator', ok: true },
            { t: 'Full API access', ok: true },
            { t: 'Commercial license', ok: true },
        ],
        cta: 'Start Free Trial', popular: true,
    },
    {
        name: 'Studio', monthly: 149, yearly: 119, credits: '10,000 credits/mo', icon: InfinityIcon,
        color: 'from-pink-500 to-rose-500',
        desc: 'For festivals & studios',
        features: [
            { t: '10,000 generation credits', ok: true },
            { t: 'ALL models including Ultra (Veo 3)', ok: true },
            { t: '8K resolution', ok: true },
            { t: 'All formats + white-label', ok: true },
            { t: 'Dedicated account manager', ok: true },
            { t: 'Unlimited Setlist Generator', ok: true },
            { t: 'Full API + webhooks', ok: true },
            { t: 'Commercial + reseller license', ok: true },
        ],
        cta: 'Contact Sales', popular: false,
    },
]

const CREDIT_PACKS = [
    { credits: '100', price: '$3', per: '$0.030', badge: null },
    { credits: '500', price: '$12', per: '$0.024', badge: 'Popular' },
    { credits: '2,000', price: '$39', per: '$0.020', badge: 'Best Value' },
    { credits: '5,000', price: '$79', per: '$0.016', badge: 'Pro Pack' },
    { credits: '15,000', price: '$199', per: '$0.013', badge: 'Studio Pack' },
]

export default function Pricing() {
    const [yearly, setYearly] = useState(false)

    return (
        <>
            <Helmet><title>Pricing - VJ Studio Pro</title></Helmet>
            <div className="space-y-16">
                <div className="text-center space-y-4">
                    <Badge variant="outline" className="mb-4">Transparent Pricing</Badge>
                    <h1 className="text-4xl md:text-5xl font-bold text-white">Plans for Every Stage</h1>
                    <p className="text-xl text-gray-400 max-w-2xl mx-auto">From bedroom VJs to festival-scale productions. No hidden fees.</p>
                    <div className="flex items-center justify-center gap-3 pt-2">
                        <Label className="text-gray-300">Monthly</Label>
                        <Switch checked={yearly} onCheckedChange={setYearly} />
                        <Label className="text-gray-300">Yearly <Badge variant="success" className="ml-2">Save 20%</Badge></Label>
                    </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    {PLANS.map(plan => (
                        <Card key={plan.name} className={`relative flex flex-col ${plan.popular ? 'ring-2 ring-purple-500 scale-105' : ''}`}>
                            {plan.popular && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                                    <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-1">Most Popular</Badge>
                                </div>
                            )}
                            <CardHeader>
                                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center mb-3`}>
                                    <plan.icon className="w-6 h-6 text-white" />
                                </div>
                                <CardTitle className="text-white text-xl">{plan.name}</CardTitle>
                                <CardDescription className="text-gray-400">{plan.desc}</CardDescription>
                                <div className="pt-3">
                                    {plan.monthly === 0 ? (
                                        <span className="text-4xl font-bold text-white">Free</span>
                                    ) : (
                                        <>
                                            <span className="text-4xl font-bold text-white">${yearly ? plan.yearly : plan.monthly}</span>
                                            <span className="text-gray-400">/month</span>
                                            {yearly && <p className="text-xs text-green-400 mt-1">Billed ${plan.yearly * 12}/year</p>}
                                        </>
                                    )}
                                    <p className="text-purple-400 font-medium text-sm mt-1">{plan.credits}</p>
                                </div>
                            </CardHeader>
                            <CardContent className="flex-1 flex flex-col gap-4">
                                <Button variant={plan.popular ? 'gradient' : 'outline'} className="w-full" asChild>
                                    <Link to={plan.name === 'Studio' ? '/account' : '/billing'}>{plan.cta}</Link>
                                </Button>
                                <Separator />
                                <ul className="space-y-2.5">
                                    {plan.features.map((f, i) => (
                                        <li key={i} className="flex items-start gap-2.5">
                                            {f.ok
                                                ? <Check className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                                                : <X className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" />
                                            }
                                            <span className={`text-sm ${f.ok ? 'text-gray-200' : 'text-gray-500'}`}>{f.t}</span>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <div className="space-y-6">
                    <div className="text-center">
                        <h2 className="text-2xl font-bold text-white mb-2">Credit Add-ons</h2>
                        <p className="text-gray-400">Top up anytime — credits never expire</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-5 max-w-5xl mx-auto">
                        {CREDIT_PACKS.map(pack => (
                            <Card key={pack.credits} className="text-center">
                                <CardHeader className="pb-2">
                                    {pack.badge && <Badge className="mx-auto mb-2">{pack.badge}</Badge>}
                                    <CardTitle className="text-white text-lg">{pack.credits} Credits</CardTitle>
                                    <CardDescription className="text-gray-400">{pack.per}/credit</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold text-white mb-4">{pack.price}</div>
                                    <Button variant="outline" className="w-full">
                                        <CreditCard className="w-4 h-4 mr-2" />Purchase
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>

                <div className="max-w-2xl mx-auto space-y-4">
                    <h2 className="text-2xl font-bold text-white text-center mb-6">Common Questions</h2>
                    {[
                        { q: 'What is a credit?', a: 'One credit = $0.01 of generation value. A 10s video loop costs 25-1800 credits depending on model quality.' },
                        { q: 'Do unused credits roll over?', a: 'Subscription credits reset monthly. Purchased add-on credits never expire.' },
                        { q: 'Can I use assets commercially?', a: 'Pro plan and above include a commercial license for live performances and events.' },
                        { q: 'What models can free users access?', a: 'Free tier includes SDXL and Stable Diffusion 3.5 Large via Hugging Face (image only). Upgrade to Creator for video generation.' },
                    ].map((faq, i) => (
                        <Card key={i}>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-white text-base">{faq.q}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-gray-400 text-sm">{faq.a}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </>
    )
}

