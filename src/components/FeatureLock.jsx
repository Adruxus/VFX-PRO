import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default function FeatureLock({
    title = 'Feature Locked',
    description = 'Upgrade your subscription to unlock this feature.',
    requiredPlan = 'Pro',
    actionLabel = 'View Pricing',
}) {
    return (
        <Card className='bg-[#0a1326]/85 border-cyan-400/30'>
            <CardHeader>
                <Badge variant='outline' className='w-fit border-fuchsia-400/40 text-fuchsia-200'>
                    Subscription Locked
                </Badge>
                <CardTitle className='text-cyan-100'>{title}</CardTitle>
                <CardDescription className='text-slate-300'>
                    {description}
                </CardDescription>
            </CardHeader>
            <CardContent className='flex items-center justify-between gap-3 flex-wrap'>
                <p className='text-sm text-cyan-200'>
                    Required plan: <span className='font-semibold'>{requiredPlan}</span>
                </p>
                <Button asChild variant='gradient'>
                    <Link to='/pricing'>{actionLabel}</Link>
                </Button>
            </CardContent>
        </Card>
    )
}
