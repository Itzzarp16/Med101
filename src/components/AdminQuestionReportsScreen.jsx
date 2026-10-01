import { useEffect, useState } from 'react';
import { auth } from '../lib/firebase';
import { fetchOpenReportGroups, reasonLabel, resolveReports } from '../lib/questionReports';
import { playTapSound } from '../lib/sounds';
import './ReportQuestion.css';

const LABELS = 'ABCDEFGH';

// Questions students have reported, most-reported first. "Fix" the question
// itself where you keep your question files / the upload screen, then mark
// the reports fixed here (or dismiss them if the question was fine).
export default function AdminQuestionReportsScreen({ onBack, hideBack = false }) {
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState(null);

  function load() {
    setError('');
    fetchOpenReportGroups().then(setGroups).catch((e) => { setError(e.message || String(e)); setGroups([]); });
  }
  useEffect(() => { load(); }, []);

  async function resolve(group, status) {
    playTapSound();
    setBusyKey(group.key);
    try {
      await resolveReports(group.reports.map((r) => r.id), status, auth.currentUser?.email);
      setGroups((g) => g.filter((x) => x.key !== group.key));
    } catch (e) {
      setError(e.message || String(e));
    } finally { setBusyKey(null); }
  }

  return (
    <div className="std-screen">
      {!hideBack && (
        <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>
      )}
      <div className="std-header">
        <h1 className="std-title">🚩 Question Reports</h1>
        <p className="std-sub">Questions students flagged as wrong or unclear. The ✅ shows the answer currently marked correct.</p>
      </div>
      <button className="btn-ghost" onClick={() => { playTapSound(); setGroups(null); load(); }}>↻ Refresh</button>
      {error && <div className="auth-msg error" style={{ display: 'block', marginTop: 12 }}>{error}</div>}
      {groups === null && <div className="std-loading">Loading…</div>}
      {groups && groups.length === 0 && !error && <div style={{ margin: '16px 4px', opacity: 0.7 }}>No open reports. 🎉</div>}

      {groups && groups.map((g) => {
        const reasonCounts = {};
        g.reports.forEach((r) => { reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1; });
        const notes = g.reports.filter((r) => r.note).slice(0, 5);
        return (
          <div className="glass std-card rpt-group" key={g.key}>
            <div className="rpt-head">
              <span className="rpt-sub">{g.mainSubject}{g.s ? ` · ${g.s}` : ''}</span>
              <span className="rpt-count">{g.reports.length} report{g.reports.length === 1 ? '' : 's'}</span>
            </div>
            <p className="rpt-q">{g.q}</p>
            {(g.o || []).map((opt, i) => (
              <div key={i} className={i === g.c ? 'rpt-opt correct' : 'rpt-opt'}>
                {LABELS[i]}. {opt}{i === g.c ? ' ✅' : ''}
              </div>
            ))}
            <div className="rpt-reasons">
              {Object.entries(reasonCounts).map(([k, n]) => <span className="rpt-reason" key={k}>{reasonLabel(k)} ×{n}</span>)}
            </div>
            {notes.map((r) => <div className="rpt-note" key={r.id}>“{r.note}”</div>)}
            <div className="rpt-actions">
              <button className="btn-glow" disabled={busyKey === g.key} onClick={() => resolve(g, 'fixed')}>Mark fixed</button>
              <button className="btn-ghost" disabled={busyKey === g.key} onClick={() => resolve(g, 'dismissed')}>Dismiss</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
