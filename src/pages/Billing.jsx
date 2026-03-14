import { useCallback, useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useUser } from '@clerk/clerk-react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CreditCard, DownloadSimple, CalendarBlank, Sparkle, TrendUp, CheckCircle, WarningCircle, ClockCounterClockwise } from '@/components/icons/futureIcons'
import { toast } from 'sonner'
import { getQueueAnalyticsSummary } from '@/services/queueAnalytics'
import {
    cancelTeamInvite,
    createTeamOrganization,
    getActiveTeamOrganization,
    getTeamBillingSummary,
    inviteTeamMember,
    listTeamOrganizations,
    setActiveTeamOrganization,
    updateTeamSeatPlan,
} from '@/services/teamWorkspace'

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

const INVOICES = [
    { id: 'INV-2026-003', date: 'Mar 1, 2026', amount: '$49.00', plan: 'Pro', status: 'paid' },
    { id: 'INV-2026-002', date: 'Feb 1, 2026', amount: '$49.00', plan: 'Pro', status: 'paid' },
    { id: 'INV-2026-001', date: 'Jan 1, 2026', amount: '$49.00', plan: 'Pro', status: 'paid' },
    { id: 'INV-2025-012', date: 'Dec 1, 2025', amount: '$19.00', plan: 'Creator', status: 'paid' },
]

function CheckoutForm({ onSuccess }) {
    const stripe = useStripe()
    const elements = useElements()
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (event) => {
        event.preventDefault()
        if (!stripe || !elements) return
        setLoading(true)
        const { error } = await stripe.confirmPayment({
            elements,
            confirmParams: { return_url: `${window.location.origin}/billing?success=true` },
        })
        if (error) toast.error(error.message)
        else onSuccess()
        setLoading(false)
    }

    return (
        <form onSubmit={handleSubmit} className='space-y-4'>
            <PaymentElement />
            <Button type='submit' disabled={!stripe || loading} variant='gradient' className='w-full'>
                {loading ? 'Processing...' : 'Confirm Payment'}
            </Button>
        </form>
    )
}

export default function Billing() {
    const { user } = useUser()
    const [showPayment, setShowPayment] = useState(false)
    const [clientSecret] = useState('pi_test_placeholder_secret')

    const creditsUsed = 1240
    const creditsTotal = 2000
    const creditPct = Math.round((creditsUsed / creditsTotal) * 100)

    const [organizations, setOrganizations] = useState([])
    const [activeOrgId, setActiveOrgId] = useState('')
    const [teamNameInput, setTeamNameInput] = useState('Studio Team')
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteRole, setInviteRole] = useState('editor')
    const [seatsInput, setSeatsInput] = useState('5')
    const [seatPriceInput, setSeatPriceInput] = useState('29')
    const [queueSummary, setQueueSummary] = useState({ window_days: 30, total_attempts: 0, lanes: [], recent_events: [] })

    const activeOrganization = useMemo(
        () => organizations.find((org) => org.id === activeOrgId) || null,
        [activeOrgId, organizations]
    )
    const teamSummary = useMemo(() => getTeamBillingSummary(activeOrganization), [activeOrganization])

    const refreshTeamWorkspace = useCallback(() => {
        if (!user?.id) {
            setOrganizations([])
            setActiveOrgId('')
            return
        }
        const orgs = listTeamOrganizations(user.id)
        const active = getActiveTeamOrganization(user.id)
        setOrganizations(orgs)
        setActiveOrgId(active?.id || orgs[0]?.id || '')
        if (active?.name) setTeamNameInput(active.name)
        setSeatsInput(String(active?.seats_included ?? 5))
        setSeatPriceInput(String(active?.seat_price_monthly ?? 29))
    }, [user?.id])

    useEffect(() => {
        if (!user?.id) {
            setQueueSummary({ window_days: 30, total_attempts: 0, lanes: [], recent_events: [] })
            return
        }
        refreshTeamWorkspace()
        setQueueSummary(getQueueAnalyticsSummary(user.id, { days: 30 }))
    }, [refreshTeamWorkspace, user?.id])

    useEffect(() => {
        if (!activeOrganization) return
        setTeamNameInput(activeOrganization.name || 'Studio Team')
        setSeatsInput(String(activeOrganization.seats_included ?? 5))
        setSeatPriceInput(String(activeOrganization.seat_price_monthly ?? 29))
    }, [activeOrganization])

    const handleTeamSelect = (orgId) => {
        if (!user?.id) return
        setActiveTeamOrganization(user.id, orgId)
        refreshTeamWorkspace()
    }

    const handleCreateTeam = () => {
        if (!user?.id) {
            toast.error('Sign in to create organizations.')
            return
        }
        createTeamOrganization(user.id, {
            name: teamNameInput || `Studio Team ${organizations.length + 1}`,
            seats_included: Number(seatsInput) || 5,
            seat_price_monthly: Number(seatPriceInput) || 29,
        })
        refreshTeamWorkspace()
        toast.success('Organization created.')
    }

    const handleSeatPlanSave = () => {
        if (!user?.id || !activeOrgId) {
            toast.error('Select an organization first.')
            return
        }
        updateTeamSeatPlan(user.id, activeOrgId, {
            seats_included: Number(seatsInput) || 0,
            seat_price_monthly: Number(seatPriceInput) || 0,
        })
        refreshTeamWorkspace()
        toast.success('Seat billing plan updated.')
    }

    const handleInviteMember = () => {
        if (!user?.id || !activeOrgId) {
            toast.error('Select an organization first.')
            return
        }
        if (!inviteEmail.trim()) {
            toast.error('Enter an invite email.')
            return
        }
        inviteTeamMember(user.id, activeOrgId, { email: inviteEmail, role: inviteRole })
        setInviteEmail('')
        refreshTeamWorkspace()
        toast.success('Invite queued.')
    }

    const handleCancelInvite = (inviteId) => {
        if (!user?.id || !activeOrgId) return
        cancelTeamInvite(user.id, activeOrgId, inviteId)
        refreshTeamWorkspace()
        toast.success('Invite cancelled.')
    }

    return (
        <>
            <Helmet>
                <title>Billing - VJ Studio Pro</title>
            </Helmet>
            <div className='space-y-6 max-w-5xl'>
                <div>
                    <h1 className='text-3xl font-bold text-white mb-1'>Billing & Payments</h1>
                    <p className='text-gray-400'>Manage subscription, credits, team seats, and queue SLA analytics</p>
                </div>

                <div className='grid gap-6 md:grid-cols-2'>
                    <Card>
                        <CardHeader>
                            <div className='flex items-center justify-between'>
                                <CardTitle className='text-white'>Current Plan</CardTitle>
                                <Badge>Pro</Badge>
                            </div>
                            <CardDescription className='text-gray-400'>Billed monthly</CardDescription>
                        </CardHeader>
                        <CardContent className='space-y-4'>
                            <div className='flex items-center justify-between py-2 border-b border-purple-500/10'>
                                <span className='text-gray-400'>Plan</span>
                                <span className='text-white font-semibold'>Pro - $49/month</span>
                            </div>
                            <div className='flex items-center justify-between py-2 border-b border-purple-500/10'>
                                <span className='text-gray-400'>Next billing</span>
                                <span className='text-white'>April 1, 2026</span>
                            </div>
                            <div className='flex items-center justify-between py-2'>
                                <span className='text-gray-400'>Payment</span>
                                <span className='text-white flex items-center gap-2'>
                                    <CreditCard className='w-4 h-4 text-purple-400' />
                                    Visa ••••4242
                                </span>
                            </div>
                            <div className='flex gap-2 pt-2'>
                                <Button variant='gradient' className='flex-1' onClick={() => setShowPayment(true)}>
                                    <CreditCard className='w-4 h-4 mr-2' />
                                    Update Card
                                </Button>
                                <Button variant='outline' className='flex-1'>
                                    Upgrade Plan
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className='text-white flex items-center gap-2'>
                                <Sparkle className='w-5 h-5 text-purple-400' />
                                Credit Usage
                            </CardTitle>
                            <CardDescription className='text-gray-400'>Resets April 1, 2026</CardDescription>
                        </CardHeader>
                        <CardContent className='space-y-4'>
                            <div className='space-y-2'>
                                <div className='flex justify-between text-sm'>
                                    <span className='text-gray-400'>Used this month</span>
                                    <span className='text-white font-semibold'>
                                        {creditsUsed.toLocaleString()} / {creditsTotal.toLocaleString()}
                                    </span>
                                </div>
                                <Progress value={creditPct} />
                                <p className='text-xs text-gray-500'>{creditsTotal - creditsUsed} credits remaining</p>
                            </div>
                            <Separator />
                            <div className='space-y-2'>
                                <p className='text-sm text-gray-400 font-medium'>Quick top-up</p>
                                <div className='grid grid-cols-2 gap-2'>
                                    {[
                                        { label: '100 credits', price: '$3' },
                                        { label: '500 credits', price: '$12' },
                                        { label: '2,000 credits', price: '$39' },
                                        { label: '5,000 credits', price: '$79' },
                                    ].map((pack) => (
                                        <Button
                                            key={pack.label}
                                            variant='outline'
                                            size='sm'
                                            className='flex flex-col h-auto py-2'
                                            onClick={() => setShowPayment(true)}
                                        >
                                            <span className='font-semibold text-white'>{pack.price}</span>
                                            <span className='text-xs text-gray-400'>{pack.label}</span>
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className='text-white flex items-center gap-2'>
                            <TrendUp className='w-5 h-5' />
                            Usage This Month
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                            {[
                                { label: 'Video Loops', count: 34, credits: 340 },
                                { label: 'Images', count: 52, credits: 260 },
                                { label: '3D Assets', count: 9, credits: 540 },
                                { label: 'Setlists', count: 5, credits: 800 },
                            ].map((item) => (
                                <div key={item.label} className='p-4 bg-slate-800/50 rounded-lg text-center'>
                                    <p className='text-2xl font-bold text-white'>{item.count}</p>
                                    <p className='text-sm text-gray-400'>{item.label}</p>
                                    <p className='text-xs text-purple-400 mt-1'>{item.credits} credits</p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className='text-white'>Team Workspace + Seat Billing</CardTitle>
                        <CardDescription className='text-gray-400'>
                            Configure organizations, invite roles, and monitor per-seat monthly spend.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className='space-y-4'>
                        <div className='grid gap-3 md:grid-cols-3'>
                            <Select value={activeOrgId || ''} onValueChange={handleTeamSelect}>
                                <SelectTrigger>
                                    <SelectValue placeholder='Select organization' />
                                </SelectTrigger>
                                <SelectContent>
                                    {organizations.map((org) => (
                                        <SelectItem key={org.id} value={org.id}>
                                            {org.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input
                                value={teamNameInput}
                                onChange={(event) => setTeamNameInput(event.target.value)}
                                placeholder='Organization name'
                            />
                            <Button variant='outline' onClick={handleCreateTeam}>
                                Create Organization
                            </Button>
                        </div>

                        <div className='grid gap-3 md:grid-cols-4'>
                            <div className='space-y-1'>
                                <Label>Seats Included</Label>
                                <Input value={seatsInput} onChange={(event) => setSeatsInput(event.target.value)} />
                            </div>
                            <div className='space-y-1'>
                                <Label>Seat Price / Month (USD)</Label>
                                <Input value={seatPriceInput} onChange={(event) => setSeatPriceInput(event.target.value)} />
                            </div>
                            <div className='md:col-span-2 flex items-end'>
                                <Button variant='outline' className='w-full' onClick={handleSeatPlanSave}>
                                    Save Seat Billing Plan
                                </Button>
                            </div>
                        </div>

                        <div className='grid gap-3 md:grid-cols-4'>
                            <div className='rounded-lg border border-slate-700/60 bg-slate-900/50 p-3'>
                                <p className='text-xs text-slate-400'>Seats Used</p>
                                <p className='text-xl font-semibold text-white'>{teamSummary.seats_used}</p>
                            </div>
                            <div className='rounded-lg border border-slate-700/60 bg-slate-900/50 p-3'>
                                <p className='text-xs text-slate-400'>Seats Included</p>
                                <p className='text-xl font-semibold text-white'>{teamSummary.seats_included}</p>
                            </div>
                            <div className='rounded-lg border border-slate-700/60 bg-slate-900/50 p-3'>
                                <p className='text-xs text-slate-400'>Overage Seats</p>
                                <p className='text-xl font-semibold text-white'>{teamSummary.seats_overage}</p>
                            </div>
                            <div className='rounded-lg border border-slate-700/60 bg-slate-900/50 p-3'>
                                <p className='text-xs text-slate-400'>Estimated Monthly Total</p>
                                <p className='text-xl font-semibold text-emerald-300'>${teamSummary.estimated_total_monthly_usd.toFixed(2)}</p>
                            </div>
                        </div>

                        <div className='grid gap-4 lg:grid-cols-2'>
                            <div className='space-y-2'>
                                <p className='text-sm text-cyan-200 font-medium'>Member Roles</p>
                                <div className='rounded-lg border border-slate-700/60 bg-slate-900/40 divide-y divide-slate-800/90'>
                                    {(activeOrganization?.members || []).map((member) => (
                                        <div key={member.id} className='flex items-center justify-between px-3 py-2 text-sm'>
                                            <span className='text-slate-200'>{member.email}</span>
                                            <Badge variant='outline'>{member.role}</Badge>
                                        </div>
                                    ))}
                                    {(activeOrganization?.members || []).length === 0 && (
                                        <p className='px-3 py-2 text-sm text-slate-400'>No members yet.</p>
                                    )}
                                </div>
                            </div>

                            <div className='space-y-2'>
                                <p className='text-sm text-cyan-200 font-medium'>Org Invites</p>
                                <div className='grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_auto]'>
                                    <Input
                                        value={inviteEmail}
                                        onChange={(event) => setInviteEmail(event.target.value)}
                                        placeholder='teammate@studio.com'
                                    />
                                    <Select value={inviteRole} onValueChange={setInviteRole}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value='admin'>Admin</SelectItem>
                                            <SelectItem value='editor'>Editor</SelectItem>
                                            <SelectItem value='viewer'>Viewer</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Button variant='outline' onClick={handleInviteMember}>
                                        Invite
                                    </Button>
                                </div>
                                <div className='rounded-lg border border-slate-700/60 bg-slate-900/40 divide-y divide-slate-800/90'>
                                    {(activeOrganization?.invites || []).map((invite) => (
                                        <div key={invite.id} className='flex items-center justify-between px-3 py-2 text-sm gap-3'>
                                            <div>
                                                <p className='text-slate-200'>{invite.email}</p>
                                                <p className='text-xs text-slate-400'>{invite.role} • {invite.status}</p>
                                            </div>
                                            <Button size='sm' variant='ghost' onClick={() => handleCancelInvite(invite.id)}>
                                                Cancel
                                            </Button>
                                        </div>
                                    ))}
                                    {(activeOrganization?.invites || []).length === 0 && (
                                        <p className='px-3 py-2 text-sm text-slate-400'>No pending invites.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className='text-white flex items-center gap-2'>
                            <ClockCounterClockwise className='w-5 h-5 text-cyan-300' />
                            Queue SLA Analytics (30 days)
                        </CardTitle>
                        <CardDescription className='text-gray-400'>
                            Queue lanes are tracked per generation attempt to validate SLA performance by plan tier.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className='space-y-3'>
                        {queueSummary.total_attempts === 0 && (
                            <div className='rounded-md border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-200 flex items-center gap-2'>
                                <WarningCircle size={16} />
                                No queue analytics yet. Generate assets to begin SLA tracking.
                            </div>
                        )}
                        {queueSummary.total_attempts > 0 && (
                            <>
                                <p className='text-sm text-slate-300'>Tracked attempts: {queueSummary.total_attempts}</p>
                                <div className='space-y-2'>
                                    {queueSummary.lanes.map((lane) => (
                                        <div key={lane.lane} className='rounded-lg border border-slate-700/60 bg-slate-900/40 p-3'>
                                            <div className='flex flex-wrap items-center gap-2'>
                                                <Badge variant='outline'>{lane.lane}</Badge>
                                                <span className='text-xs text-slate-400'>Attempts {lane.attempts}</span>
                                                <span className='text-xs text-slate-400'>Success {lane.success_rate_pct}%</span>
                                                <span className='text-xs text-slate-400'>Avg Queue {lane.avg_queue_wait_sec}s</span>
                                                <span className='text-xs text-slate-400'>P95 Queue {lane.p95_queue_wait_sec}s</span>
                                                <span className='text-xs text-slate-400'>Avg Total {lane.avg_total_sec}s</span>
                                                <span className='text-xs text-slate-400'>Peak Position {lane.peak_queue_position}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className='text-white'>Invoice History</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className='space-y-2'>
                            {INVOICES.map((invoice) => (
                                <div
                                    key={invoice.id}
                                    className='flex items-center justify-between p-4 bg-slate-800/40 rounded-lg hover:bg-slate-800/60 transition-colors'
                                >
                                    <div className='flex items-center gap-4'>
                                        <CalendarBlank className='w-5 h-5 text-purple-400 flex-shrink-0' />
                                        <div>
                                            <p className='text-white font-medium text-sm'>{invoice.id}</p>
                                            <p className='text-xs text-gray-400'>
                                                {invoice.date} · {invoice.plan} Plan
                                            </p>
                                        </div>
                                    </div>
                                    <div className='flex items-center gap-4'>
                                        <span className='text-white font-bold'>{invoice.amount}</span>
                                        <Badge variant='success'>
                                            <CheckCircle className='w-3 h-3 mr-1' />
                                            Paid
                                        </Badge>
                                        <Button size='sm' variant='ghost'>
                                            <DownloadSimple className='w-4 h-4' />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={showPayment} onOpenChange={setShowPayment}>
                <DialogContent className='sm:max-w-md'>
                    <DialogHeader>
                        <DialogTitle>Secure Payment</DialogTitle>
                        <DialogDescription>Powered by Stripe - your card details are encrypted</DialogDescription>
                    </DialogHeader>
                    {clientSecret && (
                        <Elements stripe={stripePromise} options={{ clientSecret, appearance: STRIPE_APPEARANCE }}>
                            <CheckoutForm
                                onSuccess={() => {
                                    setShowPayment(false)
                                    toast.success('Payment successful!')
                                }}
                            />
                        </Elements>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
