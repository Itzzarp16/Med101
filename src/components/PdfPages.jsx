import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Renders a PDF page by page onto canvases with pdf.js. Phone browsers (Android
// Chrome, many in-app browsers) can't show a PDF inside an <iframe> - it just
// stays blank - so this draws the pages itself. Pages render lazily when they
// scroll near the screen and are freed again when far away, which keeps memory
// low even for 100+ page documents.
//
// Extras: zoom buttons (Fit -> 300%), a page counter, and it remembers the last
// page you were on for each PDF (this device only, via localStorage).

const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3];
const GAP = 8; // px between pages, and the box padding
const posKey = (url) => `med101_pdfpos:${url}`;

function PageCanvas({ doc, n, width, ratio }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const [near, setNear] = useState(n <= 2);

  useEffect(() => {
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: '1200px 0px' });
    io.observe(wrap.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!near || !width) {
      c.width = 0; c.height = 0; // free the bitmap while the page is far off-screen
      return undefined;
    }
    let cancelled = false;
    let task;
    doc.getPage(n).then((page) => {
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      c.width = Math.floor(viewport.width);
      c.height = Math.floor(viewport.height);
      task = page.render({ canvasContext: c.getContext('2d'), viewport });
      task.promise.catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; if (task) task.cancel(); };
  }, [near, width, doc, n]);

  return (
    <div ref={wrap} className="ak-pdf-page" style={{ aspectRatio: ratio }}>
      <canvas ref={canvas} />
    </div>
  );
}

export default function PdfPages({ url }) {
  const box = useRef(null);
  const scroller = useRef(null);
  const [width, setWidth] = useState(0); // fit-to-screen page width in px
  const [state, setState] = useState({ status: 'loading', progress: 0 });
  const [zoomIdx, setZoomIdx] = useState(0);
  const [page, setPage] = useState(1);
  const pageRef = useRef(1);
  const anchor = useRef(null);
  const restored = useRef(false);
  const saveTimer = useRef(null);
  const raf = useRef(0);
  const zoom = ZOOMS[zoomIdx];

  useEffect(() => {
    const el = box.current;
    let timer;
    const measure = () => setWidth(Math.max(0, Math.round(el.clientWidth) - GAP * 2));
    measure();
    const ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(measure, 150); });
    ro.observe(el);
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    let alive = true;
    let task;
    restored.current = false;
    setZoomIdx(0);
    setPage(1);
    pageRef.current = 1;
    setState({ status: 'loading', progress: 0 });
    (async () => {
      try {
        const [pdfjs, worker] = await Promise.all([
          import('pdfjs-dist/legacy/build/pdf.mjs'),
          import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        task = pdfjs.getDocument({ url });
        task.onProgress = ({ loaded, total }) => {
          if (alive && total) setState((s) => (s.status === 'loading' ? { ...s, progress: Math.min(99, Math.round((loaded / total) * 100)) } : s));
        };
        const doc = await task.promise;
        const first = await doc.getPage(1);
        const v = first.getViewport({ scale: 1 });
        if (alive) setState({ status: 'ready', doc, pages: doc.numPages, ratio: v.width / v.height });
      } catch {
        if (alive) setState({ status: 'error' });
      }
    })();
    return () => { alive = false; if (task) task.destroy(); };
  }, [url]);

  const pageHeight = () => (width * zoom) / (state.ratio || 0.707);

  // Resume where the reader left off (once per PDF, after the pages are laid out).
  useEffect(() => {
    if (state.status !== 'ready' || !width || restored.current) return;
    restored.current = true;
    let saved = 0;
    try { saved = parseInt(localStorage.getItem(posKey(url)), 10) || 0; } catch { /* storage unavailable */ }
    if (saved > 1 && saved <= state.pages) {
      setPage(saved);
      pageRef.current = saved;
      requestAnimationFrame(() => {
        if (scroller.current) scroller.current.scrollTop = (saved - 1) * (pageHeight() + GAP);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, width, url]);

  const remember = (p) => {
    try {
      if (p > 1) localStorage.setItem(posKey(url), String(p));
      else localStorage.removeItem(posKey(url));
    } catch { /* storage unavailable */ }
  };

  const onScroll = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const el = scroller.current;
      if (!el || state.status !== 'ready') return;
      const p = Math.min(state.pages, Math.max(1, Math.floor((el.scrollTop + el.clientHeight * 0.3) / (pageHeight() + GAP)) + 1));
      if (p !== pageRef.current) {
        pageRef.current = p;
        setPage(p);
      }
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => remember(pageRef.current), 400);
    });
  };

  // Save on the way out so a quick close doesn't lose the last position.
  useEffect(() => () => { clearTimeout(saveTimer.current); cancelAnimationFrame(raf.current); if (restored.current) remember(pageRef.current); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url]);

  // Zoom around the centre of the screen: remember where we are, then put it back after layout.
  const zoomTo = (idx) => {
    const el = scroller.current;
    const next = Math.min(ZOOMS.length - 1, Math.max(0, idx));
    if (!el || next === zoomIdx) return;
    anchor.current = {
      x: (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth,
      y: (el.scrollTop + el.clientHeight / 2) / el.scrollHeight,
    };
    setZoomIdx(next);
  };
  useLayoutEffect(() => {
    const a = anchor.current;
    const el = scroller.current;
    if (!a || !el) return;
    anchor.current = null;
    el.scrollTop = a.y * el.scrollHeight - el.clientHeight / 2;
    el.scrollLeft = a.x * el.scrollWidth - el.clientWidth / 2;
  }, [zoomIdx]);

  const ready = state.status === 'ready';

  return (
    <div className="ak-pdf-viewer">
      <div className="ak-pdf-scroll" ref={scroller} onScroll={onScroll}>
        <div ref={box} className="ak-pdf-box">
          {state.status === 'loading' && (
            <div className="ak-pdf-status" role="status">
              <div>
                Opening PDF… {state.progress ? `${state.progress}%` : ''}
                <div className="ak-pdf-bar" style={{ '--p': `${state.progress}%` }}><i /></div>
              </div>
            </div>
          )}
          {state.status === 'error' && (
            <div className="ak-pdf-status" role="alert">
              <div>Couldn’t display this PDF here.<br />Use the Download button to open it.</div>
            </div>
          )}
          {ready && (
            <div className="ak-pdf-pages" style={zoom > 1 ? { width: `${zoom * 100}%` } : undefined}>
              {Array.from({ length: state.pages }, (_, i) => (
                <PageCanvas key={i} doc={state.doc} n={i + 1} width={Math.round(width * zoom)} ratio={state.ratio} />
              ))}
            </div>
          )}
        </div>
      </div>
      {ready && (
        <div className="ak-pdf-tools" role="group" aria-label="PDF controls">
          <button
            type="button"
            className="ak-pdf-pageno"
            onClick={() => { if (scroller.current) scroller.current.scrollTo({ top: 0, behavior: 'smooth' }); }}
            title="Back to page 1"
          >
            {page} / {state.pages}
          </button>
          <button type="button" onClick={() => zoomTo(zoomIdx - 1)} disabled={zoomIdx === 0} aria-label="Zoom out">−</button>
          <button type="button" className="ak-pdf-pct" onClick={() => zoomTo(0)} title="Fit to screen" aria-label="Fit to screen">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => zoomTo(zoomIdx + 1)} disabled={zoomIdx === ZOOMS.length - 1} aria-label="Zoom in">+</button>
        </div>
      )}
    </div>
  );
}
