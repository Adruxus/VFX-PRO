import { Helmet } from 'react-helmet-async'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles, Download, TrendingUp, Clock, CreditCard } from 'lucide-react'

export default function Dashboard() {
    const stats = [
        { label: 'Credits Remaining', value: '1,250', icon: Sparkles },
        { label: 'Assets Created', value: '47', icon: Download },
        { label: 'This Month', value: '12', icon: TrendingUp },
        { label: 'Total Hours', value: '8.5', icon: Clock }
    ]

    return (
        <>
            <Helmet><title>Dashboard - VJ Studio Pro</title></Helmet>
            <div className="space-y-6">
                <h1 className="text-3xl font-bold text-white">Dashboard</h1>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    {stats.map(s => (
                        <Card key={s.label} className="bg-slate-900/50 border-purple-500/20">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium text-gray-400">{s.label}</CardTitle>
                                <s.icon className="w-4 h-4 text-purple-400" />
                            </CardHeader>
                            <CardContent><div className="text-2xl font-bold text-white">{s.value}</div></CardContent>
                        </Card>
                    ))}
                </div>
                <Card className="bg-slate-900/50 border-purple-500/20">
                    <CardHeader><CardTitle className="text-white">Subscription</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-white font-medium">Professional Plan</span>
                                <span className="text-purple-400 font-bold">$79/mo</span>
                            </div>
                            <p className="text-sm text-gray-400">Renews March 15, 2026</p>
                        </div>
                        <Button className="w-full bg-gradient-to-r from-purple-500 to-pink-500">
                            <CreditCard className="w-4 h-4 mr-2" />Manage Subscription
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </>
    )
}