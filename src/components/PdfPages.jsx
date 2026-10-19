import { useEffect, useRef, useState } from 'react';

// Renders a PDF page by page onto canvases with pdf.js. Phone browsers (Android
// Chrome, many in-app browsers) can't show a PDF inside an <iframe> - it just
// stays blank - so this draws the pages ourselves. Pages render lazily when they
// scroll near the screen and are freed again when far away, which keeps memory
// low even for 100+ page documents.

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
  const [width, setWidth] = useState(0);
  const [state, setState] = useState({ status: 'loading', progress: 0 });

  useEffect(() => {
    const el = box.current;
    let timer;
    const measure = () => setWidth(Math.round(el.clientWidth));
    measure();
    const ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(measure, 150); });
    ro.observe(el);
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    let alive = true;
    let task;
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

  return (
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
          <div>Couldn’t display this PDF here.<br />Use the Download button above to open it.</div>
        </div>
      )}
      {state.status === 'ready' && (
        <div className="ak-pdf-pages">
          {Array.from({ length: state.pages }, (_, i) => (
            <PageCanvas key={i} doc={state.doc} n={i + 1} width={width} ratio={state.ratio} />
          ))}
        </div>
      )}
    </div>
  );
}
