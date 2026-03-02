import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'

export default function CookieBanner() {
    const [show, setShow] = useState(false)

    useEffect(() => {
        const consent = localStorage.getItem('cookie-consent')
        if (!consent) setShow(true)
    }, [])

    const accept = () => {
        localStorage.setItem('cookie-consent', 'accepted')
        setShow(false)
    }

    const decline = () => {
        localStorage.setItem('cookie-consent', 'declined')
        setShow(false)
    }

    if (!show) return null

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-slate-900 border-t border-purple-500/20 backdrop-blur-xl">
            <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-sm text-gray-300">
                    We use cookies for authentication and to improve your experience.{' '}
                    <Link to='/cookies' className='text-purple-400 underline'>Learn more</Link>
                </p>
                <div className="flex gap-2">
                    <Button size='sm' variant='outline' onClick={decline}>Decline</Button>
                    <Button size='sm' variant='gradient' onClick={accept}>Accept All</Button>
                </div>
            </div>
        </div>
    )
}