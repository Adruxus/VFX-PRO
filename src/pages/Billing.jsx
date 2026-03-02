import { Helmet } from 'react-helmet-async'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useState } from 'react'
import { CreditCard, Download, Calendar, Sparkles, TrendingUp, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || 'pk_test_placeholder')

const STRIPE_APPEARANCE = {
    theme: 'night',
    variables: {
        colorPrimary: '#a855f7',
        colorBackground: '#1e293b',
        colorText: '#f1f5f9',
        borderRadius: '8px',
    },
}

function CheckoutForm({ onSuccess }) {
    const stripe = useStripe()
    const elements = useElements()
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!stripe || !elements) return
        setLoading(true)
        const { error } = await stripe.confirmPayment({
            elements,
            confirmParams: { return_url: window.location.origin + '/billing?success=true' },
        })
        if (error) toast.error(error.message)
        else onSuccess()
        setLoading(false)
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <PaymentElement />
            <Button type="submit" disabled={!stripe || loading} variant="gradient" className="w-full">
                {loading ? 'Processing...' : 'Confirm Payment'}
            </Button>
        </form>
    )
}

const INVOICES = [
    { id: 'INV-2026-003', date: 'Mar 1, 2026', amount: '$49.00', plan: 'Pro', status: 'paid' },
    { id: 'INV-2026-002', date: 'Feb 1, 2026', amount: '$49.00', plan: 'Pro', status: 'paid' },
    { id: 'INV-2026-001', date: 'Jan 1, 2026', amount: '$49.00', plan: 'Pro', status: 'paid' },
    { id: 'INV-2025-012', date: 'Dec 1, 2025', amount: '$19.00', plan: 'Creator', status: 'paid' },
]

export default function Billing() {
    const [showPayment, setShowPayment] = useState(false)
    const [clientSecret] = useState('pi_test_placeholder_secret')

    const creditsUsed = 1240
    const creditsTotal = 2000
    const creditPct = Math.round((creditsUsed / creditsTotal) * 100)

    return (
        <>
            <Helmet><title>Billing - VJ Studio Pro</title></Helmet>
            <div className="space-y-6 max-w-4xl">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-1">Billing & Payments</h1>
                    <p className="text-gray-400">Manage your subscription, credits, and invoices</p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-white">Current Plan</CardTitle>
                                <Badge>Pro</Badge>
                            </div>
                            <CardDescription className="text-gray-400">Billed monthly</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between py-2 border-b border-purple-500/10">
                                <span className="text-gray-400">Plan</span>
                                <span className="text-white font-semibold">Pro — $49/month</span>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-purple-500/10">
                                <span className="text-gray-400">Next billing</span>
                                <span className="text-white">April 1, 2026</span>
                            </div>
                            <div className="flex items-center justify-between py-2">
                                <span className="text-gray-400">Payment</span>
                                <span className="text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-purple-400" />Visa ••••4242
                </span>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <Button variant="gradient" className="flex-1" onClick={() => setShowPayment(true)}>
                                    <CreditCard className="w-4 h-4 mr-2" />Update Card
                                </Button>
                                <Button variant="outline" className="flex-1">Upgrade Plan</Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-purple-400" />Credit Usage
                            </CardTitle>
                            <CardDescription className="text-gray-400">Resets April 1, 2026</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Used this month</span>
                                    <span className="text-white font-semibold">{creditsUsed.toLocaleString()} / {creditsTotal.toLocaleString()}</span>
                                </div>
                                <Progress value={creditPct} />
                                <p className="text-xs text-gray-500">{creditsTotal - creditsUsed} credits remaining</p>
                            </div>
                            <Separator />
                            <div className="space-y-2">
                                <p className="text-sm text-gray-400 font-medium">Quick top-up</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { l: '100 credits', p: '$3' },
                                        { l: '500 credits', p: '$12' },
                                        { l: '2,000 credits', p: '$39' },
                                        { l: '5,000 credits', p: '$79' },
                                    ].map(pack => (
                                        <Button key={pack.l} variant="outline" size="sm" className="flex flex-col h-auto py-2" onClick={() => setShowPayment(true)}>
                                            <span className="font-semibold text-white">{pack.p}</span>
                                            <span className="text-xs text-gray-400">{pack.l}</span>
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                            <TrendingUp className="w-5 h-5" />Usage This Month
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { l: 'Video Loops', c: 34, cr: 340 },
                                { l: 'Shaders', c: 12, cr: 60 },
                                { l: 'LUTs', c: 8, cr: 40 },
                                { l: 'Setlists', c: 5, cr: 800 },
                            ].map(s => (
                                <div key={s.l} className="p-4 bg-slate-800/50 rounded-lg text-center">
                                    <p className="text-2xl font-bold text-white">{s.c}</p>
                                    <p className="text-sm text-gray-400">{s.l}</p>
                                    <p className="text-xs text-purple-400 mt-1">{s.cr} credits</p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-white">Invoice History</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {INVOICES.map(inv => (
                                <div key={inv.id} className="flex items-center justify-between p-4 bg-slate-800/40 rounded-lg hover:bg-slate-800/60 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <Calendar className="w-5 h-5 text-purple-400 flex-shrink-0" />
                                        <div>
                                            <p className="text-white font-medium text-sm">{inv.id}</p>
                                            <p className="text-xs text-gray-400">{inv.date} &middot; {inv.plan} Plan</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-white font-bold">{inv.amount}</span>
                                        <Badge variant="success"><CheckCircle className="w-3 h-3 mr-1" />Paid</Badge>
                                        <Button size="sm" variant="ghost"><Download className="w-4 h-4" /></Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={showPayment} onOpenChange={setShowPayment}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Secure Payment</DialogTitle>
                        <DialogDescription>Powered by Stripe — your card details are encrypted</DialogDescription>
                    </DialogHeader>
                    {clientSecret && (
                        <Elements stripe={stripePromise} options={{ clientSecret, appearance: STRIPE_APPEARANCE }}>
                            <CheckoutForm onSuccess={() => { setShowPayment(false); toast.success('Payment successful!') }} />
                        </Elements>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}