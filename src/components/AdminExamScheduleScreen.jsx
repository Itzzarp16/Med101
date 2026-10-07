import { useEffect, useState } from 'react';
import { SEMESTER_ORDER } from '../lib/academicCalendar';
import { fetchExamReveal, fetchExams, hasExamOverride, resetExams, saveExams, setExamReveal } from '../lib/examSchedule';
import { parseExamDate } from '../lib/examDates';
import { playTapSound } from '../lib/sounds';

const semLabel = (id) => `Semester ${SEMESTER_ORDER.indexOf(id) + 1}`;
const blank = () => ({ subject: '', date: '', time: '08:00-17:00', note: '' });

// Admin edits the exam dates shown on the dashboard (countdown card and
// each subject card) and used by the automatic reminders. Saving replaces
// that semester's built-in dates; "Reset" goes back to them.
export default function AdminExamScheduleScreen({ onBack, hideBack = false }) {
  const [semesterId, setSemesterId] = useState('y2s1');
  const [rows, setRows] = useState([]);
  const [custom, setCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type, text }
  const [reveal, setReveal] = useState(false);
  const [revealBusy, setRevealBusy] = useState(false);

  useEffect(() => { fetchExamReveal().then(setReveal).catch(() => {}); }, []);

  async function toggleReveal() {
    playTapSound();
    const next = !reveal;
    setRevealBusy(true); setMsg(null);
    try {
      await setExamReveal(next);
      setReveal(next);
      setMsg({ type: 'success', text: next ? 'Exam dates are now visible to students.' : 'Exam dates are hidden from students.' });
    } catch (e) {
      setMsg({ type: 'error', text: e.message || String(e) });
    } finally { setRevealBusy(false); }
  }

  function load(id) {
    setLoading(true);
    setMsg(null);
    Promise.all([fetchExams(id, { fresh: true }), hasExamOverride(id).catch(() => false)])
      .then(([list, isCustom]) => { setRows(list.map((e) => ({ ...e }))); setCustom(isCustom); })
      .catch((e) => setMsg({ type: 'error', text: e.message || String(e) }))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(semesterId); }, [semesterId]);

  const update = (i, key, val) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));
  const remove = (i) => { playTapSound(); setRows((r) => r.filter((_, idx) => idx !== i)); };

  async function handleSave() {
    playTapSound();
    const clean = rows.map((r) => ({ ...r, subject: r.subject.trim(), note: (r.note || '').trim() }));
    const bad = clean.find((r) => !r.subject || !parseExamDate(r.date));
    if (bad) { setMsg({ type: 'error', text: 'Every exam needs a subject name and a date.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const payload = clean.map((r) => {
        const out = { subject: r.subject, date: r.date };
        if (r.time) out.time = r.time;
        if (r.note) out.note = r.note;
        if (r.label) out.label = r.label;
        return out;
      });
      await saveExams(semesterId, payload);
      setMsg({ type: 'success', text: 'Saved. Students see the new dates on their next load.' });
      load(semesterId);
    } catch (e) {
      setMsg({ type: 'error', text: e.message || String(e) });
    } finally { setBusy(false); }
  }

  async function handleReset() {
    playTapSound();
    if (!window.confirm('Go back to the built-in dates for this semester? Your edits will be lost.')) return;
    setBusy(true); setMsg(null);
    try {
      await resetExams(semesterId);
      setMsg({ type: 'success', text: 'Reset to the built-in dates.' });
      load(semesterId);
    } catch (e) {
      setMsg({ type: 'error', text: e.message || String(e) });
    } finally { setBusy(false); }
  }

  return (
    <div className="std-screen">
      {!hideBack && (
        <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>
      )}
      <div className="std-header">
        <h1 className="std-title">📅 Exam Schedule</h1>
        <p className="std-sub">
          Shown as a countdown on the dashboard and on each subject card once you turn on
          "Reveal exam dates". Students in the semester also get an automatic push 7 days and 1 day before each exam.
        </p>
      </div>

      <div className="glass std-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="qmode-toggle-title">Reveal exam dates</div>
            <div className="qmode-toggle-desc">
              {reveal ? 'On: students can see the countdown and exam dates.' : 'Off: students cannot see any exam dates.'}
            </div>
          </div>
          <div
            className={reveal ? 'toggle-track on' : 'toggle-track'}
            style={revealBusy ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
            onClick={toggleReveal}
          >
            <div className="toggle-thumb" />
          </div>
        </div>
      </div>

      <div className="glass std-card" style={{ marginTop: 12 }}>
        <label className="auth-label">Semester</label>
        <select className="auth-input" value={semesterId} onChange={(e) => setSemesterId(e.target.value)}>
          {SEMESTER_ORDER.map((id) => <option key={id} value={id}>{semLabel(id)}</option>)}
        </select>
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
          {custom ? 'Using your edited dates.' : 'Using the built-in dates.'}
        </div>
      </div>

      {loading ? <div className="std-loading">Loading…</div> : (
        <>
          {rows.length === 0 && <div style={{ margin: '14px 4px', opacity: 0.7 }}>No exams set for this semester.</div>}
          {rows.map((r, i) => (
            <div className="glass std-card" style={{ marginTop: 12 }} key={i}>
              <label className="auth-label" style={{ marginTop: 0 }}>Subject (same name as its dashboard card)</label>
              <input className="auth-input" value={r.subject} onChange={(e) => update(i, 'subject', e.target.value)} />
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <div style={{ flex: 1 }}>
                  <label className="auth-label">Date</label>
                  <input className="auth-input" type="date" value={r.date} onChange={(e) => update(i, 'date', e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="auth-label">Time</label>
                  <input className="auth-input" value={r.time || ''} onChange={(e) => update(i, 'time', e.target.value)} />
                </div>
              </div>
              <label className="auth-label" style={{ marginTop: 10 }}>Note (optional, e.g. GM2 only)</label>
              <input className="auth-input" value={r.note || ''} onChange={(e) => update(i, 'note', e.target.value)} />
              <button className="btn-ghost" style={{ marginTop: 10 }} onClick={() => remove(i)}>Remove</button>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn-ghost" onClick={() => { playTapSound(); setRows((r) => [...r, blank()]); }}>+ Add exam</button>
            {custom && <button className="btn-ghost" disabled={busy} onClick={handleReset}>Reset to built-in</button>}
          </div>
          <button className="btn-glow std-save-btn" style={{ marginTop: 14 }} disabled={busy} onClick={handleSave}>
            {busy ? 'Saving…' : 'Save exam schedule'}
          </button>
          {msg && <div className={`auth-msg ${msg.type}`} style={{ display: 'block', marginTop: 12 }}>{msg.text}</div>}
        </>
      )}
    </div>
  );
}
