import { useEffect, useMemo, useState } from 'react';
import { subscribeToAllActivationCodes, getSubscriptionConfig, fmtDate, SEMESTER_LABELS } from '../lib/subscription';
import { buildInvoicePdf } from '../lib/dataExport';
import { playTapSound } from '../lib/sounds';
import './AdminTheme.css';
import './PremiumScreen.css'; // shared .pay-upi-copy button style

// Admin "Invoices" tab: look a student up by the invoice number printed
// on their invoice. Every paid payment and every admin grant is listed;
// the search also matches name, email, phone and transaction ID.
function money(label) {
  const t = String(label || '').trim();
  return /^\d+(\.\d+)?$/.test(t) ? `₹${t}` : t;
}

export default function AdminInvoicesScreen() {
  const [codes, setCodes] = useState(null);
  const [config, setConfig] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    getSubscriptionConfig().then(setConfig).catch(() => {});
    return subscribeToAllActivationCodes(setCodes);
  }, []);

  const invoices = useMemo(
    () => (codes || []).filter((c) => c.invoiceNo && (c.utr || c.grantedByAdmin) && !c.grantedFree),
    [codes]
  );

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!q) return invoices.slice(0, 20);
    return invoices.filter((c) => [c.invoiceNo, c.studentName, c.studentEmail, c.phone, c.utr, c.bankingName]
      .some((v) => String(v || '').toLowerCase().includes(q)));
  }, [invoices, q]);

  const priceFor = (sem) => money((config?.priceLabelsBySemester || {})[sem] || config?.priceLabel || '');

  async function handleDownload(c) {
    playTapSound();
    setBusy(c.invoiceNo);
    setError(null);
    try {
      const byAdmin = !!c.grantedByAdmin;
      const doc = await buildInvoicePdf({
        request: {
          utr: byAdmin ? `ADM${c.usedAt?.toMillis?.() || 0}` : c.utr,
          grantedByAdmin: byAdmin,
          amount: c.amount, yearSemester: c.yearSemester, durationDays: c.durationDays,
          bankingName: c.bankingName, phone: c.phone, invoiceNo: c.invoiceNo,
          reviewedAt: c.paidAt, createdAt: c.paidAt,
          displayName: c.studentName, email: c.studentEmail,
        },
        user: { uid: c.uid, displayName: c.studentName, email: c.studentEmail },
        profile: null,
        fallbackAmount: priceFor(c.yearSemester),
      });
      doc.save(`med101-invoice-${c.invoiceNo}.pdf`);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  function copyNo(no) {
    playTapSound();
    navigator.clipboard?.writeText(no).then(() => { setCopied(no); setTimeout(() => setCopied(null), 1600); });
  }

  return (
    <div className="std-screen">
      <div className="std-header"><h1 className="std-title">🧾 Invoices</h1></div>
      <p style={{ color: 'var(--text3)', fontSize: 13.5, marginTop: -8, marginBottom: 14 }}>
        Search by invoice number to see which student it belongs to.
      </p>

      <input
        className="auth-input"
        type="search"
        autoFocus
        placeholder="Invoice number, e.g. MED-20261005-678901"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ fontFamily: 'var(--font-mono)' }}
      />
      <div style={{ color: 'var(--text3)', fontSize: 12, margin: '8px 2px 14px' }}>
        {codes === null ? 'Loading…' : q ? `${shown.length} match${shown.length === 1 ? '' : 'es'} of ${invoices.length} invoices` : `Latest ${shown.length} of ${invoices.length} invoices - type to search`}
      </div>
      {error && <div className="auth-msg error" style={{ display: 'block', marginBottom: 10 }}>{error}</div>}

      {codes !== null && shown.length === 0 && (
        <div className="glass std-card" style={{ textAlign: 'center', color: 'var(--text3)' }}>
          {q ? `No invoice matches “${query}”.` : 'No invoices yet.'}
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {shown.map((c) => {
          const byAdmin = !!c.grantedByAdmin;
          const revoked = c.requestStatus === 'revoked';
          const tag = byAdmin ? 'Given by admin' : revoked ? 'Paid · access ended' : 'Paid';
          const tone = byAdmin ? 'var(--cyan)' : revoked ? 'var(--red)' : 'var(--green)';
          const when = c.paidAt ? fmtDate(c.paidAt) : '-';
          const rows = [
            ['Student', c.studentName],
            ['Email', c.studentEmail],
            ...(c.phone ? [['Phone', c.phone]] : []),
            ['Semester', SEMESTER_LABELS[c.yearSemester] || 'All semesters'],
            ['Amount', byAdmin ? `${priceFor(c.yearSemester) || '-'} (plan price)` : money(c.amount) || priceFor(c.yearSemester) || '-'],
            ...(byAdmin ? [] : [['UTR', c.utr], ...(c.bankingName ? [['Paid as', c.bankingName]] : [])]),
            [byAdmin ? 'Activated' : 'Verified', when],
          ];
          return (
            <div key={c.code} className="glass std-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>{c.invoiceNo}</div>
                <span style={{ fontSize: 11.5, fontWeight: 800, padding: '3px 10px', borderRadius: 999, color: tone, background: `color-mix(in srgb, ${tone} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${tone} 45%, transparent)` }}>{tag}</span>
              </div>
              <dl style={{ margin: '12px 0 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 13 }}>
                {rows.map(([k, v]) => (
                  <div key={k} style={{ display: 'contents' }}>
                    <dt style={{ color: 'var(--text3)' }}>{k}</dt>
                    <dd style={{ margin: 0, color: 'var(--text)', wordBreak: 'break-word', fontFamily: k === 'UTR' ? 'var(--font-mono)' : undefined }}>{v}</dd>
                  </div>
                ))}
              </dl>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button type="button" className="pay-upi-copy" onClick={() => copyNo(c.invoiceNo)}>{copied === c.invoiceNo ? '✓ Copied' : 'Copy number'}</button>
                <button type="button" className="pay-upi-copy" onClick={() => handleDownload(c)} disabled={busy === c.invoiceNo}>{busy === c.invoiceNo ? 'Preparing…' : '⬇ Invoice PDF'}</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
