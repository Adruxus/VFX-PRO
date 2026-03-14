import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useState, useEffect, useMemo } from 'react'
import { SignIn, useAuth } from '@clerk/clerk-react'
import { UserAvatar } from '@/services/auth'
import { getCredits } from '@/services/backend'
import { PLAN_LABELS, useAccessControl } from '@/services/accessControl'
import { cn } from '@/lib/utils'
import {
    House,
    Gauge,
    MagicWand,
    MusicNotes,
    Storefront,
    Cpu,
    LinkSimple,
    CurrencyDollar,
    Sparkle,
    FilmSlate,
    List,
    X,
    CaretLeft,
    CaretRight,
    SignIn as SignInIcon,
    Lightning,
    ShieldStar,
} from '@/components/icons/futureIcons'

const SIDEBAR_STATE_KEY = 'vfx_pro_sidebar_collapsed'

const NAVIGATION = [
    { name: 'Home', href: '/', icon: House },
    { name: 'Dashboard', href: '/dashboard', icon: Gauge },
    { name: 'Generator', href: '/generator', icon: MagicWand },
    { name: 'Tutorials', href: '/tutorials', icon: FilmSlate },
    { name: 'Setlist', href: '/setlist', icon: MusicNotes },
    { name: 'Marketplace', href: '/marketplace', icon: Storefront },
    { name: '3D Engine', href: '/engines', icon: Cpu },
    { name: 'Integrations', href: '/integrations', icon: LinkSimple },
    { name: 'Pricing', href: '/pricing', icon: CurrencyDollar },
]

function isActiveRoute(currentPath, href) {
    if (href === '/') return currentPath === '/'
    return currentPath === href || currentPath.startsWith(`${href}/`)
}

export default function Layout({ children }) {
    const location = useLocation()
    const { userId, isSignedIn } = useAuth()
    const { effectivePlan, isAdmin } = useAccessControl()
    const [credits, setCredits] = useState(100)
    const [showSignIn, setShowSignIn] = useState(false)
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

    useEffect(() => {
        const stored = localStorage.getItem(SIDEBAR_STATE_KEY)
        if (stored === '1') setSidebarCollapsed(true)
    }, [])

    useEffect(() => {
        localStorage.setItem(SIDEBAR_STATE_KEY, sidebarCollapsed ? '1' : '0')
    }, [sidebarCollapsed])

    useEffect(() => {
        let active = true
        if (isSignedIn && userId) {
            getCredits(userId, effectivePlan).then((data) => {
                if (!active) return
                setCredits(data.credits || 100)
            })
        } else {
            setCredits(100)
        }
        return () => {
            active = false
        }
    }, [effectivePlan, isSignedIn, userId])

    useEffect(() => {
        setMobileSidebarOpen(false)
    }, [location.pathname])

    const currentTitle = useMemo(() => {
        const found = NAVIGATION.find((item) => isActiveRoute(location.pathname, item.href))
        return found?.name || 'VFX Studios'
    }, [location.pathname])

    return (
        <div className='min-h-screen bg-[#06080f] text-white relative overflow-x-hidden'>
            <div className='pointer-events-none fixed inset-0 -z-10'>
                <div className='absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(16,185,255,0.15),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(217,70,239,0.18),transparent_45%),linear-gradient(160deg,#04060b_0%,#0b1120_45%,#09070f_100%)]' />
                <div className='absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(56,189,248,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.22)_1px,transparent_1px)] [background-size:32px_32px]' />
            </div>

            <aside
                className={cn(
                    'hidden lg:flex fixed left-0 top-0 bottom-0 z-40 flex-col border-r border-cyan-400/25 bg-[#050814]/90 backdrop-blur-md transition-all duration-300',
                    sidebarCollapsed ? 'w-20' : 'w-72'
                )}
            >
                <div className='h-16 px-4 border-b border-cyan-400/20 flex items-center justify-between'>
                    <Link to='/' className='flex items-center gap-2 min-w-0'>
                        <div className='w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-400 to-fuchsia-500 flex items-center justify-center shadow-[0_0_20px_rgba(56,189,248,0.35)]'>
                            <Lightning size={20} weight='duotone' className='text-white' />
                        </div>
                        {!sidebarCollapsed && (
                            <div className='min-w-0'>
                                <p className='text-sm font-semibold tracking-wide text-cyan-200 truncate'>VFX Studios</p>
                                <p className='text-[10px] uppercase tracking-[0.22em] text-cyan-400/70'>Cyber Console</p>
                            </div>
                        )}
                    </Link>
                    <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='text-cyan-300 hover:text-white hover:bg-cyan-500/10'
                        onClick={() => setSidebarCollapsed((prev) => !prev)}
                    >
                        {sidebarCollapsed ? <CaretRight size={16} /> : <CaretLeft size={16} />}
                    </Button>
                </div>

                <nav className='flex-1 px-3 py-4 space-y-1 overflow-y-auto'>
                    {NAVIGATION.map((item) => {
                        const Icon = item.icon
                        const active = isActiveRoute(location.pathname, item.href)
                        return (
                            <Link
                                key={item.name}
                                to={item.href}
                                className={cn(
                                    'group flex items-center rounded-lg transition-all duration-200',
                                    sidebarCollapsed ? 'justify-center px-2 h-11' : 'gap-3 px-3 h-11',
                                    active
                                        ? 'bg-gradient-to-r from-cyan-500/20 to-fuchsia-500/20 border border-cyan-400/35 text-cyan-100'
                                        : 'text-slate-300 hover:text-white hover:bg-cyan-500/10'
                                )}
                                title={sidebarCollapsed ? item.name : undefined}
                            >
                                <Icon size={16} weight='duotone' className='shrink-0' />
                                {!sidebarCollapsed && <span className='text-sm font-medium'>{item.name}</span>}
                            </Link>
                        )
                    })}
                </nav>

                <div className='border-t border-cyan-400/20 p-3 space-y-3'>
                    {!sidebarCollapsed && (
                        <div className='rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-2'>
                            <div className='flex items-center gap-2 text-cyan-200 text-xs uppercase tracking-wide'>
                                <Sparkle size={14} weight='duotone' />
                                Credits
                            </div>
                            <p className='text-lg font-semibold text-white mt-1'>{credits}</p>
                            <Badge
                                variant='outline'
                                className={cn(
                                    'mt-2 border-cyan-400/35',
                                    isAdmin ? 'text-fuchsia-200 bg-fuchsia-500/10 border-fuchsia-400/35' : 'text-cyan-100'
                                )}
                            >
                                {isAdmin && <ShieldStar size={12} className='mr-1.5' />}
                                {isAdmin ? 'Admin Studio' : `${PLAN_LABELS[effectivePlan]} Plan`}
                            </Badge>
                        </div>
                    )}
                    <div className={cn('flex items-center', sidebarCollapsed ? 'justify-center' : 'justify-between gap-2')}>
                        {isSignedIn ? (
                            <UserAvatar />
                        ) : (
                            <Button
                                variant='outline'
                                size={sidebarCollapsed ? 'icon' : 'sm'}
                                className='border-cyan-400/35 text-cyan-100 hover:bg-cyan-500/10'
                                onClick={() => setShowSignIn(true)}
                            >
                                <SignInIcon size={16} />
                                {!sidebarCollapsed && <span>Sign In</span>}
                            </Button>
                        )}
                    </div>
                </div>
            </aside>

            <header className='lg:hidden sticky top-0 z-40 h-16 border-b border-cyan-400/20 bg-[#060b1a]/90 backdrop-blur-md px-4 flex items-center justify-between'>
                <Link to='/' className='flex items-center gap-2'>
                    <div className='w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-400 to-fuchsia-500 flex items-center justify-center'>
                        <Lightning size={20} weight='duotone' className='text-white' />
                    </div>
                    <span className='text-cyan-100 font-semibold'>VFX Studios</span>
                </Link>
                <div className='flex items-center gap-2'>
                    {!isSignedIn && (
                        <Button
                            size='sm'
                            variant='outline'
                            className='border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/15'
                            onClick={() => setShowSignIn(true)}
                        >
                            <SignInIcon size={14} className='mr-1.5' />
                            Sign In
                        </Button>
                    )}
                    <Button variant='ghost' size='icon' onClick={() => setMobileSidebarOpen(true)}>
                        <List size={20} className='text-cyan-200' />
                    </Button>
                </div>
            </header>

            {mobileSidebarOpen && (
                <div className='lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm'>
                    <div className='absolute left-0 top-0 bottom-0 w-[86%] max-w-sm border-r border-cyan-400/25 bg-[#050814] p-4 overflow-y-auto'>
                        <div className='flex items-center justify-between mb-4'>
                            <p className='text-cyan-200 text-sm uppercase tracking-[0.2em]'>Navigation</p>
                            <Button variant='ghost' size='icon' onClick={() => setMobileSidebarOpen(false)}>
                                <X size={20} className='text-cyan-200' />
                            </Button>
                        </div>
                        <div className='space-y-2'>
                            {NAVIGATION.map((item) => {
                                const Icon = item.icon
                                const active = isActiveRoute(location.pathname, item.href)
                                return (
                                    <Link
                                        key={item.name}
                                        to={item.href}
                                        className={cn(
                                            'flex items-center gap-3 rounded-lg px-3 h-11 text-sm',
                                            active
                                                ? 'bg-gradient-to-r from-cyan-500/20 to-fuchsia-500/20 border border-cyan-400/35 text-cyan-100'
                                                : 'text-slate-300 hover:bg-cyan-500/10'
                                        )}
                                    >
                                        <Icon size={16} weight='duotone' />
                                        <span>{item.name}</span>
                                    </Link>
                                )
                            })}
                        </div>
                        <div className='mt-5 pt-4 border-t border-cyan-500/20'>
                            {!isSignedIn ? (
                                <Button
                                    className='w-full'
                                    variant='outline'
                                    onClick={() => {
                                        setShowSignIn(true)
                                        setMobileSidebarOpen(false)
                                    }}
                                >
                                    <SignInIcon size={16} className='mr-2' />
                                    Sign In
                                </Button>
                            ) : (
                                <div className='flex items-center justify-center'>
                                    <UserAvatar />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className={cn('transition-all duration-300', sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-72')}>
                <main className='px-4 md:px-8 py-6 md:py-8'>
                    <div className='mb-6 rounded-xl border border-cyan-400/20 bg-[#0a1222]/70 backdrop-blur-sm px-4 py-3 flex items-center justify-between gap-4'>
                        <div>
                            <p className='text-[10px] uppercase tracking-[0.24em] text-cyan-400'>Control Layer</p>
                            <h1 className='text-xl md:text-2xl font-semibold text-cyan-100'>{currentTitle}</h1>
                        </div>
                        <div className='flex items-center gap-2'>
                            {!isSignedIn && (
                                <Button
                                    size='sm'
                                    className='bg-cyan-500/20 text-cyan-100 border border-cyan-400/40 hover:bg-cyan-500/30'
                                    onClick={() => setShowSignIn(true)}
                                >
                                    <SignInIcon size={15} className='mr-1.5' />
                                    Sign In
                                </Button>
                            )}
                            <div className='hidden md:flex items-center gap-2 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1.5'>
                                <Sparkle size={16} className='text-fuchsia-300' />
                                <span className='text-sm text-fuchsia-100'>{credits} Credits</span>
                            </div>
                        </div>
                    </div>
                    {children}
                </main>
                <footer className='px-4 md:px-8 pb-8 text-xs text-slate-400'>
                    <div className='border-t border-cyan-400/20 pt-4'>© 2026 VFX Studios</div>
                </footer>
            </div>

            {showSignIn && (
                <div className='fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'>
                    <div className='bg-slate-900 border border-cyan-400/30 rounded-xl p-6 max-w-md w-full'>
                        <h2 className='text-xl font-bold text-white mb-4'>Sign In</h2>
                        <SignIn
                            appearance={{
                                variables: { colorPrimary: '#22d3ee' },
                                elements: {
                                    rootBox: 'w-full',
                                    card: 'bg-slate-800 border-cyan-400/20',
                                },
                            }}
                            afterSignInUrl='/dashboard'
                        />
                        <Button
                            variant='ghost'
                            className='mt-4 w-full text-gray-300'
                            onClick={() => setShowSignIn(false)}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}

