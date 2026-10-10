import { useMemo, useState } from 'react';
import { playTapSound } from '../lib/sounds';
import { haptic } from '../lib/haptics';
import ScreenHeader from './ScreenHeader';
import { Highlight } from './QuestionListCard';
import EmptyIllustration from './EmptyIllustration';
import './WrongFlagged.css';
import QImage from './QImage';

const PER_GROUP = 20; // rows shown per subject before "Show all"
const LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

// One result: collapsed it shows the question + correct answer; tap to see
// every option. A match hidden inside a wrong option opens the row itself.
function SearchRow({ q, term }) {
  const [open, setOpen] = useState(false);
  const answer = q.o[q.c];
  const has = (x) => typeof x === 'string' && x.toLowerCase().includes(term.toLowerCase());
  const shownHit = has(q.q) || has(answer);
  const hiddenHit = q.o.some((o, i) => i !== q.c && has(o));
  const expanded = open || (!shownHit && hiddenHit);

  return (
    <article className="wf-row">
      <button type="button" className="wf-row-head" aria-expanded={expanded} onClick={() => setOpen((v) => !v)}>
        <span className="wf-row-main">
          <span className="wf-q"><Highlight text={q.q} term={term} /></span>
          {answer !== undefined && (
            <span className="wf-ans">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              <span><Highlight text={String(answer)} term={term} /></span>
            </span>
          )}
          <span className="wf-meta">{q.s}</span>
        </span>
        <svg className="wf-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <div className="wf-detail" data-open={expanded ? '1' : '0'}>
        <div className="wf-detail-in">
          <QImage srcs={q.img} />
          <div className="wf-opts">
            {q.o.map((opt, i) => (
              <div key={i} className={i === q.c ? 'wf-opt ok' : 'wf-opt'}>
                <span className="wf-opt-l">{LABELS[i]}</span>
                <span className="wf-opt-t"><Highlight text={String(opt)} term={term} /></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

// scopedQuestions/subjectGroup/mainSubjectMeta all come from the
// already-loaded active-semester data - search is purely client-side
// filtering, no extra reads needed. Results are grouped subject-wise.
export default function SearchScreen({ scopedQuestions, subjectGroup, mainSubjectMeta, onPracticeSet, onBack }) {
  const [term, setTerm] = useState('');
  const [subject, setSubject] = useState('all');
  const [expanded, setExpanded] = useState(() => new Set());

  const t = term.trim();
  const ready = t.length >= 2;

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
    haptic(12);
    onPracticeSet(visibleGroups.flatMap((g) => g.items));
  }

  const total = scopedQuestions.length;

  return (
    <div className="std-screen wf-screen">
      <ScreenHeader onBack={onBack} title="Search Questions">
        {total > 0 && `${total.toLocaleString()} questions this semester`}
      </ScreenHeader>

      <div className="wf-search">
        <svg className="wf-search-ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input
          type="search"
          className="wf-search-input"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search a term, e.g. cardiac output"
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          aria-label="Search questions"
          autoFocus
        />
        {term && (
          <button type="button" className="wf-search-clear" onClick={() => { playTapSound(); setTerm(''); }} aria-label="Clear search">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
      </div>

      {!ready && (
        <div className="wf-empty">
          <EmptyIllustration kind="search" />
          <div className="wf-empty-t">{t.length === 1 ? 'Keep typing' : 'Find any question'}</div>
          <div className="wf-empty-s">
            {t.length === 1
              ? 'Type at least 2 characters.'
              : 'Matches the question, its topic and every option, then groups results by subject.'}
          </div>
        </div>
      )}

      {ready && matches.length === 0 && (
        <div className="wf-empty">
          <EmptyIllustration kind="search" />
          <div className="wf-empty-t">No matches</div>
          <div className="wf-empty-s">Nothing in this semester matches “{t}”.</div>
          <button type="button" className="wf-empty-btn" onClick={() => setTerm('')}>Clear search</button>
        </div>
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
                  {g.name} <b>{g.items.length}</b>
                </button>
              ))}
            </div>
          )}

          <div className="wf-result-note">
            {matches.length} {matches.length === 1 ? 'result' : 'results'} for “{t}”
          </div>

          <div className="wf-groups" key={`${t}:${active}`}>
            {visibleGroups.map((g) => {
              const all = expanded.has(g.name) || active !== 'all';
              const shown = all ? g.items : g.items.slice(0, PER_GROUP);
              return (
                <section key={g.name} className="wf-group">
                  {visibleGroups.length > 1 && (
                    <h2 className="wf-label">{mainSubjectMeta[g.name]?.emoji} {g.name}<span>{g.items.length}</span></h2>
                  )}
                  <div className="wf-list">
                    {shown.map((q, i) => (
                      <div key={`${q.s}-${i}`} className="wf-item"><div className="wf-item-in"><SearchRow q={q} term={t} /></div></div>
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
