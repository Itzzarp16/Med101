import { useMemo, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { filterUnseen } from '../lib/seenQuestions';
import { playTapSound } from '../lib/sounds';
import './QuizModeScreen.css';

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const TIMER_PRESETS = [20, 30, 45, 60];

// Matches the old site's #screen-home exactly: this is the ONLY screen
// between the subject dashboard and the quiz itself — there's no
// separate topic-list step in the old design. A hero banner shows the
// subject + live question/topic counts, then mode cards (Random 25/50,
// All Sequential/Random, Custom Range), then multi-select topic chips
// (picking any chip switches mode to "topic" and filters the pool to
// just those topics), then Auto-advance/Timer settings.
export default function QuizModeScreen({ pool, subjectMeta, subjectName, emoji, onStart, onBack }) {
  const { profile } = useAuth();
  const [mode, setMode] = useState('rand25');
  const [selectedTopics, setSelectedTopics] = useState(() => new Set());
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(Math.min(50, pool.length));
  const [customShuffle, setCustomShuffle] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [timerOn, setTimerOn] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(20);

  const unseenPool = useMemo(
    () => filterUnseen(pool, subjectName, profile?.seenQuestions),
    [pool, subjectName, profile]
  );

  const topics = useMemo(() => {
    const set = new Set();
    pool.forEach((q) => set.add(q.s));
    return [...set];
  }, [pool]);

  function selectMode(m) {
    playTapSound();
    setMode(m);
  }

  function toggleTopicChip(name) {
    playTapSound();
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      if (next.size > 0) setMode('topic');
      return next;
    });
  }

  function handleStart() {
    playTapSound();
    let quizQ;
    if (mode === 'unseen') {
      quizQ = shuffled(unseenPool);
    } else if (mode === 'topic' && selectedTopics.size > 0) {
      quizQ = shuffled(pool.filter((q) => selectedTopics.has(q.s)));
    } else if (mode === 'rand25') {
      quizQ = shuffled(pool).slice(0, Math.min(25, pool.length));
    } else if (mode === 'rand50') {
      quizQ = shuffled(pool).slice(0, Math.min(50, pool.length));
    } else if (mode === 'all-seq') {
      quizQ = [...pool];
    } else if (mode === 'all-rand') {
      quizQ = shuffled(pool);
    } else if (mode === 'custom') {
      const s = Math.max(1, rangeStart || 1);
      const e = Math.min(pool.length, rangeEnd || 50);
      const sliced = pool.slice(s - 1, e);
      quizQ = customShuffle ? shuffled(sliced) : sliced;
    } else {
      quizQ = shuffled(pool);
    }

    if (!quizQ.length) {
      alert('No questions found for this selection.');
      return;
    }

    onStart(quizQ, { autoAdvance, timerSeconds: timerOn ? timerSeconds : null });
  }

  return (
    <div className="screen-home">
      {/* Hero banner */}
      <div className="hero qmode-hero">
        <div className="hero-glow" />
        <div className="qmode-hero-inner">
          <div className="qmode-hero-emoji">{emoji || '🧬'}</div>
          <h1 className="qmode-hero-title">{subjectName}</h1>
          <div className="qmode-hero-pill">{emoji} {subjectName}</div>
          <p className="qmode-hero-sub">
            MCQ Quiz · <span className="qmode-hero-qcount">{pool.length} Questions</span> · {topics.length} Topics
          </p>
          <div className="qmode-hero-stats">
            <div className="qmode-hero-stat">
              <div className="qmode-hero-stat-num" style={{ color: 'var(--cyan)' }}>{pool.length}</div>
              <div className="qmode-hero-stat-label">Questions</div>
            </div>
            <div className="qmode-hero-divider" />
            <div className="qmode-hero-stat">
              <div className="qmode-hero-stat-num" style={{ color: 'var(--violet)' }}>{topics.length}</div>
              <div className="qmode-hero-stat-label">Topics</div>
            </div>
          </div>
        </div>
      </div>

      <div className="qmode-body">
        <button className="btn-ghost qmode-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

        <div className="qmode-section-label">Quiz Mode</div>
        <div className="qmode-grid">
          <ModeCard emoji="🎲" title="Random 25" desc="Quick 5-min practice" selected={mode === 'rand25'} onClick={() => selectMode('rand25')} />
          <ModeCard emoji="⚡" title="Random 50" desc="Medium 10-min session" selected={mode === 'rand50'} onClick={() => selectMode('rand50')} />
          <ModeCard emoji="📚" title={`All ${pool.length} — Sequential`} desc="Questions in order" selected={mode === 'all-seq'} onClick={() => selectMode('all-seq')} />
          <ModeCard emoji="🔀" title={`All ${pool.length} — Random`} desc="Fully shuffled" selected={mode === 'all-rand'} onClick={() => selectMode('all-rand')} />
          <ModeCard emoji="✂️" title="Custom Range" desc="Pick your start & end question numbers" selected={mode === 'custom'} onClick={() => selectMode('custom')} wide />
          <ModeCard
            emoji="🆕"
            title="Unseen Only"
            desc={`${unseenPool.length} questions you haven't tried yet`}
            selected={mode === 'unseen'}
            onClick={() => unseenPool.length > 0 && selectMode('unseen')}
            wide
            disabled={unseenPool.length === 0}
          />
        </div>

        {mode === 'custom' && (
          <div className="qmode-custom glass">
            <div className="qmode-custom-row">
              <div className="qmode-field">
                <label>From Q#</label>
                <input type="number" min={1} max={pool.length} value={rangeStart} onChange={(e) => setRangeStart(Number(e.target.value))} />
              </div>
              <div className="qmode-field">
                <label>To Q#</label>
                <input type="number" min={1} max={pool.length} value={rangeEnd} onChange={(e) => setRangeEnd(Number(e.target.value))} />
              </div>
              <div className="qmode-range-hint">(1 – {pool.length})</div>
            </div>
            <ToggleRow title="🔀 Shuffle Questions" desc="Randomise order within the range" on={customShuffle} onToggle={() => setCustomShuffle((v) => !v)} />
          </div>
        )}

        <div className="qmode-section-label">Or Pick Specific Topics</div>
        <div className="qmode-chips">
          {topics.map((name) => (
            <button
              key={name}
              className={selectedTopics.has(name) ? 'topic-chip active' : 'topic-chip'}
              onClick={() => toggleTopicChip(name)}
            >
              {subjectMeta?.[name]?.emoji ? `${subjectMeta[name].emoji} ` : ''}{name}
            </button>
          ))}
        </div>

        <div className="qmode-section-label">Settings</div>
        <div className="qmode-settings-card glass">
          <ToggleRow title="Auto-advance" desc="Move to next question after answering" on={autoAdvance} onToggle={() => setAutoAdvance((v) => !v)} />
        </div>

        <div className="qmode-settings-card glass">
          <ToggleRow title="⏱ Question Timer" desc="Auto-submit when time runs out" on={timerOn} onToggle={() => setTimerOn((v) => !v)} />
          {timerOn && (
            <div className="qmode-timer-presets">
              <div className="qmode-timer-label">Seconds per question</div>
              <div className="qmode-timer-row">
                {TIMER_PRESETS.map((s) => (
                  <button key={s} className={timerSeconds === s ? 'tpreset sel' : 'tpreset'} onClick={() => setTimerSeconds(s)}>
                    {s}s
                  </button>
                ))}
                <div className="qmode-timer-custom">
                  <span>Custom:</span>
                  <input type="number" min={5} max={300} value={timerSeconds} onChange={(e) => setTimerSeconds(Number(e.target.value))} />
                  <span>sec</span>
                </div>
              </div>
              <p className="qmode-timer-warning">⚠️ Unanswered questions when timer expires count as wrong.</p>
            </div>
          )}
        </div>

        <button className="btn-glow qmode-start-btn" onClick={handleStart}>Start Quiz →</button>
      </div>
    </div>
  );
}

function ModeCard({ emoji, title, desc, selected, onClick, wide, disabled }) {
  return (
    <button
      className={`mode-card${selected ? ' selected' : ''}${wide ? ' wide' : ''}`}
      onClick={onClick}
      disabled={disabled}
      style={disabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
    >
      <span className="mode-card-emoji">{emoji}</span>
      <span className="mode-card-body">
        <span className="mode-card-title">{title}</span>
        <span className="mode-card-desc">{desc}</span>
      </span>
    </button>
  );
}

function ToggleRow({ title, desc, on, onToggle }) {
  return (
    <div className="qmode-toggle-row">
      <div>
        <div className="qmode-toggle-title">{title}</div>
        <div className="qmode-toggle-desc">{desc}</div>
      </div>
      <div className={on ? 'toggle-track on' : 'toggle-track'} onClick={onToggle}>
        <div className="toggle-thumb" />
      </div>
    </div>
  );
}
