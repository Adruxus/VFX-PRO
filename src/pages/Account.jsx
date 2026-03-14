import { Helmet } from 'react-helmet-async'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { User, Key, ShieldCheck, Sparkle } from '@/components/icons/futureIcons'
import { ADMIN_TEST_ACCOUNT, PLAN_LABELS, useAccessControl } from '@/services/accessControl'
import { toast } from 'sonner'

const PLAN_OPTIONS = ['free', 'creator', 'pro', 'studio']
const VERIFICATION_METHOD_OPTIONS = [
    { value: 'id_scan', label: 'Government ID Scan' },
    { value: 'face_match', label: 'Face Match + Liveness' },
    { value: 'card_plus_id', label: 'Card + ID Verification' },
    { value: 'manual_review', label: 'Manual Compliance Review' },
]

export default function Account() {
    const {
        plan,
        effectivePlan,
        isAdmin,
        adminOverride,
        setPlan,
        setAdminOverride,
        activateAdminTestingAccount,
        userEmail,
        ageVerified,
        restrictedConsentAccepted,
        verificationMethod,
        verifiedAt,
        isCompliant,
        setAgeVerified,
        setRestrictedConsentAccepted,
        setVerificationMethod,
        completeComplianceVerification,
    } = useAccessControl()

    const onPlanChange = (value) => {
        setPlan(value)
        toast.success(`Plan set to ${PLAN_LABELS[value]}`)
    }

    const onAdminToggle = (enabled) => {
        setAdminOverride(enabled)
        toast.success(enabled ? 'Admin testing override enabled' : 'Admin testing override disabled')
    }

    const onAgeVerifiedToggle = (enabled) => {
        setAgeVerified(enabled)
        toast.success(enabled ? 'Age verification set to verified' : 'Age verification reset')
    }

    const onConsentToggle = (enabled) => {
        setRestrictedConsentAccepted(enabled)
        toast.success(enabled ? 'Restricted-content consent enabled' : 'Restricted-content consent disabled')
    }

    const onMethodChange = (value) => {
        setVerificationMethod(value)
        toast.success(`Verification method set: ${value}`)
    }

    const onCompleteVerification = () => {
        completeComplianceVerification(verificationMethod === 'unverified' ? 'manual_review' : verificationMethod)
        toast.success('Compliance verification completed')
    }

    return (
        <>
            <Helmet>
                <title>Account Settings - VFX Studios</title>
            </Helmet>
            <div className='space-y-6'>
                <h1 className='text-3xl font-bold text-white'>Account Settings</h1>

                <div className='grid gap-6 md:grid-cols-2'>
                    <Card className='bg-slate-900/50 border-cyan-400/20'>
                        <CardHeader>
                            <CardTitle className='text-white flex items-center gap-2'>
                                <User size={18} />
                                Profile
                            </CardTitle>
                            <CardDescription className='text-slate-400'>Current session identity and profile data</CardDescription>
                        </CardHeader>
                        <CardContent className='space-y-4'>
                            <div className='space-y-2'>
                                <Label>Email</Label>
                                <Input value={userEmail || 'Not signed in'} readOnly className='bg-slate-800 border-cyan-500/20 text-white' />
                            </div>
                            <div className='flex flex-wrap gap-2'>
                                <Badge variant='outline' className='border-cyan-400/35 text-cyan-200'>
                                    Stored Plan: {PLAN_LABELS[plan]}
                                </Badge>
                                <Badge variant='outline' className='border-fuchsia-400/35 text-fuchsia-200'>
                                    Effective: {PLAN_LABELS[effectivePlan]}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className='bg-slate-900/50 border-cyan-400/20'>
                        <CardHeader>
                            <CardTitle className='text-white flex items-center gap-2'>
                                <Sparkle size={18} />
                                Subscription Control
                            </CardTitle>
                            <CardDescription className='text-slate-400'>Prototype subscription lock used by generator and 3D editor</CardDescription>
                        </CardHeader>
                        <CardContent className='space-y-4'>
                            <div className='space-y-2'>
                                <Label>Plan Tier</Label>
                                <Select value={plan} onValueChange={onPlanChange}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PLAN_OPTIONS.map((option) => (
                                            <SelectItem key={option} value={option}>
                                                {PLAN_LABELS[option]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className='h-11 px-3 border border-cyan-500/20 bg-slate-800 rounded-md flex items-center justify-between'>
                                <span className='text-sm text-slate-300'>Admin Testing Override</span>
                                <Switch checked={adminOverride} onCheckedChange={onAdminToggle} />
                            </div>
                            <Button variant='gradient' className='w-full' onClick={activateAdminTestingAccount}>
                                <ShieldCheck size={16} className='mr-2' />
                                Activate Admin Test Account
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                <Card className='bg-slate-900/50 border-cyan-400/20'>
                    <CardHeader>
                        <CardTitle className='text-white flex items-center gap-2'>
                            <ShieldCheck size={18} />
                            Compliance and Age Verification
                        </CardTitle>
                        <CardDescription className='text-slate-400'>
                            Required for restricted generation and advanced Unreal/Unity scene tooling.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className='space-y-4'>
                        <div className='flex flex-wrap gap-2'>
                            <Badge
                                variant='outline'
                                className={
                                    isCompliant
                                        ? 'border-emerald-400/45 text-emerald-200 bg-emerald-500/10'
                                        : 'border-amber-400/45 text-amber-200 bg-amber-500/10'
                                }
                            >
                                {isCompliant ? 'Compliant for Restricted Features' : 'Compliance Required'}
                            </Badge>
                            {verifiedAt && (
                                <Badge variant='outline' className='border-cyan-400/35 text-cyan-200'>
                                    Verified At: {new Date(verifiedAt).toLocaleString()}
                                </Badge>
                            )}
                        </div>
                        <div className='h-11 px-3 border border-cyan-500/20 bg-slate-800 rounded-md flex items-center justify-between'>
                            <span className='text-sm text-slate-300'>Age Verified (18+)</span>
                            <Switch checked={ageVerified} onCheckedChange={onAgeVerifiedToggle} />
                        </div>
                        <div className='h-11 px-3 border border-cyan-500/20 bg-slate-800 rounded-md flex items-center justify-between'>
                            <span className='text-sm text-slate-300'>Restricted Content Consent Accepted</span>
                            <Switch checked={restrictedConsentAccepted} onCheckedChange={onConsentToggle} />
                        </div>
                        <div className='space-y-2'>
                            <Label>Verification Method</Label>
                            <Select value={verificationMethod} onValueChange={onMethodChange}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value='unverified'>Unverified</SelectItem>
                                    {VERIFICATION_METHOD_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button variant='gradient' className='w-full' onClick={onCompleteVerification}>
                            <ShieldCheck size={16} className='mr-2' />
                            Complete Verification
                        </Button>
                    </CardContent>
                </Card>

                <Card className='bg-slate-900/50 border-fuchsia-400/20'>
                    <CardHeader>
                        <CardTitle className='text-white flex items-center gap-2'>
                            <Key size={18} />
                            Admin Test Credentials
                        </CardTitle>
                        <CardDescription className='text-slate-400'>
                            Device-local prototype account for locked feature testing.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className='space-y-2 text-sm text-slate-300'>
                        <p>Name: {ADMIN_TEST_ACCOUNT.name}</p>
                        <p>Email: {ADMIN_TEST_ACCOUNT.email}</p>
                        <p>Password: {ADMIN_TEST_ACCOUNT.password}</p>
                        <p>Role: {ADMIN_TEST_ACCOUNT.role}</p>
                        {isAdmin && <Badge variant='outline' className='border-fuchsia-400/35 text-fuchsia-200 mt-2'>Admin override active</Badge>}
                    </CardContent>
                </Card>
            </div>
        </>
    )
}

