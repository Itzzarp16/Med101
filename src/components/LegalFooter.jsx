import './LegalFooter.css';

export default function LegalFooter() {
  return (
    <div className="legal-footer">
      <div className="legal-footer-copyright">
        © 2026 Med101 — a medical MCQ study platform
      </div>

      <div className="legal-footer-tagline">
        Built for medical students preparing for exams.
      </div>

      <div className="legal-footer-links">
        <a
          href="/about-us"
          target="_blank"
          rel="noopener noreferrer"
        >
          About Us
        </a>

        <span className="legal-footer-dot">·</span>

        <a
          href="/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Policy
        </a>

        <span className="legal-footer-dot">·</span>

        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
        >
          Terms &amp; Conditions
        </a>
      </div>
    </div>
  );
}
