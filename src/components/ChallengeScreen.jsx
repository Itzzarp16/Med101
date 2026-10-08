import { useEffect, useMemo, useState, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import { createRoom, joinRoom, fetchMyRooms } from '../lib/rooms';
import { filterUnseen } from '../lib/seenQuestions';
import { playTapSound } from '../lib/sounds';
import { ModeCard, ToggleRow } from './QuizModeScreen';
import ScreenHeader from './ScreenHeader';
import LoadingLine from './LoadingLine';

const TIME_PRESETS = [5, 10, 15, 20, 30];
const TIMER_PRESETS = [20, 30, 45, 60];

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// mainSubjectMeta/scopedQuestions/subjectGroup come from the currently
// active semester - a room's question set is always drawn from
// whatever the host can currently see.
//
// The Create Room mode picker deliberately mirrors QuizModeScreen's -
// same modes (Random 25/50, All Sequential/Random, Custom Range), the
// same Unseen Only toggle (a filter layered on top of whichever mode is
// picked - not a mode of its own), same Auto-advance/Timer settings - EXCEPT picking
// specific topics, since a Challenge Room is always for one whole
// subject, not a topic subset. Whichever mode the host picks decides
// the exact frozen question set at creation time, same as a normal
// quiz; Auto-advance/Timer are stored on the room itself (not chosen
// per-participant) so every participant gets an identical experience.
export default function ChallengeScreen({ mainSubjectMeta, scopedQuestions, subjectGroup, challengeTarget, onEnterRoom, onBack }) {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState('create');
  const [subject, setSubject] = useState(Object.keys(mainSubjectMeta || {})[0] || '');
  const [mode, setMode] = useState('rand25');
  const [unseenOnly, setUnseenOnly] = useState(false);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(50);
  const [customShuffle, setCustomShuffle] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [timerOn, setTimerOn] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(20);
  const [timeLimit, setTimeLimit] = useState(10);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [myRooms, setMyRooms] = useState([]);
  const [myRoomsLoading, setMyRoomsLoading] = useState(true);

  const pool = useMemo(
    () => scopedQuestions.filter((q) => subjectGroup[q.s] === subject),
    [scopedQuestions, subjectGroup, subject]
  );
  const unseenPool = useMemo(
    () => filterUnseen(pool, subject, profile?.seenQuestions),
    [pool, subject, profile]
  );

  // Which non-custom mode was active right before Custom Range was
  // picked, so tapping the Custom Range card again collapses its panel
  // (same behaviour as the main quiz mode screen).
  const prevModeRef = useRef('rand25');

  function selectMode(m) {
    playTapSound();
    if (m === 'custom' && mode === 'custom') {
      setMode(prevModeRef.current);
      return;
    }
    if (m === 'custom') prevModeRef.current = mode;
    setMode(m);
  }

  // Unseen Only only means anything while there are unseen questions in
  // the chosen subject (switching subject can empty the pool).
  const useUnseen = unseenOnly && unseenPool.length > 0;

  function toggleUnseenOnly() {
    if (unseenPool.length === 0) return;
    playTapSound();
    setUnseenOnly((v) => !v);
  }

  useEffect(() => {
    let cancelled = false;
    fetchMyRooms(user.uid).then((rooms) => {
      if (!cancelled) {
        setMyRooms(rooms);
        setMyRoomsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [user.uid]);

  async function handleCreate() {
    setError(null);
    if (pool.length === 0) {
      setError('This subject has no questions to challenge with.');
      return;
    }

    // Same rules as QuizModeScreen: Unseen Only filters whichever mode is
    // picked. Every mode draws from the unseen pool from the start (so
    // "Random 25" still means 25 where possible); Custom Range is the one
    // exception - its Q# numbers refer to positions in the FULL pool, so
    // it slices the full pool first and then drops seen questions.
    const sourcePool = useUnseen ? unseenPool : pool;

    let quizQ;
    if (mode === 'rand25') {
      quizQ = shuffled(sourcePool).slice(0, Math.min(25, sourcePool.length));
    } else if (mode === 'rand50') {
      quizQ = shuffled(sourcePool).slice(0, Math.min(50, sourcePool.length));
    } else if (mode === 'all-seq') {
      quizQ = [...sourcePool];
    } else if (mode === 'all-rand') {
      quizQ = shuffled(sourcePool);
    } else if (mode === 'custom') {
      const s = Math.max(1, rangeStart || 1);
      const e = Math.min(pool.length, rangeEnd || 50);
      let sliced = pool.slice(s - 1, e);
      if (useUnseen) sliced = filterUnseen(sliced, subject, profile?.seenQuestions);
      quizQ = customShuffle ? shuffled(sliced) : sliced;
    } else {
      quizQ = shuffled(sourcePool);
    }

    if (!quizQ.length) {
      setError('No questions found for this selection.');
      return;
    }

    setBusy(true);
    playTapSound();
    try {
      const questions = quizQ.map((q) => ({ s: q.s, q: q.q, o: q.o, c: q.c }));
      const code = await createRoom({
        hostUid: user.uid,
        hostName: user.displayName || user.email,
        mainSubject: subject,
        questions,
        timeLimitMinutes: timeLimit,
        autoAdvance,
        timerSeconds: timerOn ? timerSeconds : null,
      });
      onEnterRoom(code, true);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    setError(null);
    const code = joinCode.trim();
    if (!/^\d{8}$/.test(code)) {
      setError('Enter the full 8-digit code.');
      return;
    }
    setBusy(true);
    playTapSound();
    try {
      const room = await joinRoom(code, user.uid, user.displayName || user.email);
      if (!room) {
        setError("That code doesn't match any active room.");
        setBusy(false);
        return;
      }
      onEnterRoom(code, false);
    } catch (e) {
      setError(e.message || String(e));
      setBusy(false);
    }
  }

  async function handleRejoin(room) {
    playTapSound();
    onEnterRoom(room.roomCode, room.role === 'host');
  }

  return (
    <div className="std-screen">
      <ScreenHeader onBack={onBack} title={<>👥 Challenge a Friend</>}>
        {challengeTarget
            ? `Set up a room and @${challengeTarget.username} will be invited automatically.`
            : 'Practice the exact same questions together and compare scores.'}
      </ScreenHeader>

      {challengeTarget && (
        <div className="glass std-card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 16 }}>
          <span style={{ fontSize: 13.5 }}>🎯 Challenging</span>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>@{challengeTarget.username}</span>
        </div>
      )}

      <div className="auth-tabs auth-tabs-3" style={{ marginBottom: 16 }}>
        <button type="button" className={tab === 'create' ? 'auth-tab active' : 'auth-tab'} onClick={() => { setTab('create'); setError(null); }}>Create Room</button>
        <button type="button" className={tab === 'join' ? 'auth-tab active' : 'auth-tab'} onClick={() => { setTab('join'); setError(null); }}>Join Room</button>
        <button type="button" className={tab === 'history' ? 'auth-tab active' : 'auth-tab'} onClick={() => { setTab('history'); setError(null); }}>My Rooms</button>
      </div>

      <div key={tab} className="m-tab-in">
      {tab === 'create' && (
        <>
          <div className="glass std-card">
            <label htmlFor="challenge-subject" className="auth-label">Subject</label>
            <select id="challenge-subject" className="auth-input" value={subject} onChange={(e) => setSubject(e.target.value)}>
              {Object.keys(mainSubjectMeta || {}).map((name) => (
                <option key={name} value={name}>{mainSubjectMeta[name]?.emoji} {name}</option>
              ))}
            </select>
          </div>

          <div className="qmode-section-label">Quiz Mode</div>
          <div className="qmode-grid">
            <ModeCard emoji="🎲" title="Random 25" desc="Quick 5-min practice" selected={mode === 'rand25'} onClick={() => selectMode('rand25')} />
            <ModeCard emoji="⚡" title="Random 50" desc="Medium 10-min session" selected={mode === 'rand50'} onClick={() => selectMode('rand50')} />
            <ModeCard emoji="📚" title={`All ${pool.length}`} desc="In order" selected={mode === 'all-seq'} onClick={() => selectMode('all-seq')} />
            <ModeCard emoji="🔀" title={`All ${pool.length}`} desc="Shuffled" selected={mode === 'all-rand'} onClick={() => selectMode('all-rand')} />
            <ModeCard emoji="✂️" title="Custom Range" desc="Pick your start & end question numbers" selected={mode === 'custom'} onClick={() => selectMode('custom')} wide />
          </div>

          {mode === 'custom' && (
            <div className="qmode-custom glass">
              <div className="qmode-custom-row">
                <div className="qmode-field">
                  <label htmlFor="challenge-from-q">From Q#</label>
                  <input id="challenge-from-q" type="number" min={1} max={pool.length} value={rangeStart} onChange={(e) => setRangeStart(Number(e.target.value))} />
                </div>
                <div className="qmode-field">
                  <label htmlFor="challenge-to-q">To Q#</label>
                  <input id="challenge-to-q" type="number" min={1} max={pool.length} value={rangeEnd} onChange={(e) => setRangeEnd(Number(e.target.value))} />
                </div>
                <div className="qmode-range-hint">(1 – {pool.length})</div>
              </div>
              <ToggleRow title="🔀 Shuffle Questions" desc="Randomise order within the range" on={customShuffle} onToggle={() => setCustomShuffle((v) => !v)} />
            </div>
          )}

          <div className="qmode-settings-card glass" style={unseenPool.length === 0 ? { opacity: 0.5 } : undefined}>
            <ToggleRow
              title="🆕 Unseen Only"
              desc={
                unseenPool.length > 0
                  ? `Only questions you haven't tried (${unseenPool.length} left) - works with any mode`
                  : "You've seen every question in this subject"
              }
              on={useUnseen}
              onToggle={toggleUnseenOnly}
              disabled={unseenPool.length === 0}
            />
          </div>

          <div className="qmode-section-label">Settings</div>
          <div className="glass std-card room-limit-card">
            <label className="auth-label">Room Time Limit</label>
            <div style={{ fontSize: 12.5, color: 'var(--text3)', margin: '-4px 0 10px' }}>
              Everyone's quiz ends when this runs out.
            </div>
            <div className="room-time-row">
              {TIME_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={timeLimit === m ? 'tpreset sel' : 'tpreset'}
                  onClick={() => { playTapSound(); setTimeLimit(m); }}
                >
                  {m} min
                </button>
              ))}
            </div>
          </div>

          <div className="qmode-settings-card glass">
            <ToggleRow title="Auto-advance" desc="Move to next question after answering" on={autoAdvance} onToggle={() => setAutoAdvance((v) => !v)} />
          </div>

          <div className="qmode-settings-card glass">
            <ToggleRow title="⏱ Per-question timer (optional)" desc="Also auto-submit each question when its own timer runs out" on={timerOn} onToggle={() => setTimerOn((v) => !v)} />
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
                    <input type="number" min={5} max={300} aria-label="Custom seconds per question" value={timerSeconds} onChange={(e) => setTimerSeconds(Number(e.target.value))} />
                    <span>sec</span>
                  </div>
                </div>
                <p className="qmode-timer-warning">⚠️ Unanswered questions when timer expires count as wrong.</p>
              </div>
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            {error && <div className="auth-msg error" style={{ display: 'block' }}>{error}</div>}
            <button className="btn-glow std-save-btn" onClick={handleCreate} disabled={busy}>
              {busy ? 'Creating…' : 'Create Room →'}
            </button>
          </div>
        </>
      )}

      {tab === 'join' && (
        <div className="glass std-card">
          <label htmlFor="challenge-8-digit-room-code" className="auth-label">8-Digit Room Code</label>
          <input id="challenge-8-digit-room-code"
            className="auth-input"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="e.g. 40928371"
            inputMode="numeric"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 20, letterSpacing: '0.1em', textAlign: 'center' }}
          />

          {error && <div className="auth-msg error" style={{ display: 'block' }}>{error}</div>}

          <button className="btn-glow std-save-btn" onClick={handleJoin} disabled={busy}>
            {busy ? 'Joining…' : 'Join Room →'}
          </button>
        </div>
      )}

      {tab === 'history' && (
        myRoomsLoading ? (
          <LoadingLine />
        ) : myRooms.length === 0 ? (
          <div className="glass std-card empty-state">
            <div className="empty-state-icon">🎮</div>
            <div>No rooms yet. Create or join one to see it here.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myRooms.map((room, i) => (
              <div key={room.roomCode} className="glass stagger-in" style={{ '--stagger-i': Math.min(i, 8), padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>
                    {room.mainSubject} {room.role === 'host' && <span style={{ color: 'var(--amber)' }}>👑</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{room.roomCode}</div>
                </div>
                <button className="tpreset sel" onClick={() => handleRejoin(room)}>Rejoin →</button>
              </div>
            ))}
          </div>
        )
      )}
      </div>
    </div>
  );
}
