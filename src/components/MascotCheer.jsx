import Mascot from './Mascot';
import './Mascot.css';

// Corner pop-up shown while `cheer` ({ id, line }) is set; the quiz sets it on
// a correct answer and clears it ~1.5s later. Wrong answers and mock exams
// never set it, so it only ever celebrates.
export default function MascotCheer({ cheer }) {
  if (!cheer) return null;
  return (
    <div className="mascot-cheer" key={cheer.id} aria-hidden="true">
      <div className="mascot-cheer-bubble">{cheer.line}</div>
      <Mascot mood="cheer" size={78} />
    </div>
  );
}
