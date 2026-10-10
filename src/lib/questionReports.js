import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { questionKeyFor } from './reviewQueue';

export const REPORT_REASONS = [
  { value: 'wrong_answer', label: 'Wrong answer marked' },
  { value: 'typo', label: 'Typo / wording' },
  { value: 'unclear', label: 'Unclear question' },
  { value: 'outdated', label: 'Outdated info' },
  { value: 'other', label: 'Something else' },
];
export const reasonLabel = (v) => REPORT_REASONS.find((r) => r.value === v)?.label || v;

const reportRef = (uid, key) => doc(db, 'questionReports', `${key}_${uid}`);

// Has this student already reported this question?
export async function hasReported(uid, mainSubject, question) {
  const snap = await getDoc(reportRef(uid, questionKeyFor(mainSubject, question)));
  return snap.exists();
}

// Returns 'sent', or 'already' if this student reported it before.
export async function reportQuestion(uid, mainSubject, question, reason, note) {
  const key = questionKeyFor(mainSubject, question);
  try {
    await setDoc(reportRef(uid, key), {
      key,
      uid,
      mainSubject,
      s: question.s || '',
      q: question.q,
      o: question.o,
      c: question.c,
      ...(question.img?.length ? { img: question.img } : null),
      reason,
      note: (note || '').trim().slice(0, 300),
      status: 'open',
      createdAt: serverTimestamp(),
    });
    return 'sent';
  } catch (e) {
    // The rules turn a repeat report (an update) into permission-denied -
    // but permission-denied also means the rules aren't deployed yet, so
    // only call it a repeat if the earlier report is really there.
    if (e?.code === 'permission-denied') {
      const existed = await getDoc(reportRef(uid, key)).then((s) => s.exists()).catch(() => false);
      if (existed) return 'already';
      throw new Error('Reporting is not available right now. Please try again later.');
    }
    throw e;
  }
}

// ── Admin ────────────────────────────────────────────────────

// Open reports grouped by question, most-reported first.
export async function fetchOpenReportGroups() {
  const snap = await getDocs(query(collection(db, 'questionReports'), where('status', '==', 'open'), limit(500)));
  const groups = new Map();
  snap.docs.forEach((d) => {
    const r = { id: d.id, ...d.data() };
    if (!groups.has(r.key)) groups.set(r.key, { key: r.key, mainSubject: r.mainSubject, s: r.s, q: r.q, o: r.o, c: r.c, reports: [] });
    groups.get(r.key).reports.push(r);
  });
  const toMs = (r) => (r.createdAt?.toMillis ? r.createdAt.toMillis() : 0);
  const list = [...groups.values()];
  list.forEach((g) => g.reports.sort((a, b) => toMs(b) - toMs(a)));
  list.sort((a, b) => b.reports.length - a.reports.length || toMs(b.reports[0]) - toMs(a.reports[0]));
  return list;
}

export async function resolveReports(reportIds, status, adminEmail) {
  const batch = writeBatch(db);
  reportIds.forEach((id) => batch.update(doc(db, 'questionReports', id), {
    status, resolvedAt: serverTimestamp(), resolvedBy: adminEmail || null,
  }));
  await batch.commit();
}
