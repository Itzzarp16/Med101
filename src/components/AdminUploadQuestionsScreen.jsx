import { useState } from 'react';
import { playTapSound } from '../lib/sounds';
import { uploadQuestionPdf } from '../lib/uploadQuestions';

// Admin-only "Option 1" question upload: pick a semester + subject
// (from what's already scaffolded in the semester JSON files) plus a
// free-text subtopic name, attach a PDF in the expected format
// (numbered questions, A-D options, correct answer highlighted -
// see api/upload-questions.py for the exact spec this parser matches),
// and it goes live immediately via Firestore - no redeploy.
//
// Uploading the same subject+subtopic again overwrites that batch
// (see doc_id in the API) rather than duplicating it, so re-uploading
// a corrected PDF is safe.
export default function AdminUploadQuestionsScreen({ onBack, semesters, semesterMainSubjects, hideBack = false }) {
  const [semesterId, setSemesterId] = useState(semesters?.[0]?.id || '');
  const [mainSubject, setMainSubject] = useState('');
  const [subtopic, setSubtopic] = useState('');
  const [emoji, setEmoji] = useState('');
  const [desc, setDesc] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const subjectOptions = semesterMainSubjects?.[semesterId] || [];

  async function handleUpload() {
    playTapSound();
    setError(null);
    setResult(null);

    if (!semesterId || !mainSubject || !subtopic.trim() || !file) {
      setError('Semester, subject, subtopic name, and a PDF file are all required.');
      return;
    }

    setBusy(true);
    try {
      const data = await uploadQuestionPdf({
        semesterId,
        mainSubject,
        subtopic: subtopic.trim(),
        emoji: emoji.trim() || undefined,
        desc: desc.trim() || undefined,
        file,
      });
      setResult(data);
    } catch (e) {
      setError(e.message || 'Upload failed.');
      if (e.incompleteQuestionNumbers?.length) {
        setResult({ incompleteQuestionNumbers: e.incompleteQuestionNumbers });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="std-screen">
      {!hideBack && (
        <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>
      )}

      <div className="std-header">
        <h1 className="std-title">📤 Upload Questions</h1>
        <p className="std-sub">
          Upload a PDF in the standard format (numbered questions, A-D options, correct
          answer highlighted). It goes live immediately, no redeploy needed.
        </p>
      </div>

      <div className="glass std-card">
        <label className="auth-label">Semester</label>
        <select
          className="auth-input"
          value={semesterId}
          onChange={(e) => { setSemesterId(e.target.value); setMainSubject(''); }}
        >
          {(semesters || []).map((s) => (
            <option key={s.id} value={s.id}>{s.label || s.id}</option>
          ))}
        </select>

        <label className="auth-label">Subject</label>
        <select className="auth-input" value={mainSubject} onChange={(e) => setMainSubject(e.target.value)}>
          <option value="">Select a subject…</option>
          {subjectOptions.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        <label className="auth-label">Subtopic name</label>
        <input
          className="auth-input"
          type="text"
          placeholder="e.g. Spinal Cord"
          value={subtopic}
          onChange={(e) => setSubtopic(e.target.value)}
        />

        <label className="auth-label">Emoji (optional)</label>
        <input
          className="auth-input"
          type="text"
          placeholder="📖"
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
        />

        <label className="auth-label">Short description (optional)</label>
        <input
          className="auth-input"
          type="text"
          placeholder="e.g. Spinal cord anatomy and segments"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />

        <label className="auth-label">PDF file</label>
        <input
          className="auth-input"
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />

        <button className="btn-glow std-save-btn" onClick={handleUpload} disabled={busy}>
          {busy ? 'Uploading…' : 'Upload'}
        </button>

        {error && <div className="auth-msg error" style={{ display: 'block' }}>{error}</div>}

        {result?.success && (
          <div className="auth-msg success" style={{ display: 'block' }}>
            Saved {result.savedCount} question{result.savedCount === 1 ? '' : 's'}.
            {result.skippedCount > 0 && (
              <> {result.skippedCount} question{result.skippedCount === 1 ? '' : 's'} had no
              detectable highlighted answer and were skipped (#{result.incompleteQuestionNumbers?.join(', ')}).</>
            )}
          </div>
        )}

        {!result?.success && result?.incompleteQuestionNumbers?.length > 0 && (
          <div className="auth-msg error" style={{ display: 'block' }}>
            Questions found but none had a detectable highlighted answer
            (#{result.incompleteQuestionNumbers.join(', ')}) - nothing was saved.
          </div>
        )}
      </div>
    </div>
  );
}
