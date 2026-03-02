import { Helmet } from 'react-helmet-async'

export default function CookiePolicy() {
    return (
        <>
            <Helmet><title>Cookie Policy - VJ Studio Pro</title></Helmet>
            <div className="max-w-3xl mx-auto prose prose-invert">
                <h1>Cookie Policy</h1>
                <p><strong>Last updated:</strong> March 1, 2026</p>
                <h2>Essential Cookies</h2>
                <p>Required for authentication (Clerk), session management, and security. Cannot be disabled.</p>
                <h2>Functional Cookies</h2>
                <p>Remember your preferences (theme, model selection). Can be disabled in settings.</p>
                <h2>Analytics Cookies</h2>
                <p>Help us understand usage patterns. Opt-out available. No personal data shared with third parties.</p>
                <h2>Managing Cookies</h2>
                <p>You can manage cookies through your browser settings or our cookie consent banner.</p>
            </div>
        </>
    )
}