import { Helmet } from 'react-helmet-async'

export default function TermsOfService() {
    return (
        <>
            <Helmet><title>Terms of Service - VJ Studio Pro</title></Helmet>
            <div className="max-w-3xl mx-auto prose prose-invert">
                <h1>Terms of Service</h1>
                <p><strong>Last updated:</strong> March 1, 2026</p>
                <h2>1. Acceptance</h2>
                <p>By using VJ Studio Pro, you agree to these terms. If you disagree, do not use the service.</p>
                <h2>2. Service Description</h2>
                <p>VJ Studio Pro provides AI-powered visual asset generation for VJ performances, using third-party AI providers (Replicate, Hugging Face).</p>
                <h2>3. AI-Generated Content</h2>
                <p>Content generated using our platform is created by third-party AI models. You receive a license to use generated content commercially (Creator plan and above). You are responsible for ensuring generated content does not infringe on existing copyrights or intellectual property.</p>
                <h2>4. Acceptable Use</h2>
                <p>You may not use the service to generate illegal, harmful, or infringing content. We reserve the right to suspend accounts that violate this policy.</p>
                <h2>5. Credits and Billing</h2>
                <p>Credits are consumed per generation. Subscription credits reset monthly. Purchased credit packs do not expire. Refunds are available within 14 days for unused credits.</p>
                <h2>6. Intellectual Property</h2>
                <p>Per FTC guidelines and US Copyright Office guidance (2025-2026), AI-generated content may have limited copyright protection. Users should be aware of evolving legal standards regarding AI-generated works.</p>
                <h2>7. Limitation of Liability</h2>
                <p>VJ Studio Pro is provided as-is. We are not liable for indirect, incidental, or consequential damages. Maximum liability is limited to fees paid in the prior 12 months.</p>
                <h2>8. Termination</h2>
                <p>Either party may terminate at any time. Upon termination, your data will be available for export for 30 days.</p>
                <h2>9. Governing Law</h2>
                <p>These terms are governed by the laws of the State of Washington, USA.</p>
                <h2>10. Contact</h2>
                <p>legal@vjstudio.pro</p>
            </div>
        </>
    )
}