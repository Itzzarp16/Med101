import { useEffect, useState } from 'react';
import {
  createQuestion, deleteQuestion, fetchFirestoreQuestions, fetchMigratedSubjects,
  migrateSubjectToFirestore, swapOrder, updateQuestion,
} from '../lib/questionsService';
import './AdminQuestionsScreen.css';

const EMPTY_FORM = { s: '', q: '', o: ['', '', '', ''], c: 0 };

export default function AdminQuestionsScreen({ semesterId, mainSubjectMeta, subjectGroup, jsonQuestions, onBack }) {
  const [migrated, setMigrated] = useState(new Set());
  const [checkingMigration, setCheckingMigration] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState(null);

  const subjectNames = Object.keys(mainSubjectMeta);

  useEffect(() => {
    let cancelled = false;
    fetchMigratedSubjects(semesterId, subjectNames).then((set) => {
      if (!cancelled) {
        setMigrated(set);
        setCheckingMigration(false);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semesterId]);

  if (selectedSubject) {
    return (
      <SubjectEditor
        semesterId={semesterId}
        mainSubject={selectedSubject}
        isMigrated={migrated.has(selectedSubject)}
        jsonQuestions={jsonQuestions.filter((q) => subjectGroup[q.s] === selectedSubject)}
        onMigrated={() => setMigrated((prev) => new Set(prev).add(selectedSubject))}
        onBack={() => setSelectedSubject(null)}
      />
    );
  }

  return (
    <div className="admin-q-screen">
      <button className="admin-q-back" onClick={onBack}>← Back</button>

      <div className="admin-q-header">
        <h1 className="admin-q-title">Manage Questions</h1>
        <p className="admin-q-sub">Pick a subject to edit, add, delete, or reorder its questions.</p>
      </div>

      <div className="admin-q-subject-list">
        {subjectNames.map((name) => {
          const count = jsonQuestions.filter((q) => subjectGroup[q.s] === name).length;
          const isMigrated = migrated.has(name);
          return (
            <button key={name} className="admin-q-subject-row glass" onClick={() => setSelectedSubject(name)}>
              <span className="admin-q-subject-emoji">{mainSubjectMeta[name]?.emoji || '📖'}</span>
              <span className="admin-q-subject-body">
                <span className="admin-q-subject-name">{name}</span>
                <span className="admin-q-subject-count">{count} questions</span>
              </span>
              <span className={isMigrated ? 'admin-q-badge admin-q-badge-live' : 'admin-q-badge'}>
                {checkingMigration ? '…' : isMigrated ? 'Live' : 'Static'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SubjectEditor({ semesterId, mainSubject, isMigrated, jsonQuestions, onMigrated, onBack }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(isMigrated);
  const [loadError, setLoadError] = useState(null);
  const [migrating, setMigrating] = useState(false);
  const [editingId, setEditingId] = useState(null); // 'new' or a doc id
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!isMigrated) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchFirestoreQuestions(semesterId, mainSubject)
      .then((qs) => {
        if (!cancelled) {
          setQuestions(qs);
          setLoading(false);
        }
      })
      .catch((e) => {
        // Most likely cause: this query (two equality filters + an
        // orderBy on a third field) needs a Firestore composite index
        // that hasn't been created yet. Firestore's own error message
        // for that case includes a direct "create it here" link - we
        // surface the raw message so that link is visible, instead of
        // silently hanging on "Loading..." forever like before.
        if (!cancelled) {
          console.error('Failed to load questions:', e);
          setLoadError(e?.message || String(e));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [isMigrated, semesterId, mainSubject]);

  async function handleMigrate() {
    setMigrating(true);
    try {
      await migrateSubjectToFirestore(semesterId, mainSubject, jsonQuestions);
      const qs = await fetchFirestoreQuestions(semesterId, mainSubject);
      setQuestions(qs);
      onMigrated();
    } catch (e) {
      alert('Migration failed: ' + (e.message || e));
    } finally {
      setMigrating(false);
    }
  }

  function startEdit(question) {
    setEditingId(question.id);
    setForm({ s: question.subtopic, q: question.q, o: [...question.o], c: question.c });
  }

  function startNew() {
    setEditingId('new');
    setForm({ ...EMPTY_FORM, s: questions[0]?.subtopic || '' });
  }

  async function handleSaveForm() {
    if (!form.q.trim() || form.o.some((o) => !o.trim())) {
      alert('Please fill in the question and all options.');
      return;
    }
    try {
      if (editingId === 'new') {
        const maxOrder = questions.length ? Math.max(...questions.map((q) => q.order)) : 0;
        await createQuestion(semesterId, mainSubject, form.s, form, maxOrder + 1);
      } else {
        await updateQuestion(editingId, { subtopic: form.s, q: form.q, o: form.o, c: form.c });
      }
      const qs = await fetchFirestoreQuestions(semesterId, mainSubject);
      setQuestions(qs);
      setEditingId(null);
    } catch (e) {
      alert('Save failed: ' + (e.message || e));
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this question? This cannot be undone.')) return;
    try {
      await deleteQuestion(id);
      setQuestions((qs) => qs.filter((q) => q.id !== id));
    } catch (e) {
      alert('Delete failed: ' + (e.message || e));
    }
  }

  async function handleMove(index, dir) {
    const otherIndex = index + dir;
    if (otherIndex < 0 || otherIndex >= questions.length) return;
    const a = questions[index];
    const b = questions[otherIndex];
    try {
      await swapOrder(a, b);
      const next = [...questions];
      next[index] = { ...b, order: a.order };
      next[otherIndex] = { ...a, order: b.order };
      setQuestions(next);
    } catch (e) {
      alert('Reorder failed: ' + (e.message || e));
    }
  }

  if (!isMigrated) {
    return (
      <div className="admin-q-screen">
        <button className="admin-q-back" onClick={onBack}>← Back</button>
        <div className="admin-q-migrate-card glass-hi">
          <h2>{mainSubject}</h2>
          <p>
            This subject's {jsonQuestions.length} questions are still in the static file.
            Migrate them to Firestore to edit, add, delete, or reorder questions from here,
            without a code deploy.
          </p>
          <button className="admin-q-migrate-btn" onClick={handleMigrate} disabled={migrating}>
            {migrating ? 'Migrating…' : `Migrate ${jsonQuestions.length} Questions`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-q-screen">
      <button className="admin-q-back" onClick={onBack}>← Back</button>

      <div className="admin-q-header">
        <h1 className="admin-q-title">{mainSubject}</h1>
        <p className="admin-q-sub">{questions.length} questions · live in Firestore</p>
      </div>

      <button className="admin-q-add-btn" onClick={startNew}>+ Add Question</button>

      {editingId && (
        <QuestionForm
          form={form}
          setForm={setForm}
          onSave={handleSaveForm}
          onCancel={() => setEditingId(null)}
          isNew={editingId === 'new'}
        />
      )}

      {loading ? (
        <div className="admin-q-loading">Loading…</div>
      ) : loadError ? (
        <div className="admin-q-error">
          <p><strong>Couldn't load questions.</strong></p>
          <p className="admin-q-error-detail">
            {(() => {
              const urlMatch = loadError.match(/https?:\/\/\S+/);
              if (!urlMatch) return loadError;
              const url = urlMatch[0];
              const before = loadError.slice(0, urlMatch.index);
              return (
                <>
                  {before}
                  <a href={url} target="_blank" rel="noopener noreferrer" className="admin-q-error-link">{url}</a>
                </>
              );
            })()}
          </p>
          {loadError.includes('index') && (
            <p className="admin-q-error-hint">
              This usually means Firestore needs a composite index for this query. Check the browser console (F12 → Console) for a direct "create index" link from Firebase, click it, and it'll build automatically in a minute or two.
            </p>
          )}
          <button className="btn-ghost" onClick={() => {
            setLoading(true);
            setLoadError(null);
            fetchFirestoreQuestions(semesterId, mainSubject)
              .then((qs) => { setQuestions(qs); setLoading(false); })
              .catch((e) => { setLoadError(e?.message || String(e)); setLoading(false); });
          }}>
            Retry
          </button>
        </div>
      ) : (
        <div className="admin-q-list">
          {questions.map((question, i) => (
            <div key={question.id} className="admin-q-item glass">
              <div className="admin-q-item-top">
                <span className="admin-q-item-subtopic">{question.subtopic}</span>
                <div className="admin-q-item-actions">
                  <button onClick={() => handleMove(i, -1)} disabled={i === 0}>↑</button>
                  <button onClick={() => handleMove(i, 1)} disabled={i === questions.length - 1}>↓</button>
                  <button onClick={() => startEdit(question)}>Edit</button>
                  <button onClick={() => handleDelete(question.id)} className="admin-q-delete">Delete</button>
                </div>
              </div>
              <p className="admin-q-item-text">{question.q}</p>
              <div className="admin-q-item-options">
                {question.o.map((opt, idx) => (
                  <span key={idx} className={idx === question.c ? 'admin-q-opt admin-q-opt-correct' : 'admin-q-opt'}>
                    {opt}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionForm({ form, setForm, onSave, onCancel, isNew }) {
  return (
    <div className="admin-q-form glass-hi">
      <h3>{isNew ? 'New Question' : 'Edit Question'}</h3>

      <label>Subtopic</label>
      <input value={form.s} onChange={(e) => setForm({ ...form, s: e.target.value })} placeholder="e.g. Cardiovascular Physiology" />

      <label>Question</label>
      <textarea value={form.q} onChange={(e) => setForm({ ...form, q: e.target.value })} rows={3} />

      <label>Options (tap the circle to mark correct)</label>
      {form.o.map((opt, i) => (
        <div key={i} className="admin-q-opt-row">
          <button
            type="button"
            className={form.c === i ? 'admin-q-opt-radio admin-q-opt-radio-active' : 'admin-q-opt-radio'}
            onClick={() => setForm({ ...form, c: i })}
          >
            {String.fromCharCode(65 + i)}
          </button>
          <input
            value={opt}
            onChange={(e) => {
              const next = [...form.o];
              next[i] = e.target.value;
              setForm({ ...form, o: next });
            }}
          />
        </div>
      ))}

      <div className="admin-q-form-actions">
        <button className="admin-q-form-cancel" onClick={onCancel}>Cancel</button>
        <button className="admin-q-form-save" onClick={onSave}>Save</button>
      </div>
    </div>
  );
}
