import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { fetchWrongQuestions, fetchFlaggedQuestions, removeWrongQuestion, toggleFlaggedQuestion } from '../lib/reviewQueue';
import { playTapSound } from '../lib/sounds';
import ScreenHeader from './ScreenHeader';
import QuestionListCard from './QuestionListCard';
import './ListScreens.css';

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
      <ScreenHeader onBack={onBack} title={<>📌 Wrong &amp; Flagged</>}>
        Questions you've missed or starred for extra review.
      </ScreenHeader>

      <div className="lu-tabs" role="tablist" aria-label="Wrong or flagged">
        <button type="button" role="tab" aria-selected={tab === 'wrong'} className={tab === 'wrong' ? 'lu-tab on' : 'lu-tab'} onClick={() => { playTapSound(); setTab('wrong'); }}>
          ❌ Wrong ({wrong.length})
        </button>
        <button type="button" role="tab" aria-selected={tab === 'flagged'} className={tab === 'flagged' ? 'lu-tab on' : 'lu-tab'} onClick={() => { playTapSound(); setTab('flagged'); }}>
          ⭐ Flagged ({flagged.length})
        </button>
      </div>

      {loading ? (
        <div className="std-loading">Loading…</div>
      ) : list.length === 0 ? (
        <div className="glass lu-empty">
          <div className="empty-state-icon">{tab === 'wrong' ? '✅' : '🔖'}</div>
          <div>{tab === 'wrong' ? "You haven't missed anything here yet." : "Star a question during a quiz to save it here."}</div>
        </div>
      ) : (
        <>
          <div className="lu-list">
            {list.map((item) => (
              <QuestionListCard
                key={item.id}
                item={item}
                badges={<span className="badge badge-cyan">{item.s}</span>}
                onRemove={() => handleRemove(item)}
                removeLabel={tab === 'wrong' ? 'Remove from wrong questions' : 'Unflag this question'}
              />
            ))}
          </div>
          <div className="lu-bar">
            <button className="btn-glow" onClick={handlePractice}>Practice These ({list.length}) →</button>
          </div>
        </>
      )}
    </div>
  );
}
