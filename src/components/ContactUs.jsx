import { useState } from 'react';
import { LegalPageFrame } from './LegalKit';

// Public, no-auth route (see main.jsx) - needs to be reachable
// without signing in.
const EMAIL = 'support@med101.space';
const INSTAGRAM_HANDLE = 'med101.space';
const INSTAGRAM_URL = 'https://www.instagram.com/med101.space/';
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
            <span className="lp-ico lp-ico--ig" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="0.7" fill="currentColor" />
              </svg>
            </span>
            <div>
              <div className="lp-card-label">Instagram</div>
              <div className="lp-card-value">@{INSTAGRAM_HANDLE}</div>
            </div>
          </div>
          <p className="lp-card-desc">
            Follow us for study tips, updates and new features, or send us a message.
          </p>
          <div className="lp-actions">
            <a
              className="lp-btn lp-btn--ig"
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Follow on Instagram
            </a>
          </div>
        </div>
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
              <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
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
