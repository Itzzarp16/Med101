import './LegalPage.css';

// Public, no-auth route (see main.jsx) - needs to be reachable
// without signing in.
export default function TermsAndConditions() {
  return (
    <div className="legal-page">
      <div className="legal-card">
        <h1>Terms &amp; Conditions</h1>
        <p className="legal-updated">Last updated: 12 September 2026</p>

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

        <h2>4. Premium Subscriptions &amp; Payments</h2>
        <p>Premium content/features are activated through a manual process, not an automatic payment gateway:</p>
        <ul>
          <li>You pay us directly via UPI, using the UPI ID/QR code shown in the app.</li>
          <li>You then submit the transaction ID (UTR), the name on the account you paid from, the amount, and a phone number, so we can verify the payment.</li>
          <li>Our admin team manually checks this against our own bank/UPI records. This isn't instant - please allow a reasonable time for review.</li>
          <li>Once approved, you'll receive a one-time activation code to redeem in the app, unlocking Premium for the duration you paid for.</li>
          <li>Submitting inaccurate payment details, or a transaction ID that doesn't correspond to an actual payment to us, may result in rejection and, for repeated or deliberate attempts, account suspension.</li>
        </ul>

        <h2>5. Cancellations &amp; Refunds</h2>
        <ul>
          <li>Premium is a one-time payment for a fixed duration, not an auto-renewing subscription - there's nothing to "cancel" in that sense.</li>
          <li>If you've submitted a payment that hasn't been approved yet and change your mind, contact us before approval and we'll refund it.</li>
          <li>Once a payment is approved and an activation code is issued, it's non-refundable, except where required by law.</li>
          <li>If you believe a payment was verified incorrectly, or you were charged in error, contact us at the email below and we'll look into it.</li>
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

        

        <h2>12. Contact Us</h2>
        <p>
          Questions about these Terms, a payment, or your account can be
          sent to:{' '}
          <a href="mailto:admin.med101@gmail.com">admin.med101@gmail.com</a>
        </p>
      </div>
    </div>
  );
}
