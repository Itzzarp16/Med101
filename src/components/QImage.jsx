import { useState } from 'react';
import './QImage.css';

// Pictures that belong to a question (chemical structures, reaction
// schemes, ECGs, slides ...). Questions carry them as `img: ['/img/q/x.jpg']`.
// Tap an image to see it full-screen; a broken file just disappears
// instead of leaving a broken-image icon in the middle of the quiz.
export default function QImage({ srcs }) {
  const [big, setBig] = useState(null);
  const [broken, setBroken] = useState({});
  const list = (Array.isArray(srcs) ? srcs : srcs ? [srcs] : []).filter((s) => s && !broken[s]);
  if (!list.length) return null;
  return (
    <>
      <div className="qimg-wrap">
        {list.map((src) => (
          <button type="button" key={src} className="qimg-btn" onClick={() => setBig(src)} aria-label="View image full screen">
            <img className="qimg" src={src} alt="Question figure" loading="lazy" decoding="async" onError={() => setBroken((b) => ({ ...b, [src]: true }))} />
          </button>
        ))}
      </div>
      {big && (
        <div className="qimg-lightbox" role="dialog" aria-modal="true" onClick={() => setBig(null)}>
          <img src={big} alt="Question figure, enlarged" />
          <button type="button" className="qimg-close" aria-label="Close image">✕</button>
        </div>
      )}
    </>
  );
}
