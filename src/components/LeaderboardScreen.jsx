import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { fetchFriendsLeaderboard, fetchLeaderboardTop, fetchMyRank } from '../lib/leaderboard';
import { subscribeToFriends } from '../lib/friends';
import { playTapSound } from '../lib/sounds';
import './LeaderboardScreen.css';

const MEDALS = ['🥇', '🥈', '🥉'];

// Matches the old site's #screen-leaderboard exactly: gradient trophy
// title, scope dropdown (Global + per-subject), metric toggle
// (Accuracy % / Total Correct), a persistent "Your Rank" card, and rows
// with medal/rank, name, ✅/❌/⏱ stats, and a gold value badge. Plus a
// "Friends Only" toggle that scopes the same view to just your added
// friends (+ yourself) instead of the whole platform.
export default function LeaderboardScreen({ semesterId, mainSubjectMeta, onBack }) {
  const { user } = useAuth();
  const [scope, setScope] = useState(''); // '' = global, or a subject name
  const [metric, setMetric] = useState('accuracyPct');
  const [friendsOnly, setFriendsOnly] = useState(false);
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
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      if (friendsOnly) {
        const uids = user ? [user.uid, ...friendUids] : friendUids;
        const result = await fetchFriendsLeaderboard(uids, scopeKey, metric);
        if (cancelled) return;
        if (result && result.error) {
          setError(result.error);
          setRows([]);
        } else {
          setRows(result || []);
        }
        setMyRank(null); // rank-among-friends is just their position in this short list, no separate call needed
        setLoading(false);
        return;
      }

      const [topResult, rankResult] = await Promise.all([
        fetchLeaderboardTop(scopeKey, metric, 40),
        user ? fetchMyRank(user.uid, scopeKey, metric) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      if (topResult && topResult.error) {
        setError(topResult.error);
        setRows([]);
      } else {
        setRows(topResult || []);
      }
      setMyRank(rankResult);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [scopeKey, metric, user, friendsOnly, friendUids]);

  function switchMetric(m) {
    playTapSound();
    setMetric(m);
  }

  return (
    <div className="screen-leaderboard">
      <div className="lb-wrap">
        <div className="lb-header-row">
          <div>
            <h1 className="lb-title">🏆 Leaderboard</h1>
            <div className="lb-sub">See how you stack up</div>
          </div>
          <button className="btn-ghost lb-home-btn" onClick={() => { playTapSound(); onBack(); }}>← Home</button>
        </div>

        <div className="lb-metric-row" style={{ marginBottom: 10 }}>
          <button
            className={!friendsOnly ? 'btn-ghost lb-metric-btn active' : 'btn-ghost lb-metric-btn'}
            onClick={() => { playTapSound(); setFriendsOnly(false); }}
          >
            🌐 Everyone
          </button>
          <button
            className={friendsOnly ? 'btn-ghost lb-metric-btn active' : 'btn-ghost lb-metric-btn'}
            onClick={() => { playTapSound(); setFriendsOnly(true); }}
          >
            👥 Friends Only
          </button>
        </div>

        <select className="lb-scope-select" value={scope} onChange={(e) => { playTapSound(); setScope(e.target.value); }}>
          <option value="">🌐 Global (all subjects)</option>
          {Object.keys(mainSubjectMeta || {}).map((name) => (
            <option key={name} value={name}>{mainSubjectMeta[name]?.emoji} {name}</option>
          ))}
        </select>

        <div className="lb-metric-row">
          <button
            className={metric === 'accuracyPct' ? 'btn-ghost lb-metric-btn active' : 'btn-ghost lb-metric-btn'}
            onClick={() => switchMetric('accuracyPct')}
          >
            🎯 Accuracy %
          </button>
          <button
            className={metric === 'totalCorrect' ? 'btn-ghost lb-metric-btn active' : 'btn-ghost lb-metric-btn'}
            onClick={() => switchMetric('totalCorrect')}
          >
            ✅ Total Correct
          </button>
        </div>
        {metric === 'accuracyPct' && !friendsOnly && (
          <div className="lb-accuracy-note">Requires 100+ questions answered in this scope</div>
        )}

        {friendsOnly && friendUids.length === 0 && (
          <div className="lb-accuracy-note">You haven't added any friends yet — add some from the hamburger menu.</div>
        )}

        {myRank && (
          <div className="lb-my-rank">
            <div className="lb-my-rank-label">📍 Your Rank</div>
            <div className="lb-my-rank-value">#{myRank.rank} of {myRank.total} · {myRank.value}{unit}</div>
          </div>
        )}

        {loading && <div className="lb-loading">Loading leaderboard…</div>}

        {!loading && (error || rows.length === 0) && (
          <div className="lb-empty">
            <div className="lb-empty-emoji">{error ? '⚠️' : '🏳️'}</div>
            <div className="lb-empty-title">
              {error ? "Something went wrong loading this list" : friendsOnly ? 'No friends to show yet' : metric === 'accuracyPct' ? 'No one qualifies yet' : 'No scores yet'}
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
          <div className="lb-list">
            {rows.map((row, i) => {
              const isMe = user && row.uid === user.uid;
              const timeStr = row.avgTimeSec != null ? `⏱ ${row.avgTimeSec.toFixed(1)}s/question` : '⏱ -';
              return (
                <div key={row.uid} className={isMe ? 'lb-row glass lb-row-me' : 'lb-row glass'}>
                  <div className="lb-rank">{MEDALS[i] || `#${i + 1}`}</div>
                  <div className="lb-row-body">
                    <div className="lb-name">{row.displayName}{isMe ? ' (You)' : ''}</div>
                    <div className="lb-row-stats">✅ {row.correct} · ❌ {row.incorrect} · {timeStr}</div>
                  </div>
                  <div className="lb-value">{row.value}{unit}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
