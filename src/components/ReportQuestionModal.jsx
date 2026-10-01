import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { REPORT_REASONS, hasReported, reportQuestion } from '../lib/questionReports';
import { playTapSound } from '../lib/sounds';
import useLockBodyScroll from '../lib/useLockBodyScroll';
import './ReportQuestion.css';

// "Report a problem with this question" sheet, opened from the quiz.
export default function ReportQuestionModal({ mainSubject, question, onClose }) {
  const { user } = useAuth();
  useLockBodyScroll();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [state, setState] = useState('loading'); // loading | form | sending | sent | already | error
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    hasReported(user.uid, mainSubject, question)
      .then((yes) => { if (!cancelled) setState(yes ? 'already' : 'form'); })
      .catch(() => { if (!cancelled) setState('form'); });
    return () => { cancelled = true; };
  }, [user.uid, mainSubject, question]);

  function close() { playTapSound(); onClose(); }

  async function submit() {
    playTapSound();
    setState('sending');
    try {
      const r = await reportQuestion(user.uid, mainSubject, question, reason, note);
      setState(r === 'already' ? 'already' : 'sent');
    } catch (e) {
      setErr(e.message || String(e));
      setState('error');
    }
  }

  return (
    <div className="rq-overlay" onClick={close}>
      <div className="glass rq-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Report a problem with this question">
        <button className="rq-close" onClick={close} aria-label="Close">✕</button>
        <h3 className="rq-title">🚩 Report this question</h3>

        {state === 'loading' && <p className="rq-muted">Checking…</p>}

        {(state === 'form' || state === 'sending' || state === 'error') && (
          <>
            <p className="rq-q">{question.q}</p>
            <div className="rq-reasons">
              {REPORT_REASONS.map((r) => (
                <button key={r.value} className={`rq-chip${reason === r.value ? ' on' : ''}`} onClick={() => { playTapSound(); setReason(r.value); }}>
                  {r.label}
                </button>
              ))}
            </div>
            <textarea className="rq-note" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="What's wrong? (optional - e.g. the correct answer should be B)" />
            <div className="rq-count">{note.length}/300</div>
            {state === 'error' && <div className="rq-error">Couldn&apos;t send: {err}</div>}
            <button className="btn-glow rq-send" disabled={!reason || state === 'sending'} onClick={submit}>
              {state === 'sending' ? 'Sending…' : 'Send report'}
            </button>
          </>
        )}

        {state === 'sent' && (
          <>
            <p className="rq-ok">Thanks! Your report was sent to the admins.</p>
            <button className="btn-ghost rq-send" onClick={close}>Close</button>
          </>
        )}
        {state === 'already' && (
          <>
            <p className="rq-muted">You&apos;ve already reported this question. Thanks - the admins will take a look.</p>
            <button className="btn-ghost rq-send" onClick={close}>Close</button>
          </>
        )}
      </div>
    </div>
  );
}
