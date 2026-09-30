import { useMemo, useState } from 'react';
import { playTapSound } from '../lib/sounds';
import ScreenHeader from './ScreenHeader';
import QuestionListCard from './QuestionListCard';
import './ListScreens.css';

const MAX_RESULTS = 60;

// scopedQuestions/subjectGroup/mainSubjectMeta all come from the
// already-loaded active-semester data - search is purely client-side
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
      <ScreenHeader onBack={onBack} title={<>🔍 Search Questions</>}>
        Search across every subject in your current semester.
      </ScreenHeader>

      <div className="lu-search">
        <span className="lu-search-ico" aria-hidden="true">🔍</span>
        <input
          className="auth-input"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="e.g. cardiac output, glomerulus, enzyme..." aria-label="Search questions"
          autoFocus
        />
        {term && (
          <button type="button" className="lu-search-clear" onClick={() => { playTapSound(); setTerm(''); }} aria-label="Clear search">✕</button>
        )}
      </div>

      {term.trim().length >= 2 && (
        <p className="lu-note">
          {results.length}{results.length === MAX_RESULTS ? '+' : ''} match{results.length === 1 ? '' : 'es'}
          {results.length === MAX_RESULTS && ' (showing first 60 - narrow your search for more precise results)'}
        </p>
      )}

      {term.trim().length > 0 && term.trim().length < 2 && (
        <div className="glass lu-empty">Keep typing, at least 2 characters.</div>
      )}

      {results.length > 0 && (
        <>
          <div className="lu-list">
            {results.map((q, i) => {
              const mainSubject = subjectGroup[q.s];
              return (
                <QuestionListCard
                  key={i}
                  item={q}
                  term={term.trim()}
                  badges={(
                    <>
                      {mainSubject && <span className="badge">{mainSubjectMeta[mainSubject]?.emoji} {mainSubject}</span>}
                      <span className="badge badge-cyan">{q.s}</span>
                    </>
                  )}
                />
              );
            })}
          </div>
          <div className="lu-bar">
            <button className="btn-glow" onClick={handlePractice}>Practice These ({results.length}) →</button>
          </div>
        </>
      )}
    </div>
  );
}
