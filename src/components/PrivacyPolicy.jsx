import { LegalPageFrame, Section, Callout } from './LegalKit';

// Public, no-auth route (see main.jsx) - needs to be reachable
// without signing in. Presentation lives in LegalKit/LegalPage.css; the
// policy text below is unchanged by the redesign.
const TOC = [
  { id: 'collect', title: 'Information We Collect' },
  { id: 'use', title: 'How We Use Your Information' },
  { id: 'share', title: 'How We Share Your Information' },
  { id: 'security', title: 'Data Security' },
  { id: 'retention', title: 'Data Retention' },
  { id: 'rights', title: 'Your Rights' },
  { id: 'children', title: "Children's Privacy" },
  { id: 'changes', title: 'Changes to This Policy' },
  { id: 'contact', title: 'Contact Us' },
];

export default function PrivacyPolicy() {
  return (
    <LegalPageFrame
      current="privacy"
      eyebrow="Legal"
      title="Privacy Policy"
      updated="22 September 2026"
      toc={TOC}
    >
      <p className="lp-intro">
        Med101 ("we", "us", "our") operates the Med101 website and app
        (med101.space), a medical-education quiz and study platform for
        medical students. This policy explains what information we
        collect, how we use it, and the choices you have.
      </p>

      <Section toc={TOC} i={0}>
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
          <li>Total time spent actively using the site, visible to admins for usage insights</li>
          <li>A device identifier used to enforce single-device sign-in on your account</li>
          <li>Basic technical data such as browser type, generated as part of normal website operation</li>
        </ul>

        <h3>c) Payment information (Med101 Maxx)</h3>
        <p>
          The Med101 Maxx subscription is handled manually, not through a
          payment gateway. If you choose to subscribe, you pay us
          directly via UPI (outside the app), then submit the following
          to us so we can verify and approve your payment:
        </p>
        <ul>
          <li>The transaction ID (UTR) from your payment</li>
          <li>The name on the bank account/UPI ID you paid from</li>
          <li>The amount paid</li>
          <li>A phone number, in case we need to reach you about the payment</li>
        </ul>
        <p>
          We do not collect or see your card, UPI PIN, or bank login
          details - only what you submit above, which our admin team
          uses solely to match your payment against our bank/UPI
          statement and activate your subscription. Once approved, we
          issue a one-time activation code to your account; we do not
          separately store your card or bank account details anywhere
          else in the app.
        </p>
      </Section>

      <Section toc={TOC} i={1}>
        <ul>
          <li>To create and maintain your account</li>
          <li>To provide quiz content, track your progress, and show leaderboards</li>
          <li>To verify manually-submitted payments and activate Med101 Maxx subscriptions</li>
          <li>To enforce one active device/session per account</li>
          <li>To communicate with you about your account, a payment, or support requests</li>
          <li>To maintain the security and integrity of the platform</li>
        </ul>
        <Callout>We do not sell your personal information to anyone.</Callout>
      </Section>

      <Section toc={TOC} i={2}>
        <p>We share information only with the service providers that power Med101, and only as needed for them to provide that service:</p>
        <ul>
          <li><strong>Firebase (Google Cloud)</strong> - hosts our database and authentication</li>
          <li><strong>Vercel</strong> - hosts our website</li>
        </ul>
        <p>
          Payment verification (Section 1c) is handled directly by our
          own admin team, not a third-party payment processor. We do
          not share your data with advertisers, and we do not use
          third-party advertising or tracking cookies.
        </p>
      </Section>

      <Section toc={TOC} i={3}>
        <p>
          Access to your data is controlled through Firebase Authentication
          and Firestore Security Rules, which restrict each account's data
          to that account and to admins. No method of transmission or
          storage is 100% secure, but we take reasonable steps to protect
          your information.
        </p>
      </Section>

      <Section toc={TOC} i={4}>
        <p>
          We retain your account information for as long as your account
          is active. If you'd like your account deleted, contact us using
          the details below. When we process a deletion request, we
          permanently erase your quiz history, scores, username, and
          study data, and permanently block the account from being used
          again. Your name and email address are not fully erasable due
          to a technical limitation of our authentication provider, but
          are retained only to keep the account blocked and are not used
          for any other purpose after deletion. Payment records (Section
          1c) are kept separately for bookkeeping purposes even after an
          account is deleted.
        </p>
      </Section>

      <Section toc={TOC} i={5}>
        <p>You can, at any time:</p>
        <ul>
          <li>Access or update your name, username, and year/semester from your profile settings</li>
          <li>Request a copy of the personal data we hold about you</li>
          <li>Request deletion of your account and study data (see Section 5 for what this covers)</li>
        </ul>
        <p>To exercise any of these, email us at the address below.</p>
      </Section>

      <Section toc={TOC} i={6}>
        <p>
          Med101 is intended for medical students and is not directed at
          children. We do not knowingly collect information from anyone
          under 18.
        </p>
      </Section>

      <Section toc={TOC} i={7}>
        <p>
          We may update this policy from time to time. Changes will be
          posted on this page with an updated "Last updated" date.
        </p>
      </Section>

      <Section toc={TOC} i={8}>
        <p>
          Questions about this policy or your data can be sent to:{' '}
          <a href="mailto:admin.med101@gmail.com">admin.med101@gmail.com</a>
        </p>
      </Section>
    </LegalPageFrame>
  );
}
