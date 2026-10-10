import { useState } from 'react';
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

export default function AdminAnswerKeysScreen() {
  const [semesterId, setSemesterId] = useState('y2s1');
  const [subject, setSubject] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  async function handleUpload(event) {
    event.preventDefault();
    setError('');
    setSuccess(null);
    if (!subject.trim() || !file) {
      setError('Enter the subject and choose a PDF file.');
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
        body: JSON.stringify({ uploadType: 'answerKey', semesterId, subject: subject.trim(), uploadId, chunkCount: chunks.length }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Upload failed.');
      setSuccess(data);
      setSubject('');
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
          Choose a semester and subject. The PDF is committed to that semester’s GitHub folder,
          then appears on the student Answer Key page after Vercel deploys the new commit.
          No Firebase Storage is used.
        </p>
      </div>
      <form className="glass std-card" onSubmit={handleUpload}>
        <label className="auth-label" htmlFor="answer-key-semester">Semester</label>
        <select id="answer-key-semester" className="auth-input" value={semesterId} onChange={(e) => setSemesterId(e.target.value)}>
          {SEMESTERS.map((semester) => <option key={semester.id} value={semester.id}>{semester.label}</option>)}
        </select>

        <label className="auth-label" htmlFor="answer-key-subject">Subject</label>
        <input id="answer-key-subject" className="auth-input" type="text" maxLength={120}
          placeholder="e.g. Physiology 2" value={subject} onChange={(e) => setSubject(e.target.value)} />

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
        </div>}
      </form>
    </div>
  );
}
