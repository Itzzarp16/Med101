import './LegalPage.css';

// Shared building blocks for the public pages (Privacy Policy, Terms,
// Contact, About). Simple, modern layout: a hero header, optional
// "on this page" chips, content in clean section cards, and a pill row
// linking to the sibling pages. Pure presentation - page text lives in
// each page component.

const PAGES = [
  { key: 'about', href: '/about-us', label: 'About' },
  { key: 'contact', href: '/contact', label: 'Contact' },
  { key: 'privacy', href: '/privacy-policy', label: 'Privacy' },
  { key: 'terms', href: '/terms', label: 'Terms' },
];

export function LegalPageFrame({ current, eyebrow, title, updated, lead, toc, children }) {
  return (
    <div className="lp">
      <header className="lp-hero">
        {eyebrow && <span className="lp-eyebrow">{eyebrow}</span>}
        <h1 className="lp-title">{title}</h1>
        {updated && (
          <span className="lp-pill"><i aria-hidden="true" />Last updated: {updated}</span>
        )}
        {lead && <p className="lp-lead">{lead}</p>}
      </header>

      {toc && (
        <nav className="lp-toc" aria-label="On this page">
          {toc.map((s, i) => (
            <a key={s.id} href={`#${s.id}`}><b>{i + 1}</b>{s.title}</a>
          ))}
        </nav>
      )}

      <main className="lp-body">{children}</main>

      <nav className="lp-more" aria-label="More about Med101">
        {PAGES.map((p) => (
          <a
            key={p.key}
            href={p.href}
            className={p.key === current ? 'is-current' : undefined}
            aria-current={p.key === current ? 'page' : undefined}
          >
            {p.label}
          </a>
        ))}
      </nav>
      <p className="lp-foot">© 2026 Med101 · Learn. Practice. Improve.</p>
    </div>
  );
}

// Numbered section card. `toc` is the page's section list and `i` this
// section's index in it, so the chips and the headings can't drift apart.
export function Section({ toc, i, children }) {
  const { id, title } = toc[i];
  return (
    <section className="lp-sec" id={id}>
      <h2 className="lp-h2"><span className="lp-num">{i + 1}</span>{title}</h2>
      {children}
    </section>
  );
}

// Un-numbered card (About page blocks).
export function Block({ title, children, className = '' }) {
  return (
    <section className={`lp-sec ${className}`}>
      {title && <h2 className="lp-h2 lp-h2--plain">{title}</h2>}
      {children}
    </section>
  );
}

export function Callout({ children }) {
  return (
    <p className="lp-callout">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{children}</span>
    </p>
  );
}
