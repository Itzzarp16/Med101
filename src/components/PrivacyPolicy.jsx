import './LegalPage.css';

// Public, no-auth route (see main.jsx) - Razorpay's onboarding review
// needs a real, reachable URL, not a page hidden behind sign-in.
export default function PrivacyPolicy() {
  return (
    <div className="legal-page">
      <div className="legal-card">
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: 10 September 2026</p>

        <p>
          Med101 ("we", "us", "our") operates the Med101 website and app
          (med101.space), a medical-education quiz and study platform for
          medical students. This policy explains what information we
          collect, how we use it, and the choices you have.
        </p>

        <h2>1. Information We Collect</h2>
        <h3>a) Information you provide directly</h3>
        <ul>
          <li>Name and email address, when you create an account</li>
          <li>A username you choose</li>
          <li>Your year and semester of study</li>
          <li>Password (stored securely by our authentication provider, Firebase Authentication - we never see or store your password ourselves)</li>
        </ul>

        <h3>b) Information collected automatically</h3>
        <ul>
          <li>Quiz activity and study progress (e.g. questions attempted, scores, time spent), used to power your dashboard and leaderboards</li>
          <li>A device identifier used to enforce single-device sign-in on your account</li>
          <li>Basic technical data such as browser type, generated as part of normal website operation</li>
        </ul>

        <h3>c) Payment information</h3>
        <p>
          If you purchase a subscription for premium content or features,
          payment is processed by Razorpay. We do not collect or store
          your card, UPI, or other payment instrument details ourselves -
          Razorpay handles this directly, under its own privacy and
          security practices. We receive only confirmation that a payment
          was made, the plan purchased, and transaction/order identifiers
          needed to activate your subscription and handle support
          requests.
        </p>

        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>To create and maintain your account</li>
          <li>To provide quiz content, track your progress, and show leaderboards</li>
          <li>To activate and manage paid subscriptions</li>
          <li>To enforce one active device/session per account</li>
          <li>To communicate with you about your account or support requests</li>
          <li>To maintain the security and integrity of the platform</li>
        </ul>
        <p>We do not sell your personal information to anyone.</p>

        <h2>3. How We Share Your Information</h2>
        <p>We share information only with the service providers that power Med101, and only as needed for them to provide that service:</p>
        <ul>
          <li><strong>Firebase (Google Cloud)</strong> - hosts our database and authentication</li>
          <li><strong>Razorpay</strong> - processes payments for subscriptions</li>
          <li><strong>Vercel</strong> - hosts our website</li>
        </ul>
        <p>We do not share your data with advertisers, and we do not use third-party advertising or tracking cookies.</p>

        <h2>4. Data Security</h2>
        <p>
          Access to your data is controlled through Firebase Authentication
          and Firestore Security Rules, which restrict each account's data
          to that account and to admins. No method of transmission or
          storage is 100% secure, but we take reasonable steps to protect
          your information.
        </p>

        <h2>5. Data Retention</h2>
        <p>
          We retain your account information for as long as your account
          is active. If you'd like your account and associated data
          deleted, contact us using the details below.
        </p>

        <h2>6. Your Rights</h2>
        <p>You can, at any time:</p>
        <ul>
          <li>Access or update your name, username, and year/semester from your profile settings</li>
          <li>Request a copy of the personal data we hold about you</li>
          <li>Request deletion of your account and personal data</li>
        </ul>
        <p>To exercise any of these, email us at the address below.</p>

        <h2>7. Children's Privacy</h2>
        <p>
          Med101 is intended for medical students and is not directed at
          children. We do not knowingly collect information from anyone
          under 18.
        </p>

        <h2>8. Changes to This Policy</h2>
        <p>
          We may update this policy from time to time. Changes will be
          posted on this page with an updated "Last updated" date.
        </p>

        <h2>9. Contact Us</h2>
        <p>
          Questions about this policy or your data can be sent to:{' '}
          <a href="mailto:admin.med101@gmail.com">admin.med101@gmail.com</a>
        </p>

        <p className="legal-governing">This policy is governed by the laws of India.</p>
      </div>
    </div>
  );
}
