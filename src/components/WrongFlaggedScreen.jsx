import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { fetchWrongQuestions, fetchFlaggedQuestions, removeWrongQuestion, toggleFlaggedQuestion } from '../lib/reviewQueue';
import { playTapSound } from '../lib/sounds';
import { haptic } from '../lib/haptics';
import ScreenHeader from './ScreenHeader';
import ReviewCard from './ReviewCard';
import './WrongFlagged.css';

const LEAVE_MS = 280;

// Fades/slides elements in the first time they scroll into view. Each element
// is observed from its ref callback (React 19: the returned function is the
// cleanup), and the observer is created lazily so first-render items animate.
function useReveal() {
  const ioRef = useRef(null);
  const reveal = useCallback((el) => {
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('in');
      return undefined;
    }
    if (!ioRef.current) {
      ioRef.current = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              e.target.classList.add('in');
              ioRef.current?.unobserve(e.target);
            }
          }
        },
        { rootMargin: '0px 0px -6% 0px', threshold: 0.06 }
      );
    }
    const io = ioRef.current;
    io.observe(el);
    return () => io.unobserve(el);
  }, []);
  useEffect(() => () => { ioRef.current?.disconnect(); ioRef.current = null; }, []);
  return reveal;
}

export default function WrongFlaggedScreen({ onPracticeSet, onBack }) {
  const { user } = useAuth();
  const reveal = useReveal();
  const [tab, setTab] = useState('wrong');
  const [subject, setSubject] = useState('all');
  const [query, setQuery] = useState('');
  const [wrong, setWrong] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leaving, setLeaving] = useState(() => new Set());

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [w, f] = await Promise.all([fetchWrongQuestions(user.uid), fetchFlaggedQuestions(user.uid)]);
      if (!alive) return;
      setWrong(w);
      setFlagged(f);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user.uid]);

  const list = tab === 'wrong' ? wrong : flagged;
  const term = query.trim();

  // Search matches the question, its topic and every option.
  const searched = useMemo(() => {
    if (!term) return list;
    const t = term.toLowerCase();
    return list.filter((it) =>
      [it.q, it.s, ...(Array.isArray(it.o) ? it.o : [])].some((x) => typeof x === 'string' && x.toLowerCase().includes(t))
    );
  }, [list, term]);

  // Subject-wise grouping: most-missed subject first.
  const groups = useMemo(() => {
    const m = new Map();
    for (const it of searched) {
      const k = it.mainSubject || 'Other';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(it);
    }
    return [...m.entries()]
      .map(([name, items]) => ({ name, items }))
      .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  }, [searched]);

  // A chosen subject that has no (remaining / matching) questions falls back to All.
  const activeSubject = subject === 'all' || groups.some((g) => g.name === subject) ? subject : 'all';
  const visibleGroups = activeSubject === 'all' ? groups : groups.filter((g) => g.name === activeSubject);
  const visibleItems = visibleGroups.flatMap((g) => g.items).filter((it) => !leaving.has(it.id));

  function pickTab(next) {
    if (next === tab) return;
    playTapSound();
    haptic(8);
    setTab(next);
    setSubject('all');
  }

  function pickSubject(name) {
    if (name === activeSubject) return;
    playTapSound();
    haptic(8);
    setSubject(name);
  }

  function handleRemove(item) {
    playTapSound();
    setLeaving((prev) => new Set(prev).add(item.id));
    setTimeout(async () => {
      try {
        if (tab === 'wrong') {
          await removeWrongQuestion(user.uid, item.id);
          setWrong((prev) => prev.filter((x) => x.id !== item.id));
        } else {
          await toggleFlaggedQuestion(user.uid, item.mainSubject, item, true);
          setFlagged((prev) => prev.filter((x) => x.id !== item.id));
        }
      } catch {
        // Couldn't remove it: bring the card back instead of losing it.
      } finally {
        setLeaving((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    }, LEAVE_MS);
  }

  function practice(items) {
    if (!items.length) return;
    playTapSound();
    haptic(12);
    onPracticeSet(items);
  }

  let rowIndex = 0;
  const n = visibleItems.length;

  return (
    <div className="std-screen wf-screen">
      <ScreenHeader onBack={onBack} title="Wrong & Flagged" />

      <div className="wf-tabs" role="tablist" aria-label="Wrong or flagged" data-tab={tab}>
        <button type="button" role="tab" aria-selected={tab === 'wrong'} className="wf-tab" onClick={() => pickTab('wrong')}>
          Wrong <b>{wrong.length}</b>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'flagged'} className="wf-tab" onClick={() => pickTab('flagged')}>
          Flagged <b>{flagged.length}</b>
        </button>
        <span className="wf-tabs-bar" aria-hidden="true" />
      </div>

      {loading ? (
        <div className="wf-skels" aria-busy="true" aria-label="Loading">
          {[0, 1, 2, 3].map((i) => <div key={i} className="wf-skel" style={{ '--i': i }} />)}
        </div>
      ) : list.length === 0 ? (
        <div className="wf-empty">
          <div className="wf-empty-ico">{tab === 'wrong' ? '✅' : '🔖'}</div>
          <div className="wf-empty-t">{tab === 'wrong' ? 'Nothing missed yet' : 'No flagged questions'}</div>
          <div className="wf-empty-s">{tab === 'wrong' ? 'Questions you get wrong will show up here for review.' : 'Star a question during a quiz to save it here.'}</div>
        </div>
      ) : (
        <>
          <div className="wf-search">
            <svg className="wf-search-ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input
              type="search"
              className="wf-search-input"
              placeholder={`Search ${tab === 'wrong' ? 'wrong' : 'flagged'} questions`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
              aria-label="Search questions"
            />
            {query && (
              <button type="button" className="wf-search-clear" onClick={() => { playTapSound(); setQuery(''); }} aria-label="Clear search">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            )}
          </div>

          {groups.length > 1 && (
            <div className="wf-chips" role="group" aria-label="Filter by subject">
              <button type="button" className="wf-chip" aria-pressed={activeSubject === 'all'} onClick={() => pickSubject('all')}>
                All <b>{searched.length}</b>
              </button>
              {groups.map((g) => (
                <button key={g.name} type="button" className="wf-chip" aria-pressed={activeSubject === g.name} onClick={() => pickSubject(g.name)}>
                  {g.name} <b>{g.items.length}</b>
                </button>
              ))}
            </div>
          )}

          {term && searched.length > 0 && (
            <div className="wf-result-note">{searched.length} {searched.length === 1 ? 'result' : 'results'} for “{term}”</div>
          )}

          {searched.length === 0 ? (
            <div className="wf-empty">
              <div className="wf-empty-ico">🔍</div>
              <div className="wf-empty-t">No matches</div>
              <div className="wf-empty-s">Nothing in your {tab === 'wrong' ? 'wrong' : 'flagged'} questions matches “{term}”.</div>
              <button type="button" className="wf-empty-btn" onClick={() => setQuery('')}>Clear search</button>
            </div>
          ) : (
            /* key = tab + subject, so switching view replays the entrance */
            <div className="wf-groups" key={`${tab}:${activeSubject}`}>
              {visibleGroups.map((g) => (
                <section key={g.name} className="wf-group">
                  {visibleGroups.length > 1 && (
                    <h2 className="wf-label wf-reveal" ref={reveal}>{g.name}<span>{g.items.length}</span></h2>
                  )}
                  <div className="wf-list">
                    {g.items.map((item) => {
                      const idx = rowIndex++;
                      return (
                        <div
                          key={item.id}
                          className="wf-item wf-reveal"
                          ref={reveal}
                          data-leaving={leaving.has(item.id) ? '1' : undefined}
                          style={{ '--d': idx < 6 ? `${idx * 45}ms` : '0ms' }}
                        >
                          <div className="wf-item-in">
                            <ReviewCard
                              item={item}
                              kind={tab}
                              term={term}
                              onRemove={() => handleRemove(item)}
                              removeLabel={tab === 'wrong' ? 'Remove from wrong questions' : 'Unflag this question'}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}

          {searched.length > 0 && (
            <div className="wf-bar">
              <button type="button" className="wf-cta" onClick={() => practice(visibleItems)} disabled={!n}>
                <span className="wf-cta-label">
                  {activeSubject === 'all' ? `Practice ${n} ${n === 1 ? 'question' : 'questions'}` : `Practice ${n} · ${activeSubject}`}
                </span>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
