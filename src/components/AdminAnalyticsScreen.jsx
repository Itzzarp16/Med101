import { useEffect, useState } from 'react';
import { fetchUsageAnalytics } from '../lib/analytics';
import { playTapSound } from '../lib/sounds';

const SEMESTER_LABELS = {
  y1s1: 'Year 1 · Sem 1',
  y1s2: 'Year 1 · Sem 2',
  y2s1: 'Year 2 · Sem 1',
  y2s2: 'Year 2 · Sem 2',
};

function StatBox({ label, value, accent }) {
  return (
    <div className="stat-card" style={{ '--accent': accent || 'var(--cyan)' }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: accent }}>{value ?? '-'}</div>
    </div>
  );
}

export default function AdminAnalyticsScreen({ onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState(null);

  async function load() {
    setLoading(true);
    setFatalError(null);
    try {
      const result = await fetchUsageAnalytics();
      setData(result);
    } catch (e) {
      setFatalError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="std-screen">
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="std-header">
        <h1 className="std-title">📊 Usage Analytics</h1>
        <p className="std-sub">Platform-wide activity across every student.</p>
      </div>

      {loading && <div className="std-loading">Loading…</div>}
      {fatalError && <div className="auth-msg error" style={{ display: 'block' }}>{fatalError}</div>}

      {data && (
        <>
          {data.errors.length > 0 && (
            <div className="auth-msg error" style={{ display: 'block', marginBottom: 14 }}>
              Couldn't load: {data.errors.join(', ')}. Everything else below is still accurate.
            </div>
          )}

          <div className="quiz-stats-grid" style={{ marginBottom: 16 }}>
            <StatBox label="Students" value={data.totalStudents} accent="var(--cyan)" />
            <StatBox label="Active Students" value={data.activeLeaderboardStudents} accent="var(--green)" />
            <StatBox label="Rooms Created" value={data.totalRoomsCreated} accent="var(--violet)" />
          </div>

          <div className="glass std-card">
            <div className="auth-label">Platform-Wide Accuracy</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--cyan)' }}>{data.overallAccuracyPct}%</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              {data.totalCorrect.toLocaleString()} correct out of {data.totalAnswered.toLocaleString()} questions answered
            </div>
          </div>

          <div className="glass std-card" style={{ marginTop: 14 }}>
            <div className="auth-label">Students by Semester</div>
            {Object.entries(data.semesterCounts).map(([semId, count]) => (
              <div key={semId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                <span style={{ color: 'var(--text2)' }}>{SEMESTER_LABELS[semId] || semId}</span>
                <span style={{ color: 'var(--text)', fontWeight: 700 }}>{count ?? '-'}</span>
              </div>
            ))}
          </div>

          <div className="glass std-card" style={{ marginTop: 14 }}>
            <div className="auth-label">Most-Practiced Subjects</div>
            {data.subjectPopularity.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>No quiz activity recorded yet.</div>
            ) : (
              data.subjectPopularity.map((s) => (
                <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text2)' }}>{s.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text3)' }}>
                    {s.answered.toLocaleString()} answered · {s.accuracyPct}%
                  </span>
                </div>
              ))
            )}
          </div>

          <button className="btn-ghost std-save-btn" onClick={() => { playTapSound(); load(); }} style={{ marginTop: 16 }}>
            ↻ Refresh
          </button>
        </>
      )}
    </div>
  );
}
