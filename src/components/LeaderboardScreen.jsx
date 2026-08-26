import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { fetchLeaderboardTop, fetchMyRank } from '../lib/leaderboard';
import { playTapSound } from '../lib/sounds';
import './LeaderboardScreen.css';

const METRICS = [
  { value: 'accuracyPct', label: 'Accuracy' },
  { value: 'totalCorrect', label: 'Total Correct' },
];

export default function LeaderboardScreen({ semesterId, onBack }) {
  const { user } = useAuth();
  const [metric, setMetric] = useState('totalCorrect'); // what we actually query top() with
  const [rows, setRows] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const scopeKey = semesterId ? `sem:${semesterId}` : '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      const [topResult, rankResult] = await Promise.all([
        fetchLeaderboardTop(scopeKey, metric, 50),
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
  }, [scopeKey, metric, user]);

  function switchMetric(m) {
    playTapSound();
    setMetric(m);
  }

  return (
    <div className="lb-screen">
      <button className="lb-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="lb-header">
        <h1 className="lb-title">Leaderboard</h1>
        <p className="lb-sub">{semesterId ? `Year 1 · Semester 2` : 'All-time · Global'}</p>
      </div>

      <div className="lb-tabs">
        {METRICS.map((m) => (
          <button
            key={m.value}
            className={metric === m.value ? 'lb-tab active' : 'lb-tab'}
            onClick={() => switchMetric(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {myRank && (
        <div className="lb-my-rank glass-hi">
          <span className="lb-my-rank-label">Your Rank</span>
          <span className="lb-my-rank-value">#{myRank.rank} <span className="lb-my-rank-of">of {myRank.total}</span></span>
        </div>
      )}

      {loading && <div className="lb-loading">Loading leaderboard…</div>}

      {error && (
        <div className="lb-error">
          Couldn't load the leaderboard right now. Try again shortly.
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="lb-empty">
          No one has qualified yet — answer enough questions in this scope to appear here.
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="lb-list">
          {rows.map((row, i) => (
            <div
              key={row.uid}
              className={`lb-row glass${user && row.uid === user.uid ? ' lb-row-me' : ''}`}
            >
              <span className="lb-rank">#{i + 1}</span>
              <span className="lb-name">{row.displayName}</span>
              <span className="lb-value">
                {metric === 'totalCorrect' ? row.value : `${row.value}%`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
