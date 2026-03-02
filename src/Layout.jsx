import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Zap, Sparkles, Menu, LogIn } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAuth, UserAvatar, SignIn } from '@/services/auth'
import { getCredits } from '@/services/backend'

export default function Layout({ children }) {
    const location = useLocation()
    const { userId, isSignedIn } = useAuth()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const [credits, setCredits] = useState(100)
    const [showSignIn, setShowSignIn] = useState(false)

    useEffect(() => {
        if (isSignedIn && userId) {
            getCredits(userId).then(data => {
                setCredits(data.credits || 100)
            })
        } else {
            setCredits(100)
        }
    }, [isSignedIn, userId])

    const navigation = [
        { name: 'Generator', href: '/generator' },
        { name: 'Setlist', href: '/setlist' },
        { name: 'Marketplace', href: '/marketplace' },
        { name: 'Integrations', href: '/integrations' },
        { name: 'Pricing', href: '/pricing' }
    ]

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950">
            <header className="border-b border-purple-500/20 bg-slate-950/50 backdrop-blur-xl sticky top-0 z-50">
                <div className="container mx-auto px-4">
                    <div className="flex items-center justify-between h-16">
                        <Link to="/" className="flex items-center gap-2 group">
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Zap className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">VJ Studio Pro</span>
                        </Link>
                        <nav className="hidden md:flex items-center gap-6">
                            {navigation.map(item => (
                                <Link key={item.name} to={item.href} className={`text-sm font-medium transition-colors hover:text-purple-400 ${location.pathname === item.href ? 'text-purple-400' : 'text-gray-300'}`}>
                                    {item.name}
                                </Link>
                            ))}
                        </nav>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                                <Sparkles className="w-4 h-4 text-purple-400" />
                                <span className="text-sm font-medium text-purple-400">{credits} Credits</span>
                            </div>
                            {isSignedIn ? (
                                <UserAvatar />
                            ) : (
                                    <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="border-purple-500/20"
                                    onClick={() => setShowSignIn(true)}
                                >
                                    <LogIn className="w-4 h-4 mr-2" />Sign In
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </header>
            <main className="container mx-auto px-4 py-8">{children}</main>
            <footer className="border-t border-purple-500/20 bg-slate-950/50 backdrop-blur-xl mt-20">
                <div className="container mx-auto px-4 py-8 text-center text-sm text-gray-400">
                    © 2026 VJ Studio Pro. All rights reserved.
                </div>
            </footer>
            
            {showSignIn && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-purple-500/20 rounded-xl p-6 max-w-md w-full mx-4">
                        <h2 className="text-xl font-bold text-white mb-4">Sign In</h2>
                        <SignIn 
                            appearance={{
                                variables: { colorPrimary: '#a855f7' },
                                elements: {
                                    rootBox: 'w-full',
                                    card: 'bg-slate-800 border-purple-500/20'
                                }
                            }}
                            afterSignInUrl="/dashboard"
                        />
                        <Button 
                            variant="ghost" 
                            className="mt-4 w-full text-gray-400"
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
