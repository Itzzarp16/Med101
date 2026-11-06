import { useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';
import { doc, deleteDoc, setDoc } from 'firebase/firestore';

const SEMESTERS = [
  { id: 'y1s1', label: 'Semester 1' },
  { id: 'y1s2', label: 'Semester 2' },
  { id: 'y2s1', label: 'Semester 3' },
  { id: 'y2s2', label: 'Semester 4' },
  { id: 'y3s1', label: 'Semester 5' },
  { id: 'y3s2', label: 'Semester 6' },
];
const CHUNK_SIZE = 700_000;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read the PDF file.'));
    reader.readAsDataURL(file);
  });
}

export default function AdminAnswerKeysScreen({ semesters = [], semesterMainSubjects = {} }) {
  const [semesterId, setSemesterId] = useState('y1s2');
  const [subject, setSubject] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const subjectOptions = semesterMainSubjects?.[semesterId] || [];
  const hasDashboardSubjects = subjectOptions.length > 0;
  const selectedSubject = hasDashboardSubjects ? (subject === '__custom__' ? customSubject.trim() : subject) : customSubject.trim();
  const semesterOptions = [
    { id: 'y1s1', label: 'Semester 1' },
    { id: 'y1s2', label: 'Semester 2' },
    { id: 'y2s1', label: 'Semester 3' },
    { id: 'y2s2', label: 'Semester 4' },
    { id: 'y3s1', label: 'Semester 5' },
    { id: 'y3s2', label: 'Semester 6' },
  ];
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  // Push to students about the new key. The key only appears in the app once Vercel has
  // redeployed, so the button unlocks after a short wait (and can only be used once per upload).
  const [notifyWait, setNotifyWait] = useState(0);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifySent, setNotifySent] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState(null); // { type: 'ok' | 'err', text }
  useEffect(() => {
    if (notifyWait <= 0) return undefined;
    const t = setTimeout(() => setNotifyWait((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [notifyWait]);

  async function handleNotify() {
    if (!success?.semesterId || notifyBusy || notifyWait > 0 || notifySent) return;
    const label = SEMESTERS.find((s) => s.id === success.semesterId)?.label || success.semesterId;
    if (!window.confirm(`Send a push notification to ${label} students about the new ${success.subject} answer key?`)) return;
    setNotifyBusy(true);
    setNotifyMsg(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/send-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          action: 'send',
          title: '📄 New answer key',
          body: `${success.subject} answer key is updated. Tap to open it.`,
          screen: 'answer-key',
          audience: { type: 'semesters', semesters: [success.semesterId] },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setNotifySent(true);
      setNotifyMsg({
        type: 'ok',
        text: data.sent
          ? `Sent to ${data.sent} device${data.sent === 1 ? '' : 's'}.`
          : 'Nobody in this semester has notifications turned on yet, so nothing was sent.',
      });
    } catch (e) {
      setNotifyMsg({ type: 'err', text: e.message || String(e) });
    } finally {
      setNotifyBusy(false);
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    setError('');
    setSuccess(null);
    setNotifyMsg(null);
    setNotifySent(false);
    setNotifyWait(0);
    if (!selectedSubject || !file) {
      setError('Select a dashboard subject (or enter a subject name if none is listed) and choose a PDF file.');
      return;
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a PDF file.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('The PDF must be 15 MB or smaller.');
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      setError('Please sign in to the admin portal again.');
      return;
    }

    setBusy(true);
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let base64;
    try {
      base64 = await fileToBase64(file);
    } catch (e) {
      setError(e.message || 'Could not read the PDF.');
      setBusy(false);
      return;
    }
    const chunks = [];
    for (let i = 0; i < base64.length; i += CHUNK_SIZE) chunks.push(base64.slice(i, i + CHUNK_SIZE));
    const refs = chunks.map((_, index) => doc(db, 'pdfUploadChunks', `${uploadId}_${index}`));
    try {
      await Promise.all(chunks.map((data, index) =>
        setDoc(refs[index], { uploadId, index, data })
      ));
      const idToken = await user.getIdToken();
      const response = await fetch('/api/upload-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ uploadType: 'answerKey', semesterId, subject: selectedSubject, uploadId, chunkCount: chunks.length }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Upload failed.');
      setSuccess({ ...data, semesterId });
      setNotifyWait(90);
      setSubject('');
      setCustomSubject('');
      setFile(null);
      const input = document.getElementById('answer-key-pdf-file');
      if (input) input.value = '';
    } catch (e) {
      setError(e.message || 'Could not publish the PDF.');
    } finally {
      await Promise.all(refs.map((ref) => deleteDoc(ref).catch(() => {})));
      setBusy(false);
    }
  }

  return (
    <div className="std-screen">
      <div className="std-header">
        <h1 className="std-title">📄 Upload Answer-Key PDF</h1>
        <p className="std-sub">
          All six semesters are available. Subjects listed on the student dashboard appear in the dropdown; if a semester has no dashboard subjects, you can enter the subject name yourself. The PDF filename is generated automatically from the subject, and the file is committed to that semester’s GitHub folder,
          then appears on the student Answer Key page after Vercel deploys the new commit.
          No Firebase Storage is used.
        </p>
      </div>
      <form className="glass std-card" onSubmit={handleUpload}>
        <label className="auth-label" htmlFor="answer-key-semester">Semester</label>
        <select id="answer-key-semester" className="auth-input" value={semesterId} onChange={(e) => { setSemesterId(e.target.value); setSubject(''); setCustomSubject(''); }}>
          {semesterOptions.map((semester) => <option key={semester.id} value={semester.id}>{semester.label}</option>)}
        </select>

        <label className="auth-label" htmlFor="answer-key-subject">Subject</label>
        {hasDashboardSubjects ? (
          <>
            <select id="answer-key-subject" className="auth-input" value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">Select a dashboard subject…</option>
              {subjectOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              <option value="__custom__">Other — enter subject name</option>
            </select>
            {subject === '__custom__' && (
              <input className="auth-input" type="text" maxLength={120} placeholder="Enter subject name"
                value={customSubject} onChange={(e) => setCustomSubject(e.target.value)} />
            )}
          </>
        ) : (
          <input id="answer-key-subject" className="auth-input" type="text" maxLength={120}
            placeholder="No dashboard subjects available — enter subject name"
            value={customSubject} onChange={(e) => setCustomSubject(e.target.value)} />
        )}

        <label className="auth-label" htmlFor="answer-key-pdf-file">PDF file (max 15 MB)</label>
        <input id="answer-key-pdf-file" className="auth-input" type="file" accept="application/pdf,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)} />

        <button className="btn-glow std-save-btn" type="submit" disabled={busy}>
          {busy ? 'Publishing to GitHub…' : 'Publish PDF'}
        </button>
        {error && <div className="auth-msg error" role="alert" style={{ display: 'block' }}>{error}</div>}
        {success && <div className="auth-msg success" role="status" style={{ display: 'block' }}>
          <strong>{success.subject} saved.</strong> {success.message}
          <div style={{ marginTop: 8 }}><a href={success.path} target="_blank" rel="noreferrer">Open PDF after deployment</a></div>
          <div style={{ marginTop: 14 }}>
            <button type="button" className="btn-ghost" onClick={handleNotify} disabled={notifyBusy || notifyWait > 0 || notifySent}>
              {notifySent ? '✅ Students notified'
                : notifyBusy ? 'Sending…'
                : notifyWait > 0 ? `🔔 Notify students (unlocks in ${notifyWait}s)`
                : `🔔 Notify ${SEMESTERS.find((s) => s.id === success.semesterId)?.label || ''} students`}
            </button>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
              The key goes live once the site redeploys (about a minute), so this unlocks after a short wait.
              Students with notifications on get a push that opens the Answer Key page.
            </div>
            {notifyMsg && <div className={`auth-msg ${notifyMsg.type === 'ok' ? 'success' : 'error'}`} style={{ display: 'block', marginTop: 8 }}>{notifyMsg.text}</div>}
          </div>
        </div>}
      </form>
    </div>
  );
}
