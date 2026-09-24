import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';

// Same list adminAccountActions.js uses for account deletion - kept
// in sync by hand since Firestore has no way to enumerate a user's
// subcollections from the client, so both places that need "every
// subcollection under users/{uid}" have to name them explicitly.
const SUBCOLLECTIONS = ['quizHistory', 'friends', 'wrongQuestions', 'flaggedQuestions', 'myRooms', 'invites'];

function formatTimestamp(ts) {
  if (!ts?.toDate) return String(ts ?? '(none)');
  return ts.toDate().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatValue(v) {
  if (v == null) return '(none)';
  if (v?.toDate) return formatTimestamp(v);
  if (Array.isArray(v)) return v.length ? v.join(', ') : '(empty)';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Skips a handful of fields that are either duplicated elsewhere in
// the export under a clearer heading, or pure internal bookkeeping
// with no meaningful content for the student reading this (a device
// fingerprint ID, not "data about them" in any useful sense).
const PROFILE_SKIP_FIELDS = new Set(['activeDeviceId']);

export async function buildUserDataExport(uid) {
  const lines = [];
  const push = (s = '') => lines.push(s);

  const userSnap = await getDoc(doc(db, 'users', uid));
  const profile = userSnap.exists() ? userSnap.data() : null;

  push('MED101 - PERSONAL DATA EXPORT');
  push(`Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`);
  push(`Account UID: ${uid}`);
  push('');
  push('This is everything Med101 stores about this account, compiled in');
  push('response to a data access request (see Section 6 of the Privacy Policy).');
  push('');

  push('== PROFILE ==');
  if (profile) {
    for (const [key, value] of Object.entries(profile)) {
      if (PROFILE_SKIP_FIELDS.has(key)) continue;
      push(`${key}: ${formatValue(value)}`);
    }
  } else {
    push('(no profile document found)');
  }
  push('');

  const subcolResults = {};
  for (const name of SUBCOLLECTIONS) {
    const snap = await getDocs(collection(db, 'users', uid, name));
    subcolResults[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  push(`== QUIZ HISTORY (${subcolResults.quizHistory.length} attempts) ==`);
  if (subcolResults.quizHistory.length) {
    for (const h of subcolResults.quizHistory) {
      push(`- ${formatTimestamp(h.createdAt)} | ${h.mainSubject || '?'} | Score: ${h.correct ?? '?'}/${h.total ?? '?'}`);
    }
  } else {
    push('(none)');
  }
  push('');

  push(`== WRONG QUESTIONS (${subcolResults.wrongQuestions.length}) ==`);
  if (subcolResults.wrongQuestions.length) {
    for (const w of subcolResults.wrongQuestions) {
      push(`- [${w.mainSubject || '?'} / ${w.s || '?'}] ${w.q || '(question text missing)'}`);
    }
  } else {
    push('(none)');
  }
  push('');

  push(`== FLAGGED QUESTIONS (${subcolResults.flaggedQuestions.length}) ==`);
  if (subcolResults.flaggedQuestions.length) {
    for (const f of subcolResults.flaggedQuestions) {
      push(`- [${f.mainSubject || '?'} / ${f.s || '?'}] ${f.q || '(question text missing)'}`);
    }
  } else {
    push('(none)');
  }
  push('');

  push(`== FRIENDS (${subcolResults.friends.length}) ==`);
  if (subcolResults.friends.length) {
    for (const fr of subcolResults.friends) {
      push(`- ${fr.username || fr.displayName || fr.id}`);
    }
  } else {
    push('(none)');
  }
  push('');

  const leaderboardSnap = await getDoc(doc(db, 'leaderboard', uid));
  push('== LEADERBOARD STATS ==');
  if (leaderboardSnap.exists()) {
    for (const [key, value] of Object.entries(leaderboardSnap.data())) {
      push(`${key}: ${formatValue(value)}`);
    }
  } else {
    push('(no leaderboard entry)');
  }
  push('');

  const codesSnap = await getDocs(query(collection(db, 'activationCodes'), where('uid', '==', uid)));
  push(`== MED101 MAXX ACTIVATION CODES (${codesSnap.size}) ==`);
  if (codesSnap.size) {
    codesSnap.forEach((d) => {
      const c = d.data();
      push(`- Code ${d.id} | Used: ${formatTimestamp(c.usedAt)} | Duration: ${c.durationDays ?? '?'} days`);
    });
  } else {
    push('(none)');
  }
  push('');

  const paymentsSnap = await getDocs(query(collection(db, 'paymentRequests'), where('uid', '==', uid)));
  push(`== PAYMENT SUBMISSIONS (${paymentsSnap.size}) ==`);
  if (paymentsSnap.size) {
    paymentsSnap.forEach((d) => {
      const p = d.data();
      push(`- ${formatTimestamp(p.createdAt)} | Status: ${p.status || '?'} | Transaction ID: ${d.id}`);
    });
  } else {
    push('(none)');
  }
  push('');

  push('== ROOMS HOSTED / INVITES ==');
  push(`Rooms created: ${subcolResults.myRooms.length}`);
  push(`Pending invites: ${subcolResults.invites.length}`);
  push('');

  push('--- End of export ---');

  return lines.join('\n');
}

// Renders buildUserDataExport's text into a paginated PDF (jsPDF),
// returning the jsPDF document object itself so callers can choose
// what to do with it - handleExportData calls doc.save(...) to
// download it, handleEmailExportToUser instead reads its base64 via
// doc.output('datauristring') to attach to an email. Keeping the
// layout logic here in one place (rather than duplicated per caller)
// means the download and the emailed copy always look identical.
export async function buildUserDataExportPdf(uid) {
  const text = await buildUserDataExport(uid);
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const marginX = 40;
  const marginTop = 50;
  const marginBottom = 50;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - marginX * 2;
  const lineHeight = 14;
  let y = marginTop;

  function newPageIfNeeded() {
    if (y > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  }

  const rawLines = text.split('\n');
  for (const raw of rawLines) {
    const isHeading = raw.startsWith('==');
    doc.setFont('helvetica', isHeading ? 'bold' : 'normal');
    doc.setFontSize(isHeading ? 11 : 9.5);

    // Wrap long lines to the page width rather than clipping/
    // overflowing off the right edge.
    const wrapped = raw.length ? doc.splitTextToSize(raw, usableWidth) : [''];
    for (const wline of wrapped) {
      newPageIfNeeded();
      doc.text(wline, marginX, y);
      y += lineHeight;
    }
    if (isHeading) y += 2; // a little breathing room under section headings
  }

  return doc;
}

// Admin-only: emails an already-built PDF export (see
// buildUserDataExportPdf above - build it first, base64-encode its
// output, then pass that here) to that account's own registered
// email address via api/admin/email-data-export.py. The server looks
// up the recipient address itself from users/{uid}.email rather than
// trusting anything passed in here, so this can only ever land in the
// real account holder's inbox.
export async function emailDataExportToUser(adminUser, uid, exportPdfBase64) {
  const idToken = await adminUser.getIdToken();

  const res = await fetch('/api/admin/email-data-export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ uid, exportPdfBase64 }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Failed to send (${res.status}).`);
  }

  return data;
}
