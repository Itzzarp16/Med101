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

export default function WrongFlaggedScreen({ onPracticeSet, onBack, mainSubjectMeta = {} }) {
  const { user } = useAuth();
  const reveal = useReveal();
  const [tab, setTab] = useState('wrong');
  const [subject, setSubject] = useState('all');
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

  // Subject-wise grouping: most-missed subject first.
  const groups = useMemo(() => {
    const m = new Map();
    for (const it of list) {
      const k = it.mainSubject || 'Other';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(it);
    }
    return [...m.entries()]
      .map(([name, items]) => ({ name, items }))
      .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  }, [list]);

  // If the chosen subject empties out (last question removed), go back to All.
  useEffect(() => {
    if (subject !== 'all' && !groups.some((g) => g.name === subject)) setSubject('all');
  }, [groups, subject]);

  const visibleGroups = subject === 'all' ? groups : groups.filter((g) => g.name === subject);
  const visibleItems = visibleGroups.flatMap((g) => g.items).filter((it) => !leaving.has(it.id));

  const metaFor = (name) => mainSubjectMeta[name] || {};
  const accentFor = (name) => metaFor(name).accent || 'var(--cyan)';
  const emojiFor = (name) => metaFor(name).emoji || '📘';

  function pickTab(next) {
    if (next === tab) return;
    playTapSound();
    haptic(8);
    setTab(next);
    setSubject('all');
  }

  function pickSubject(name) {
    if (name === subject) return;
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

  let cardIndex = 0;

  return (
    <div className="std-screen wf-screen">
      <ScreenHeader onBack={onBack} title={<>📌 Wrong &amp; Flagged</>}>
        Questions you've missed or starred for extra review.
      </ScreenHeader>

      <div className="wf-seg" role="tablist" aria-label="Wrong or flagged" data-tab={tab}>
        <span className="wf-seg-thumb" aria-hidden="true" />
        <button type="button" role="tab" aria-selected={tab === 'wrong'} className="wf-seg-btn" onClick={() => pickTab('wrong')}>
          <span aria-hidden="true">❌</span> Wrong <b>{wrong.length}</b>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'flagged'} className="wf-seg-btn" onClick={() => pickTab('flagged')}>
          <span aria-hidden="true">⭐</span> Flagged <b>{flagged.length}</b>
        </button>
      </div>

      {loading ? (
        <div className="wf-skels" aria-busy="true" aria-label="Loading">
          {[0, 1, 2].map((i) => <div key={i} className="wf-skel" style={{ '--i': i }} />)}
        </div>
      ) : list.length === 0 ? (
        <div className="wf-empty">
          <div className="wf-empty-ico">{tab === 'wrong' ? '✅' : '🔖'}</div>
          <div className="wf-empty-t">{tab === 'wrong' ? 'Nothing missed yet' : 'No flagged questions'}</div>
          <div className="wf-empty-s">{tab === 'wrong' ? "Questions you get wrong will show up here for review." : 'Star a question during a quiz to save it here.'}</div>
        </div>
      ) : (
        <>
          <div className="wf-chips" role="group" aria-label="Filter by subject">
            <button type="button" className="wf-chip" aria-pressed={subject === 'all'} onClick={() => pickSubject('all')}>
              All <b>{list.length}</b>
            </button>
            {groups.map((g) => (
              <button
                key={g.name}
                type="button"
                className="wf-chip"
                aria-pressed={subject === g.name}
                style={{ '--acc': accentFor(g.name) }}
                onClick={() => pickSubject(g.name)}
              >
                <span aria-hidden="true">{emojiFor(g.name)}</span> {g.name} <b>{g.items.length}</b>
              </button>
            ))}
          </div>

          {/* key = tab + subject, so switching view replays the entrance */}
          <div className="wf-groups" key={`${tab}:${subject}`}>
            {visibleGroups.map((g) => (
              <section key={g.name} className="wf-group" style={{ '--acc': accentFor(g.name) }}>
                <header className="wf-sec wf-reveal" ref={reveal}>
                  <span className="wf-sec-ico" aria-hidden="true">{emojiFor(g.name)}</span>
                  <div className="wf-sec-text">
                    <h2 className="wf-sec-name">{g.name}</h2>
                    <span className="wf-sec-count">{g.items.length} {g.items.length === 1 ? 'question' : 'questions'}</span>
                  </div>
                  {visibleGroups.length > 1 && (
                    <button type="button" className="wf-sec-btn" onClick={() => practice(g.items.filter((it) => !leaving.has(it.id)))}>
                      Practice
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                    </button>
                  )}
                </header>

                {g.items.map((item) => {
                  const idx = cardIndex++;
                  return (
                    <div
                      key={item.id}
                      className="wf-item wf-reveal"
                      ref={reveal}
                      data-leaving={leaving.has(item.id) ? '1' : undefined}
                      style={{ '--d': idx < 5 ? `${idx * 55}ms` : '0ms' }}
                    >
                      <div className="wf-item-in">
                        <ReviewCard
                          item={item}
                          kind={tab}
                          onRemove={() => handleRemove(item)}
                          removeLabel={tab === 'wrong' ? 'Remove from wrong questions' : 'Unflag this question'}
                        />
                      </div>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>

          <div className="wf-bar">
            <button type="button" className="wf-cta" onClick={() => practice(visibleItems)} disabled={!visibleItems.length}>
              <span className="wf-cta-label">{subject === 'all' ? 'Practice all' : `Practice ${subject}`}</span>
              <span className="wf-cta-count">{visibleItems.length}</span>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
