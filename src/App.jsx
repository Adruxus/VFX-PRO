import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import Layout from './Layout'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import AssetGenerator from './pages/AssetGenerator'
import SetlistGenerator from './pages/SetlistGenerator'
import Marketplace from './pages/Marketplace'
import Pricing from './pages/Pricing'
import Billing from './pages/Billing'
import Account from './pages/Account'
import SDKIntegrations from './pages/SDKIntegrations'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsOfService from './pages/TermsOfService'
import CookiePolicy from './pages/CookiePolicy'
import Accessibility from './pages/Accessibility'
import CookieBanner from './components/CookieBanner'
import './App.css'

import { Toaster } from 'sonner'

const qc = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 300000 } } })

export default function App() {
    return (
        <HelmetProvider>
            <QueryClientProvider client={qc}>
                <Router>
                    <Layout>
                        <Routes>
                            <Route path='/' element={<Home />} />
                            <Route path='/dashboard' element={<Dashboard />} />
                            <Route path='/generator' element={<AssetGenerator />} />
                            <Route path='/setlist' element={<SetlistGenerator />} />
                            <Route path='/marketplace' element={<Marketplace />} />
                            <Route path='/pricing' element={<Pricing />} />
                            <Route path='/billing' element={<Billing />} />
                            <Route path='/account' element={<Account />} />
                            <Route path='/integrations' element={<SDKIntegrations />} />
                            <Route path='/privacy' element={<PrivacyPolicy />} />
                            <Route path='/terms' element={<TermsOfService />} />
                            <Route path='/cookies' element={<CookiePolicy />} />
                            <Route path='/accessibility' element={<Accessibility />} />
                        </Routes>
                    </Layout>
                    <CookieBanner />
                </Router>
                <Toaster position='top-right' richColors />
            </QueryClientProvider>
        </HelmetProvider>
    )
}
