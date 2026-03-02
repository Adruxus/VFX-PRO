import { Helmet } from 'react-helmet-async'

export default function PrivacyPolicy() {
    return (
        <>
            <Helmet><title>Privacy Policy - VJ Studio Pro</title></Helmet>
            <div className="max-w-3xl mx-auto prose prose-invert">
                <h1>Privacy Policy</h1>
                <p><strong>Last updated:</strong> March 1, 2026</p>
                <h2>1. Information We Collect</h2>
                <p>We collect information you provide directly: name, email, payment information (processed by Stripe), and content you generate using our platform.</p>
                <h2>2. How We Use Your Information</h2>
                <p>To provide and improve our services, process payments, send service communications, and comply with legal obligations.</p>
                <h2>3. Data Sharing</h2>
                <p>We share data with: Stripe (payments), Clerk (authentication), Replicate and Hugging Face (AI generation). We do not sell your personal data.</p>
                <h2>4. GDPR Rights (EU Users)</h2>
                <p>You have the right to access, rectify, erase, restrict processing, data portability, and object to processing of your personal data. Contact privacy@vjstudio.pro.</p>
                <h2>5. CCPA Rights (California Users)</h2>
                <p>You have the right to know what data we collect, request deletion, and opt-out of data sales. We do not sell personal information.</p>
                <h2>6. Data Retention</h2>
                <p>We retain account data while your account is active. Generated assets are stored for 90 days unless saved to your library.</p>
                <h2>7. Security</h2>
                <p>We use industry-standard encryption (TLS 1.3), secure payment processing (PCI DSS via Stripe), and regular security audits.</p>
                <h2>8. Cookies</h2>
                <p>We use essential cookies for authentication and preferences. See our Cookie Policy for details.</p>
                <h2>9. Children</h2>
                <p>Our service is not directed to children under 13. We do not knowingly collect data from children under 13 (COPPA compliance).</p>
                <h2>10. Contact</h2>
                <p>Data Protection Officer: privacy@vjstudio.pro</p>
            </div>
        </>
    )
}