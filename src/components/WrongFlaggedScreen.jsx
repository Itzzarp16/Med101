import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { fetchWrongQuestions, fetchFlaggedQuestions, removeWrongQuestion, toggleFlaggedQuestion } from '../lib/reviewQueue';
import { playTapSound } from '../lib/sounds';

export default function WrongFlaggedScreen({ onPracticeSet, onBack }) {
  const { user } = useAuth();
  const [tab, setTab] = useState('wrong');
  const [wrong, setWrong] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    const [w, f] = await Promise.all([fetchWrongQuestions(user.uid), fetchFlaggedQuestions(user.uid)]);
    setWrong(w);
    setFlagged(f);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, [user.uid]);

  const list = tab === 'wrong' ? wrong : flagged;

  async function handleRemove(item) {
    playTapSound();
    if (tab === 'wrong') {
      await removeWrongQuestion(user.uid, item.id);
      setWrong((prev) => prev.filter((x) => x.id !== item.id));
    } else {
      await toggleFlaggedQuestion(user.uid, item.mainSubject, item, true);
      setFlagged((prev) => prev.filter((x) => x.id !== item.id));
    }
  }

  function handlePractice() {
    playTapSound();
    onPracticeSet(list);
  }

  return (
    <div className="std-screen">
      <button className="btn-ghost std-back" onClick={() => { playTapSound(); onBack(); }}>← Back</button>

      <div className="std-header">
        <h1 className="std-title">📌 Wrong &amp; Flagged</h1>
        <p className="std-sub">Questions you've missed or starred for extra review.</p>
      </div>

      <div className="auth-tabs" style={{ marginBottom: 16 }}>
        <button type="button" className={tab === 'wrong' ? 'auth-tab active' : 'auth-tab'} onClick={() => { playTapSound(); setTab('wrong'); }}>
          ❌ Wrong ({wrong.length})
        </button>
        <button type="button" className={tab === 'flagged' ? 'auth-tab active' : 'auth-tab'} onClick={() => { playTapSound(); setTab('flagged'); }}>
          ⭐ Flagged ({flagged.length})
        </button>
      </div>

      {loading ? (
        <div className="std-loading">Loading…</div>
      ) : list.length === 0 ? (
        <div className="glass std-card" style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          {tab === 'wrong' ? "You haven't missed anything here yet." : "Star a question during a quiz to save it here."}
        </div>
      ) : (
        <>
          <button className="btn-glow std-save-btn" onClick={handlePractice} style={{ marginBottom: 14 }}>
            Practice These ({list.length}) →
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map((item) => (
              <div key={item.id} className="glass" style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <span className="badge badge-cyan">{item.s}</span>
                  <button onClick={() => handleRemove(item)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </div>
                <p style={{ fontSize: 13.5, color: 'var(--text)', margin: '0 0 8px' }}>{item.q}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {item.o.map((opt, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: 12,
                        padding: '5px 10px',
                        borderRadius: 8,
                        background: i === item.c ? 'rgba(48,242,138,0.12)' : 'var(--g1)',
                        color: i === item.c ? 'var(--green)' : 'var(--text3)',
                      }}
                    >
                      {opt}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
