import { useEffect, useState } from 'react';
import { fetchUsageAnalytics } from '../lib/analytics';
import { playTapSound } from '../lib/sounds';
import './AdminAnalytics.css';

const SEMESTER_LABELS = {
  y1s1: 'Semester 1',
  y1s2: 'Semester 2',
  y2s1: 'Semester 3',
  y2s2: 'Semester 4',
  y3s1: 'Semester 5',
  y3s2: 'Semester 6',
};

function Kpi({ label, value, sub, tone }) {
  return (
    <div className="an-kpi">
      <div className="an-kpi-label">{label}</div>
      <div className="an-kpi-value" style={tone ? { color: tone } : undefined}>{value ?? '-'}</div>
      {sub && <div className="an-kpi-sub">{sub}</div>}
    </div>
  );
}

const accColor = (pct) => (pct >= 75 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)');

function Ring({ pct }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <svg className="an-ring" viewBox="0 0 130 130" role="img" aria-label={`${p}% accuracy`}>
      <circle cx="65" cy="65" r={r} fill="none" stroke="var(--border2)" strokeWidth="10" />
      <circle
        cx="65" cy="65" r={r} fill="none" stroke={accColor(p)} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${(c * p) / 100} ${c}`} transform="rotate(-90 65 65)"
      />
      <text x="65" y="72" textAnchor="middle" className="an-ring-text">{p}%</text>
    </svg>
  );
}

export default function AdminAnalyticsScreen({ onBack , hideBack = false, semesterMainSubjects = {} }) {
  const [semFilter, setSemFilter] = useState('all');
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
      {!hideBack && (
        <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>
      )}

      <div className="an-toolbar">
        <p className="std-sub">Platform-wide activity across every student.</p>
        <button className="btn-ghost an-refresh" onClick={() => { playTapSound(); load(); }} disabled={loading}>
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
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

          <div className="an-kpis">
            <Kpi label="Students" value={data.totalStudents} sub="signed up" />
            <Kpi
              label="Active students"
              value={data.activeLeaderboardStudents}
              tone="var(--green)"
              sub={data.totalStudents ? `${Math.round((data.activeLeaderboardStudents / data.totalStudents) * 100)}% of all students` : null}
            />
            <Kpi label="Questions answered" value={data.totalAnswered.toLocaleString()} sub={`${data.totalCorrect.toLocaleString()} correct`} />
            <Kpi label="Rooms created" value={data.totalRoomsCreated} sub="challenge rooms" />
          </div>

          <div className="an-row">
            <div className="glass std-card an-acc">
              <div className="auth-label">Platform-wide accuracy</div>
              <Ring pct={data.overallAccuracyPct} />
              <div className="an-acc-note">
                {data.totalCorrect.toLocaleString()} of {data.totalAnswered.toLocaleString()} answers correct
              </div>
            </div>

            <div className="glass std-card">
              <div className="auth-label">Students by semester</div>
              <div className="an-bars">
                {(() => {
                  const max = Math.max(1, ...Object.values(data.semesterCounts).map((n) => n || 0));
                  return Object.entries(data.semesterCounts).map(([semId, count]) => (
                    <div key={semId} className="an-bar-row">
                      <span className="an-bar-label">{SEMESTER_LABELS[semId] || semId}</span>
                      <span className="an-bar-track"><span className="an-bar-fill" style={{ width: `${((count || 0) / max) * 100}%` }} /></span>
                      <span className="an-bar-num">{count ?? '-'}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>

          <div className="glass std-card an-subjects">
            <div className="auth-label">Most-practiced subjects</div>
            {(() => {
              const semIds = Object.keys(SEMESTER_LABELS).filter((id) => (semesterMainSubjects[id] || []).length > 0);
              const allowed = semFilter === 'all' ? null : new Set(semesterMainSubjects[semFilter] || []);
              const list = data.subjectPopularity.filter((sj) => !allowed || allowed.has(sj.name));
              const max = Math.max(1, ...list.map((x) => x.answered));
              return (
                <>
                  {semIds.length > 0 && (
                    <div className="an-chips">
                      {['all', ...semIds].map((id) => (
                        <button
                          key={id}
                          className={id === semFilter ? 'an-chip active' : 'an-chip'}
                          onClick={() => setSemFilter(id)}
                        >
                          {id === 'all' ? 'All' : SEMESTER_LABELS[id]}
                        </button>
                      ))}
                    </div>
                  )}
                  {list.length === 0 ? (
                    <div className="std-sub">No quiz activity recorded for this selection yet.</div>
                  ) : (
                    list.map((sj, i) => (
                      <div key={sj.name} className="an-subj">
                        <span className="an-subj-rank">{i + 1}</span>
                        <div className="an-subj-main">
                          <div className="an-subj-top">
                            <span className="an-subj-name">{sj.name}</span>
                            <span className="an-subj-meta">{sj.answered.toLocaleString()} answered</span>
                          </div>
                          <span className="an-bar-track"><span className="an-bar-fill" style={{ width: `${(sj.answered / max) * 100}%` }} /></span>
                        </div>
                        <span
                          className="an-subj-pill"
                          style={{ color: accColor(sj.accuracyPct), background: `color-mix(in srgb, ${accColor(sj.accuracyPct)} 14%, transparent)` }}
                        >
                          {sj.accuracyPct}%
                        </span>
                      </div>
                    ))
                  )}
                </>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}
