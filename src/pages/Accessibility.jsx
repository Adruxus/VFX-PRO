import { Helmet } from 'react-helmet-async'

export default function Accessibility() {
    return (
        <>
            <Helmet><title>Accessibility - VJ Studio Pro</title></Helmet>
            <div className="max-w-3xl mx-auto prose prose-invert">
                <h1>Accessibility Statement</h1>
                <p><strong>Last updated:</strong> March 1, 2026</p>
                <h2>Our Commitment</h2>
                <p>VJ Studio Pro is committed to ensuring digital accessibility for people with disabilities. We continually improve the user experience for everyone and apply the relevant accessibility standards.</p>
                <h2>Standards</h2>
                <p>We aim to conform to WCAG 2.1 Level AA as required by the ADA (Americans with Disabilities Act) and the European Accessibility Act (EAA, effective June 2025).</p>
                <h2>Measures Taken</h2>
                <ul>
                    <li>Semantic HTML structure</li>
                    <li>ARIA labels on interactive elements</li>
                    <li>Keyboard navigation support</li>
                    <li>Color contrast ratios meeting AA standards</li>
                    <li>Screen reader compatible components (Radix UI)</li>
                    <li>Focus management and visible focus indicators</li>
                    <li>Responsive design for all screen sizes</li>
                </ul>
                <h2>Known Limitations</h2>
                <p>AI-generated visual content may not have text alternatives. We provide metadata descriptions for all generated assets.</p>
                <h2>Feedback</h2>
                <p>If you encounter accessibility barriers, please contact accessibility@vjstudio.pro. We aim to respond within 2 business days.</p>
            </div>
        </>
    )
}