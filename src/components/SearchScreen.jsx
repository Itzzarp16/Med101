import { useMemo, useState } from 'react';
import { playTapSound } from '../lib/sounds';
import { haptic } from '../lib/haptics';
import ScreenHeader from './ScreenHeader';
import QuestionListCard from './QuestionListCard';
import './ListScreens.css';
import './WrongFlagged.css';

const PER_GROUP = 20; // questions shown per subject before "Show more"

// scopedQuestions/subjectGroup/mainSubjectMeta all come from the
// already-loaded active-semester data - search is purely client-side
// filtering, no extra reads needed. Results are grouped subject-wise.
export default function SearchScreen({ scopedQuestions, subjectGroup, mainSubjectMeta, onPracticeSet, onBack }) {
  const [term, setTerm] = useState('');
  const [subject, setSubject] = useState('all');
  const [expanded, setExpanded] = useState(() => new Set());

  const t = term.trim();
  const ready = t.length >= 2;

  // Every match, no global cap - the cap is per subject below.
  const matches = useMemo(() => {
    if (!ready) return [];
    const needle = t.toLowerCase();
    return scopedQuestions.filter((q) => (
      q.q.toLowerCase().includes(needle) ||
      q.s.toLowerCase().includes(needle) ||
      q.o.some((opt) => opt.toLowerCase().includes(needle))
    ));
  }, [t, ready, scopedQuestions]);

  // Subject-wise grouping: subject with the most matches first.
  const groups = useMemo(() => {
    const m = new Map();
    for (const q of matches) {
      const k = subjectGroup[q.s] || 'Other';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(q);
    }
    return [...m.entries()]
      .map(([name, items]) => ({ name, items }))
      .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  }, [matches, subjectGroup]);

  // A chosen subject with no matches for the new term falls back to All.
  const active = subject === 'all' || groups.some((g) => g.name === subject) ? subject : 'all';
  const visibleGroups = active === 'all' ? groups : groups.filter((g) => g.name === active);
  const visibleCount = visibleGroups.reduce((n, g) => n + g.items.length, 0);

  function pickSubject(name) {
    if (name === active) return;
    playTapSound();
    haptic(8);
    setSubject(name);
  }

  function showMore(name) {
    playTapSound();
    setExpanded((prev) => new Set(prev).add(name));
  }

  function handlePractice() {
    playTapSound();
    onPracticeSet(visibleGroups.flatMap((g) => g.items));
  }

  return (
    <div className="std-screen wf-screen">
      <ScreenHeader onBack={onBack} title={<>🔍 Search Questions</>}>
        Search your current semester, grouped by subject.
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

      {t.length > 0 && !ready && (
        <div className="glass lu-empty">Keep typing, at least 2 characters.</div>
      )}

      {ready && matches.length === 0 && (
        <div className="glass lu-empty">No matches for “{t}”.</div>
      )}

      {matches.length > 0 && (
        <>
          {groups.length > 1 && (
            <div className="wf-chips" role="group" aria-label="Filter by subject">
              <button type="button" className="wf-chip" aria-pressed={active === 'all'} onClick={() => pickSubject('all')}>
                All <b>{matches.length}</b>
              </button>
              {groups.map((g) => (
                <button key={g.name} type="button" className="wf-chip" aria-pressed={active === g.name} onClick={() => pickSubject(g.name)}>
                  {mainSubjectMeta[g.name]?.emoji} {g.name} <b>{g.items.length}</b>
                </button>
              ))}
            </div>
          )}

          <div className="wf-result-note">
            {matches.length} {matches.length === 1 ? 'match' : 'matches'} in {groups.length} {groups.length === 1 ? 'subject' : 'subjects'}
          </div>

          <div className="wf-groups" key={`${t}:${active}`}>
            {visibleGroups.map((g) => {
              const open = expanded.has(g.name) || active !== 'all';
              const shown = open ? g.items : g.items.slice(0, PER_GROUP);
              return (
                <section key={g.name} className="wf-group">
                  <h2 className="wf-label">
                    {mainSubjectMeta[g.name]?.emoji} {g.name}<span>{g.items.length}</span>
                  </h2>
                  <div className="lu-list">
                    {shown.map((q, i) => (
                      <QuestionListCard
                        key={`${q.s}-${i}`}
                        item={q}
                        term={t}
                        badges={<span className="badge badge-cyan">{q.s}</span>}
                      />
                    ))}
                  </div>
                  {shown.length < g.items.length && (
                    <button type="button" className="wf-empty-btn" onClick={() => showMore(g.name)}>
                      Show all {g.items.length} in {g.name}
                    </button>
                  )}
                </section>
              );
            })}
          </div>

          <div className="wf-bar">
            <button type="button" className="wf-cta" onClick={handlePractice} disabled={!visibleCount}>
              <span className="wf-cta-label">
                {active === 'all' ? `Practice ${visibleCount} ${visibleCount === 1 ? 'question' : 'questions'}` : `Practice ${visibleCount} · ${active}`}
              </span>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
