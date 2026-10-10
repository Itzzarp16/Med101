import { useMemo, useState } from 'react';
import { playTapSound } from '../lib/sounds';
import { haptic } from '../lib/haptics';
import ScreenHeader from './ScreenHeader';
import EmptyIllustration from './EmptyIllustration';
import './WrongFlagged.css';
import './AnswerKey.css';

const PAGE = 40; // rows shown before "Show more"
const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// One row: number + question + the correct answer. Tap to see every option.
function KeyRow({ n, q }) {
  const [open, setOpen] = useState(false);
  const answer = q.o[q.c];
  return (
    <article className="wf-row">
      <button type="button" className="wf-row-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="ak-num">{n}</span>
        <span className="wf-row-main">
          <span className="wf-q">{q.q}</span>
          {answer !== undefined && (
            <span className="wf-ans">
              <span className="ak-letter">{LABELS[q.c]}</span>
              <span>{String(answer)}</span>
            </span>
          )}
        </span>
        <svg className="wf-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <div className="wf-detail" data-open={open ? '1' : '0'}>
        <div className="wf-detail-in">
          <div className="wf-opts">
            {q.o.map((opt, i) => (
              <div key={i} className={i === q.c ? 'wf-opt ok' : 'wf-opt'}>
                <span className="wf-opt-l">{LABELS[i]}</span>
                <span className="wf-opt-t">{String(opt)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

// Browse the active semester's questions with the correct answer shown:
// pick a subject, optionally narrow to one topic. Purely client-side on the
// already-loaded semester data (same inputs as SearchScreen), no extra reads.
export default function AnswerKeyScreen({ scopedQuestions, subjectGroup, mainSubjectMeta, onBack }) {
  // Subjects that actually have questions, in their original order.
  const subjects = useMemo(() => {
    const counts = new Map();
    for (const q of scopedQuestions) {
      const g = subjectGroup[q.s] || 'Other';
      counts.set(g, (counts.get(g) || 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }, [scopedQuestions, subjectGroup]);

  const [subject, setSubject] = useState(null);
  const [topic, setTopic] = useState('all');
  const [shown, setShown] = useState(PAGE);

  const activeSubject = subjects.some((s) => s.name === subject) ? subject : subjects[0]?.name;

  const inSubject = useMemo(
    () => scopedQuestions.filter((q) => (subjectGroup[q.s] || 'Other') === activeSubject),
    [scopedQuestions, subjectGroup, activeSubject],
  );

  const topics = useMemo(() => {
    const counts = new Map();
    for (const q of inSubject) counts.set(q.s, (counts.get(q.s) || 0) + 1);
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }, [inSubject]);

  const activeTopic = topic === 'all' || topics.some((t) => t.name === topic) ? topic : 'all';
  const list = activeTopic === 'all' ? inSubject : inSubject.filter((q) => q.s === activeTopic);
  const visible = list.slice(0, shown);

  function pickSubject(name) {
    if (name === activeSubject) return;
    playTapSound();
    haptic(8);
    setSubject(name);
    setTopic('all');
    setShown(PAGE);
  }

  function pickTopic(name) {
    if (name === activeTopic) return;
    playTapSound();
    haptic(8);
    setTopic(name);
    setShown(PAGE);
  }

  function showMore() {
    playTapSound();
    setShown((n) => n + PAGE);
  }

  if (subjects.length === 0) {
    return (
      <div className="std-screen wf-screen">
        <ScreenHeader onBack={onBack} title="Answerkey" />
        <div className="wf-empty">
          <EmptyIllustration kind="search" />
          <div className="wf-empty-t">No questions yet</div>
          <div className="wf-empty-s">Questions for this semester haven’t been added yet.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="std-screen wf-screen">
      <ScreenHeader onBack={onBack} title="Answerkey">
        {scopedQuestions.length.toLocaleString()} questions with correct answers
      </ScreenHeader>

      <div className="wf-chips" role="group" aria-label="Choose subject">
        {subjects.map((s) => (
          <button key={s.name} type="button" className="wf-chip" aria-pressed={activeSubject === s.name} onClick={() => pickSubject(s.name)}>
            {mainSubjectMeta[s.name]?.emoji} {s.name} <b>{s.count}</b>
          </button>
        ))}
      </div>

      {topics.length > 1 && (
        <div className="wf-chips ak-topics" role="group" aria-label="Choose topic">
          <button type="button" className="wf-chip" aria-pressed={activeTopic === 'all'} onClick={() => pickTopic('all')}>
            All topics <b>{inSubject.length}</b>
          </button>
          {topics.map((t) => (
            <button key={t.name} type="button" className="wf-chip" aria-pressed={activeTopic === t.name} onClick={() => pickTopic(t.name)}>
              {t.name} <b>{t.count}</b>
            </button>
          ))}
        </div>
      )}

      <div className="wf-result-note">
        {list.length} {list.length === 1 ? 'question' : 'questions'} · tap a question to see all options
      </div>

      <section className="wf-group" key={`${activeSubject}:${activeTopic}`}>
        <div className="wf-list">
          {visible.map((q, i) => (
            <div key={`${q.s}-${i}`} className="wf-item"><div className="wf-item-in"><KeyRow n={i + 1} q={q} /></div></div>
          ))}
        </div>
        {visible.length < list.length && (
          <button type="button" className="wf-empty-btn" onClick={showMore}>
            Show more ({list.length - visible.length} left)
          </button>
        )}
      </section>
    </div>
  );
}
