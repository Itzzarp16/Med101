import { useState } from 'react';
import { LegalPageFrame } from './LegalKit';

// Public, no-auth route (see main.jsx) - needs to be reachable
// without signing in.
const EMAIL = 'admin.med101@gmail.com';
const WHATSAPP_URL = 'https://chat.whatsapp.com/Kn2NDwg7Wij5VQbs35hYMx?s=cl&p=a&mlu=4&ilr=4';

export default function ContactUs() {
  const [copied, setCopied] = useState(false);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked: the address is still visible and tappable.
    }
  };

  return (
    <LegalPageFrame
      current="contact"
      eyebrow="Get in touch"
      title="Contact Us"
      lead="Have a question, suggestion, or found something that needs our attention? Don't hesitate to reach out."
    >
      <div className="lp-cards">
        <div className="lp-card">
          <div className="lp-card-top">
            <span className="lp-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="3" />
                <path d="M4 7.5l8 6 8-6" />
              </svg>
            </span>
            <div>
              <div className="lp-card-label">Email</div>
              <div className="lp-card-value">{EMAIL}</div>
            </div>
          </div>
          <p className="lp-card-desc">
            For questions, feedback, corrections, or support.
          </p>
          <div className="lp-actions">
            <a className="lp-btn" href={`mailto:${EMAIL}`}>Send email</a>
            <button type="button" className="lp-btn lp-btn--ghost" onClick={copyEmail}>
              {copied ? 'Copied ✓' : 'Copy address'}
            </button>
          </div>
        </div>

        <div className="lp-card">
          <div className="lp-card-top">
            <span className="lp-ico lp-ico--wa" aria-hidden="true">
              <img src="/whatsapp-icon.png" alt="" />
            </span>
            <div>
              <div className="lp-card-label">WhatsApp</div>
              <div className="lp-card-value">Med101 group</div>
            </div>
          </div>
          <p className="lp-card-desc">
            Join our WhatsApp group for updates and quick questions.
          </p>
          <div className="lp-actions">
            <a
              className="lp-btn lp-btn--wa"
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Join the Med101 WhatsApp Group
            </a>
          </div>
        </div>
      </div>

      <p className="lp-note">
        We are always happy to hear from you and work together to make
        Med101 better for everyone.
      </p>
    </LegalPageFrame>
  );
}
