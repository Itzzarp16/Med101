import { useState } from 'react';
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

// pool = the exact question set already scoped to whatever the student
// picked in TopicPicker (one topic or "All Topics"). This screen only
// decides HOW MANY of those and in WHAT ORDER, plus quiz-taking settings
// — logic ported 1:1 from the old site's startQuiz().
export default function QuizModeScreen({ pool, label, onStart, onBack }) {
  const [mode, setMode] = useState('rand25');
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(Math.min(50, pool.length));
  const [customShuffle, setCustomShuffle] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [timerOn, setTimerOn] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(20);

  function selectMode(m) {
    playTapSound();
    setMode(m);
  }

  function handleStart() {
    playTapSound();
    let quizQ;
    if (mode === 'rand25') quizQ = shuffled(pool).slice(0, Math.min(25, pool.length));
    else if (mode === 'rand50') quizQ = shuffled(pool).slice(0, Math.min(50, pool.length));
    else if (mode === 'all-seq') quizQ = [...pool];
    else if (mode === 'all-rand') quizQ = shuffled(pool);
    else if (mode === 'custom') {
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
    <div className="qmode-screen">
      <button className="qmode-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="qmode-header">
        <h1 className="qmode-title">{label}</h1>
        <p className="qmode-sub">{pool.length} questions available</p>
      </div>

      <div className="qmode-section-label">Quiz Mode</div>
      <div className="qmode-grid">
        <ModeCard emoji="🎲" title="Random 25" desc="Quick 5-min practice" selected={mode === 'rand25'} onClick={() => selectMode('rand25')} />
        <ModeCard emoji="⚡" title="Random 50" desc="Medium 10-min session" selected={mode === 'rand50'} onClick={() => selectMode('rand50')} />
        <ModeCard emoji="📚" title={`All ${pool.length} — Sequential`} desc="Questions in order" selected={mode === 'all-seq'} onClick={() => selectMode('all-seq')} />
        <ModeCard emoji="🔀" title={`All ${pool.length} — Random`} desc="Fully shuffled" selected={mode === 'all-rand'} onClick={() => selectMode('all-rand')} />
        <ModeCard emoji="✂️" title="Custom Range" desc="Pick your start & end question numbers" selected={mode === 'custom'} onClick={() => selectMode('custom')} wide />
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
          <ToggleRow
            title="🔀 Shuffle Questions"
            desc="Randomise order within the range"
            on={customShuffle}
            onToggle={() => setCustomShuffle((v) => !v)}
          />
        </div>
      )}

      <div className="qmode-section-label">Settings</div>
      <div className="qmode-settings-card glass">
        <ToggleRow
          title="Auto-advance"
          desc="Move to next question after answering"
          on={autoAdvance}
          onToggle={() => setAutoAdvance((v) => !v)}
        />
      </div>

      <div className="qmode-settings-card glass">
        <ToggleRow
          title="⏱ Question Timer"
          desc="Auto-submit when time runs out"
          on={timerOn}
          onToggle={() => setTimerOn((v) => !v)}
        />
        {timerOn && (
          <div className="qmode-timer-presets">
            <div className="qmode-timer-label">Seconds per question</div>
            <div className="qmode-timer-row">
              {TIMER_PRESETS.map((s) => (
                <button
                  key={s}
                  className={timerSeconds === s ? 'qmode-tpreset sel' : 'qmode-tpreset'}
                  onClick={() => setTimerSeconds(s)}
                >
                  {s}s
                </button>
              ))}
              <div className="qmode-timer-custom">
                <span>Custom:</span>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={timerSeconds}
                  onChange={(e) => setTimerSeconds(Number(e.target.value))}
                />
                <span>sec</span>
              </div>
            </div>
            <p className="qmode-timer-warning">⚠️ Unanswered questions when timer expires count as wrong.</p>
          </div>
        )}
      </div>

      <button className="qmode-start-btn" onClick={handleStart}>Start Quiz →</button>
    </div>
  );
}

function ModeCard({ emoji, title, desc, selected, onClick, wide }) {
  return (
    <button className={`qmode-card${selected ? ' selected' : ''}${wide ? ' wide' : ''}`} onClick={onClick}>
      <span className="qmode-card-emoji">{emoji}</span>
      <span className="qmode-card-body">
        <span className="qmode-card-title">{title}</span>
        <span className="qmode-card-desc">{desc}</span>
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
      <button className={on ? 'qmode-toggle on' : 'qmode-toggle'} onClick={onToggle}>
        <span className="qmode-toggle-thumb" />
      </button>
    </div>
  );
}
