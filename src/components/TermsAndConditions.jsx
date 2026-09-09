import './LegalPage.css';

// Public, no-auth route (see main.jsx) - same reasoning as
// PrivacyPolicy: needs to be reachable without signing in.
export default function TermsAndConditions() {
  return (
    <div className="legal-page">
      <div className="legal-card">
        <h1>Terms &amp; Conditions</h1>
        <p className="legal-updated">Last updated: 10 September 2026</p>

        <p>
          These Terms &amp; Conditions ("Terms") govern your use of Med101
          (med101.space), a medical-education quiz and study platform for
          medical students. By creating an account or using Med101, you
          agree to these Terms.
        </p>

        <h2>1. Description of Service</h2>
        <p>
          Med101 provides subject-wise quiz banks, progress tracking, and
          related study tools for medical students. Med101 is a study aid
          only - it is not a substitute for your official curriculum,
          textbooks, or the guidance of your instructors, and is not
          medical advice.
        </p>

        <h2>2. Eligibility</h2>
        <p>
          Med101 is intended for medical students and is not directed at
          children. You must be at least 18 years old, or the age of
          majority in your jurisdiction, to create an account.
        </p>

        <h2>3. Your Account</h2>
        <ul>
          <li>You're responsible for the accuracy of the information you provide and for keeping your password secure.</li>
          <li>Each account is for one person's individual use. Med101 enforces a single active device/session per account.</li>
          <li>You're responsible for all activity that happens under your account.</li>
        </ul>

        <h2>4. Subscriptions &amp; Payments</h2>
        <ul>
          <li>Some content and features require a paid subscription. Payments are processed securely by Razorpay - Med101 does not collect or store your card, UPI, or other payment details.</li>
          <li>A subscription grants access to premium content for the period you've paid for.</li>
          <li>Prices may change; any change will apply to future billing periods, not one you've already paid for.</li>
          <li>If a payment fails or a subscription lapses, premium access may be paused until it's renewed.</li>
        </ul>

        <h2>5. Cancellations &amp; Refunds</h2>
        <ul>
          <li>You may cancel a subscription at any time; cancellation stops future renewal but does not refund the current billing period already paid for.</li>
          <li>If you believe you were charged in error (e.g. a duplicate or failed transaction that was still charged), contact us at the email below and we'll look into it.</li>
          <li>Refunds, where granted, are returned to the original payment method via Razorpay and may take several business days to reflect.</li>
        </ul>

        <h2>6. Content &amp; Intellectual Property</h2>
        <p>
          Quiz questions, explanations, notices, and other material on
          Med101 belong to Med101 or its licensors. You may use them for
          your own personal study only - not for redistribution,
          resale, or republishing elsewhere (including scraping the
          platform to build another product).
        </p>

        <h2>7. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Share your account/login with others</li>
          <li>Attempt to bypass the single-device/session restriction</li>
          <li>Attempt to gain unauthorized access to any part of Med101 or another user's data</li>
          <li>Scrape, copy, or redistribute Med101's question bank or other content</li>
          <li>Use Med101 in any way that disrupts the platform or other users</li>
        </ul>

        <h2>8. Disclaimer of Warranties</h2>
        <p>
          Med101 is provided "as is." We don't guarantee that content is
          error-free, complete, or sufficient on its own to pass any
          particular exam - it's a supplementary study tool, and your
          results depend on many factors outside our control.
        </p>

        <h2>9. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, Med101 is not liable for
          indirect, incidental, or consequential damages arising from your
          use of the platform, including academic outcomes.
        </p>

        <h2>10. Termination</h2>
        <p>
          We may suspend or terminate an account that violates these
          Terms, including sharing login credentials or attempting to
          circumvent the single-device restriction.
        </p>

        <h2>11. Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time. Changes will be
          posted on this page with an updated "Last updated" date.
        </p>

        <h2>12. Governing Law</h2>
        <p>These Terms are governed by the laws of India.</p>

        <h2>13. Contact Us</h2>
        <p>
          Questions about these Terms, billing, or your account can be
          sent to:{' '}
          <a href="mailto:admin.med101@gmail.com">admin.med101@gmail.com</a>
        </p>
      </div>
    </div>
  );
}
