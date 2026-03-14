import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import { lazy, Suspense } from 'react'
import Layout from './Layout'
import CookieBanner from './components/CookieBanner'
import './App.css'
import { AuthProvider } from '@/services/auth'

import { Toaster } from 'sonner'

const Home = lazy(() => import('./pages/Home'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const AssetGenerator = lazy(() => import('./pages/AssetGenerator'))
const SetlistGenerator = lazy(() => import('./pages/SetlistGenerator'))
const Tutorials = lazy(() => import('./pages/Tutorials'))
const Marketplace = lazy(() => import('./pages/Marketplace'))
const Pricing = lazy(() => import('./pages/Pricing'))
const Billing = lazy(() => import('./pages/Billing'))
const Account = lazy(() => import('./pages/Account'))
const SDKIntegrations = lazy(() => import('./pages/SDKIntegrations'))
const Engines = lazy(() => import('./pages/Engines'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const TermsOfService = lazy(() => import('./pages/TermsOfService'))
const CookiePolicy = lazy(() => import('./pages/CookiePolicy'))
const Accessibility = lazy(() => import('./pages/Accessibility'))

const qc = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 300000 } } })

export default function App() {
    return (
        <HelmetProvider>
            <AuthProvider>
                <QueryClientProvider client={qc}>
                    <Router>
                        <Layout>
                            <Suspense fallback={<div className='p-6 text-sm text-slate-300'>Loading...</div>}>
                                <Routes>
                                    <Route path='/' element={<Home />} />
                                    <Route path='/dashboard' element={<Dashboard />} />
                                    <Route path='/generator' element={<AssetGenerator />} />
                                    <Route path='/tutorials' element={<Tutorials />} />
                                    <Route path='/setlist' element={<SetlistGenerator />} />
                                    <Route path='/marketplace' element={<Marketplace />} />
                                    <Route path='/pricing' element={<Pricing />} />
                                    <Route path='/billing' element={<Billing />} />
                                    <Route path='/account' element={<Account />} />
                                    <Route path='/engines' element={<Engines />} />
                                    <Route path='/integrations' element={<SDKIntegrations />} />
                                    <Route path='/privacy' element={<PrivacyPolicy />} />
                                    <Route path='/terms' element={<TermsOfService />} />
                                    <Route path='/cookies' element={<CookiePolicy />} />
                                    <Route path='/accessibility' element={<Accessibility />} />
                                </Routes>
                            </Suspense>
                        </Layout>
                        <CookieBanner />
                    </Router>
                    <Toaster position='top-right' richColors />
                </QueryClientProvider>
            </AuthProvider>
        </HelmetProvider>
    )
}
