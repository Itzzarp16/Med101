import { useMemo, useState } from 'react';
import { playTapSound } from '../lib/sounds';

const MAX_RESULTS = 60;

function highlight(text, term) {
  if (!term) return text;
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(24,232,255,0.25)', color: 'var(--cyan)', borderRadius: 3, padding: '0 2px' }}>
        {text.slice(idx, idx + term.length)}
      </mark>
      {text.slice(idx + term.length)}
    </>
  );
}

// scopedQuestions/subjectGroup/mainSubjectMeta all come from the
// already-loaded active-semester data — search is purely client-side
// filtering, no extra reads needed.
export default function SearchScreen({ scopedQuestions, subjectGroup, mainSubjectMeta, onPracticeSet, onBack }) {
  const [term, setTerm] = useState('');

  const results = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (t.length < 2) return [];
    return scopedQuestions
      .filter((q) => {
        if (q.q.toLowerCase().includes(t)) return true;
        if (q.s.toLowerCase().includes(t)) return true;
        return q.o.some((opt) => opt.toLowerCase().includes(t));
      })
      .slice(0, MAX_RESULTS);
  }, [term, scopedQuestions]);

  function handlePractice() {
    playTapSound();
    onPracticeSet(results);
  }

  return (
    <div className="std-screen">
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="std-header">
        <h1 className="std-title">🔍 Search Questions</h1>
        <p className="std-sub">Search across every subject in your current semester.</p>
      </div>

      <div className="glass std-card">
        <input
          className="auth-input"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="e.g. cardiac output, glomerulus, enzyme..."
          autoFocus
        />
        {term.trim().length >= 2 && (
          <p className="std-note">
            {results.length}{results.length === MAX_RESULTS ? '+' : ''} match{results.length === 1 ? '' : 'es'}
            {results.length === MAX_RESULTS && ' (showing first 60 — narrow your search for more precise results)'}
          </p>
        )}
      </div>

      {term.trim().length > 0 && term.trim().length < 2 && (
        <div className="glass std-card" style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          Keep typing — at least 2 characters.
        </div>
      )}

      {results.length > 0 && (
        <>
          <button className="btn-glow std-save-btn" onClick={handlePractice} style={{ marginTop: 14, marginBottom: 14 }}>
            Practice These ({results.length}) →
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {results.map((q, i) => {
              const mainSubject = subjectGroup[q.s];
              return (
                <div key={i} className="glass" style={{ padding: 14 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                    {mainSubject && (
                      <span className="badge" style={{ background: 'var(--g1)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
                        {mainSubjectMeta[mainSubject]?.emoji} {mainSubject}
                      </span>
                    )}
                    <span className="badge badge-cyan">{q.s}</span>
                  </div>
                  <p style={{ fontSize: 13.5, color: 'var(--text)', margin: '0 0 8px' }}>{highlight(q.q, term.trim())}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {q.o.map((opt, oi) => (
                      <span
                        key={oi}
                        style={{
                          fontSize: 12,
                          padding: '5px 10px',
                          borderRadius: 8,
                          background: oi === q.c ? 'rgba(48,242,138,0.12)' : 'var(--g1)',
                          color: oi === q.c ? 'var(--green)' : 'var(--text3)',
                        }}
                      >
                        {highlight(opt, term.trim())}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
