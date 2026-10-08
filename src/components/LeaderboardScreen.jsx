import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { subscribeToFriendsLeaderboard, subscribeToLeaderboardTop, fetchMyRank } from '../lib/leaderboard';
import { subscribeToFriends } from '../lib/friends';
import { playTapSound } from '../lib/sounds';
import ScreenHeader from './ScreenHeader';
import './LeaderboardScreen.css';
import LoadingLine from './LoadingLine';

const PODIUM_ORDER = [1, 0, 2]; // display order: 2nd, 1st, 3rd

// Counts up from 0 to `to` once per value change (skipped for reduced motion).
function CountUp({ to, suffix = '' }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const target = Number(to) || 0;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setN(target); return; }
    let raf; const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / 900);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n}{suffix}</>;
}

function Avatar({ row, className = '' }) {
  const name = (row.displayName || '').trim() || 'Student';
  return (
    <div
      className={`lb-avatar ${className}`}
      style={row.photoURL ? { backgroundImage: `url(${row.photoURL})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    >
      {!row.photoURL && name.charAt(0).toUpperCase()}
    </div>
  );
}

// Modern redesign: sliding segmented controls, an animated top-3 podium,
// and ranked rows with animated accuracy bars. Data logic is unchanged.
export default function LeaderboardScreen({ semesterId, mainSubjectMeta, onBack, startFriendsOnly = false }) {
  const { user } = useAuth();
  const [scope, setScope] = useState(''); // '' = global, or a subject name
  const [metric, setMetric] = useState('accuracyPct');
  const [friendsOnly, setFriendsOnly] = useState(startFriendsOnly);
  const [friendUids, setFriendUids] = useState([]);
  const [rows, setRows] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const scopeKey = scope || (semesterId ? `sem:${semesterId}` : '');
  const unit = metric === 'accuracyPct' ? '%' : ' correct';

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToFriends(user.uid, (friends) => {
      setFriendUids(friends.map((f) => f.uid));
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    if (friendsOnly) {
      const uids = user ? [user.uid, ...friendUids] : friendUids;
      const unsub = subscribeToFriendsLeaderboard(uids, scopeKey, metric, (result) => {
        if (result && result.error) {
          setError(result.error);
          setRows([]);
        } else {
          setRows(result || []);
        }
        setMyRank(null); // rank-among-friends is just their position in this short list, no separate call needed
        setLoading(false);
      });
      return unsub;
    }

    let cancelled = false;
    const unsub = subscribeToLeaderboardTop(scopeKey, metric, 40, (topResult) => {
      if (cancelled) return;
      if (topResult && topResult.error) {
        setError(topResult.error);
        setRows([]);
      } else {
        setRows(topResult || []);
      }
      setLoading(false);

      // fetchMyRank can't be made live (count-aggregation queries have
      // no onSnapshot equivalent) - re-run it every time the top list
      // itself updates, so it stays reasonably fresh anyway.
      if (user) {
        fetchMyRank(user.uid, scopeKey, metric).then((r) => { if (!cancelled) setMyRank(r); });
      } else {
        setMyRank(null);
      }
    });

    return () => { cancelled = true; unsub(); };
  }, [scopeKey, metric, user, friendsOnly, friendUids]);

  function switchMetric(m) {
    playTapSound();
    setMetric(m);
  }

  const noteText = friendsOnly && friendUids.length === 0
    ? "You haven't added any friends yet — add some from the hamburger menu."
    : (metric === 'accuracyPct' && !friendsOnly ? 'Requires 100+ questions answered in this scope' : null);

  const podium = rows.length >= 3 ? rows.slice(0, 3) : [];
  const rest = rows.slice(podium.length ? 3 : 0);
  const maxVal = Math.max(1, ...rows.map((r) => Number(r.value) || 0));
  const listKey = `${friendsOnly}|${scopeKey}|${metric}`;
  const name = (r) => (r.displayName || '').trim() || 'Student';

  return (
    <div className="screen-leaderboard">
      <div className="lb-wrap">
        <ScreenHeader onBack={onBack} title={<>🏆 Leaderboard</>}>
          See how you stack up
        </ScreenHeader>

        <div className="lb-panel glass">
          <div className="lb-segment" data-i={friendsOnly ? 1 : 0}>
            <span className="lb-thumb" />
            <button className={!friendsOnly ? 'lb-segment-btn active' : 'lb-segment-btn'} onClick={() => { playTapSound(); setFriendsOnly(false); }}>🌐 Everyone</button>
            <button className={friendsOnly ? 'lb-segment-btn active' : 'lb-segment-btn'} onClick={() => { playTapSound(); setFriendsOnly(true); }}>👥 Friends</button>
          </div>

          <select className="lb-scope-select" value={scope} onChange={(e) => { playTapSound(); setScope(e.target.value); }}>
            <option value="">🌐 Global (all subjects)</option>
            {Object.keys(mainSubjectMeta || {}).map((n) => (
              <option key={n} value={n}>{mainSubjectMeta[n]?.emoji} {n}</option>
            ))}
          </select>

          <div className="lb-segment" data-i={metric === 'accuracyPct' ? 0 : 1}>
            <span className="lb-thumb" />
            <button className={metric === 'accuracyPct' ? 'lb-segment-btn active' : 'lb-segment-btn'} onClick={() => switchMetric('accuracyPct')}>🎯 Accuracy</button>
            <button className={metric === 'totalCorrect' ? 'lb-segment-btn active' : 'lb-segment-btn'} onClick={() => switchMetric('totalCorrect')}>✅ Total Correct</button>
          </div>

          {noteText && <div className="lb-note">{noteText}</div>}
        </div>

        {myRank && (
          <div className="lb-my-rank">
            <div className="lb-my-rank-rank">#{myRank.rank}</div>
            <div className="lb-my-rank-body">
              <div className="lb-my-rank-label">Your Rank</div>
              <div className="lb-my-rank-sub">out of {myRank.total} students</div>
            </div>
            <div className="lb-my-rank-value">{myRank.value}{unit}</div>
          </div>
        )}

        {!loading && !error && user && !friendsOnly && !myRank && (
          <div className="lb-unranked">
            {metric === 'accuracyPct'
              ? "You're not ranked here yet. Accuracy ranking needs 100+ answered questions in this scope."
              : "You're not on this board yet. Finish a quiz to get a score here."}
          </div>
        )}

        {loading && <LoadingLine />}

        {!loading && (error || rows.length === 0) && (
          <div className="lb-empty">
            <div className="lb-empty-emoji">{error ? '⚠️' : '🏳️'}</div>
            <div className="lb-empty-title">
              {error ? 'Something went wrong loading this list' : friendsOnly ? 'No friends to show yet' : metric === 'accuracyPct' ? 'No one qualifies yet' : 'No scores yet'}
            </div>
            <div className="lb-empty-sub">
              {error || (friendsOnly
                ? 'Add some friends by username to see them here.'
                : (metric === 'accuracyPct'
                  ? 'Nobody has answered 100+ questions here yet. Keep practicing!'
                  : 'Be the first to complete a quiz here!'))}
            </div>
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div key={listKey}>
            {podium.length === 3 && (
              <div className="lb-podium">
                {PODIUM_ORDER.map((k) => {
                  const r = podium[k];
                  const isMe = user && r.uid === user.uid;
                  return (
                    <div key={r.uid} className={`lb-pod lb-pod-${k + 1}${isMe ? ' lb-pod-me' : ''}`}>
                      <div className="lb-pod-av">
                        {k === 0 && <span className="lb-crown">👑</span>}
                        <Avatar row={r} />
                      </div>
                      <div className="lb-pod-name">{name(r)}{isMe ? ' (You)' : ''}</div>
                      <div className="lb-pod-val"><CountUp to={r.value} suffix={unit === '%' ? '%' : ''} /></div>
                      <div className="lb-pod-bar"><span>{k + 1}</span></div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="lb-list">
              {rest.map((row, i) => {
                const rank = i + (podium.length ? 4 : 1);
                const isMe = user && row.uid === user.uid;
                const timeStr = row.avgTimeSec != null ? `${row.avgTimeSec.toFixed(1)}s/q` : null;
                const pct = metric === 'accuracyPct' ? Number(row.value) : (Number(row.value) / maxVal) * 100;
                return (
                  <div key={row.uid} className={`lb-row glass${isMe ? ' lb-row-me' : ''}`} style={{ '--i': i }}>
                    <div className="lb-rank-num">{rank}</div>
                    <Avatar row={row} />
                    <div className="lb-row-body">
                      <div className="lb-name">{name(row)}{isMe ? ' (You)' : ''}</div>
                      <div className="lb-row-stats"><b>{row.correct}</b> correct · <i>{row.incorrect}</i> wrong{timeStr ? ` · ${timeStr}` : ''}</div>
                      <div className="lb-track"><span style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} /></div>
                    </div>
                    <div className="lb-value">{row.value}{unit === '%' ? '%' : ''}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
