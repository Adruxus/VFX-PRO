import { ClerkProvider, UserButton, useAuth } from '@clerk/clerk-react'

const PK = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || 'pk_test_placeholder'

const appearance = {
    variables: { colorPrimary: '#a855f7', colorBackground: '#0f172a', colorText: '#f1f5f9', borderRadius: '0.75rem' },
}

export function AuthProvider({ children }) {
    return <ClerkProvider publishableKey={PK} appearance={appearance}>{children}</ClerkProvider>
}

export function AuthGuard({ children }) {
    const { isLoaded } = useAuth()
    if (!isLoaded) return <div className='flex justify-center p-20'><div className='w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin' /></div>
    return children
}

export function UserAvatar() {
    return <UserButton afterSignOutUrl='/' />
}
