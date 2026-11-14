import { tilt } from '../lib/tilt';
import { haptic } from '../lib/haptics';

// Overview screen of the admin portal: a greeting with a spinning 3D cube and
// a launcher of tilting tiles, one per admin tool, grouped by section.
export default function AdminHome({ groups, name, onOpen }) {
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  let n = 0;
  return (
    <div className="adm-home">
      <section className="adm-hero">
        <div className="adm-hero-text">
          <span className="adm-hello">{greet}</span>
          <h2>{name}</h2>
          <p>Everything for Med101 in one place. Pick a tool to get started.</p>
        </div>
        <div className="adm-cube-wrap" aria-hidden="true">
          <div className="adm-cube">
            <span className="f1">🩺</span><span className="f2">💊</span><span className="f3">🧬</span>
            <span className="f4">🫀</span><span className="f5">🔬</span><span className="f6">📚</span>
          </div>
        </div>
      </section>

      {groups.filter((g) => g.title !== 'Overview').map((g) => (
        <section key={g.title} className="adm-group" style={{ '--h': g.hue }}>
          <h3 className="adm-group-title">{g.title}</h3>
          <div className="adm-tiles">
            {g.tabs.map((t) => (
              <button
                key={t.id}
                className="adm-tile"
                style={{ '--n': n++ }}
                onClick={() => { haptic(8); onOpen(t.id); }}
                {...tilt}
              >
                <span className="adm-glare" aria-hidden="true" />
                <span className="adm-tile-icon" aria-hidden="true">{t.icon}</span>
                <span className="adm-tile-name">{t.label}</span>
                <span className="adm-tile-desc">{t.desc}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
