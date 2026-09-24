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

// Does every Firestore read the export needs exactly once, and
// returns a structured description of it - both the plain-text
// export and the designed PDF are just two different renderers over
// this same data, so the two can never quietly drift out of sync and
// nothing gets fetched twice.
async function fetchExportData(uid) {
  const userSnap = await getDoc(doc(db, 'users', uid));
  const profile = userSnap.exists() ? userSnap.data() : null;

  const subcolResults = {};
  for (const name of SUBCOLLECTIONS) {
    const snap = await getDocs(collection(db, 'users', uid, name));
    subcolResults[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  const leaderboardSnap = await getDoc(doc(db, 'leaderboard', uid));
  const leaderboard = leaderboardSnap.exists() ? leaderboardSnap.data() : null;

  const codesSnap = await getDocs(query(collection(db, 'activationCodes'), where('uid', '==', uid)));
  const activationCodes = codesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const paymentsSnap = await getDocs(query(collection(db, 'paymentRequests'), where('uid', '==', uid)));
  const payments = paymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return {
    uid,
    generatedAt: new Date(),
    profile,
    quizHistory: subcolResults.quizHistory,
    wrongQuestions: subcolResults.wrongQuestions,
    flaggedQuestions: subcolResults.flaggedQuestions,
    friends: subcolResults.friends,
    myRoomsCount: subcolResults.myRooms.length,
    invitesCount: subcolResults.invites.length,
    leaderboard,
    activationCodes,
    payments,
  };
}

export async function buildUserDataExport(uid) {
  const data = await fetchExportData(uid);
  const lines = [];
  const push = (s = '') => lines.push(s);

  push('MED101 - PERSONAL DATA EXPORT');
  push(`Generated: ${data.generatedAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`);
  push(`Account UID: ${uid}`);
  push('');
  push('This is everything Med101 stores about this account, compiled in');
  push('response to a data access request (see Section 6 of the Privacy Policy).');
  push('');

  push('== PROFILE ==');
  if (data.profile) {
    for (const [key, value] of Object.entries(data.profile)) {
      if (PROFILE_SKIP_FIELDS.has(key)) continue;
      push(`${key}: ${formatValue(value)}`);
    }
  } else {
    push('(no profile document found)');
  }
  push('');

  push(`== QUIZ HISTORY (${data.quizHistory.length} attempts) ==`);
  if (data.quizHistory.length) {
    for (const h of data.quizHistory) {
      push(`- ${formatTimestamp(h.createdAt)} | ${h.mainSubject || '?'} | Score: ${h.correct ?? '?'}/${h.total ?? '?'}`);
    }
  } else {
    push('(none)');
  }
  push('');

  push(`== WRONG QUESTIONS (${data.wrongQuestions.length}) ==`);
  if (data.wrongQuestions.length) {
    for (const w of data.wrongQuestions) {
      push(`- [${w.mainSubject || '?'} / ${w.s || '?'}] ${w.q || '(question text missing)'}`);
    }
  } else {
    push('(none)');
  }
  push('');

  push(`== FLAGGED QUESTIONS (${data.flaggedQuestions.length}) ==`);
  if (data.flaggedQuestions.length) {
    for (const f of data.flaggedQuestions) {
      push(`- [${f.mainSubject || '?'} / ${f.s || '?'}] ${f.q || '(question text missing)'}`);
    }
  } else {
    push('(none)');
  }
  push('');

  push(`== FRIENDS (${data.friends.length}) ==`);
  if (data.friends.length) {
    for (const fr of data.friends) {
      push(`- ${fr.username || fr.displayName || fr.id}`);
    }
  } else {
    push('(none)');
  }
  push('');

  push('== LEADERBOARD STATS ==');
  if (data.leaderboard) {
    for (const [key, value] of Object.entries(data.leaderboard)) {
      push(`${key}: ${formatValue(value)}`);
    }
  } else {
    push('(no leaderboard entry)');
  }
  push('');

  push(`== MED101 MAXX ACTIVATION CODES (${data.activationCodes.length}) ==`);
  if (data.activationCodes.length) {
    for (const c of data.activationCodes) {
      push(`- Code ${c.id} | Used: ${formatTimestamp(c.usedAt)} | Duration: ${c.durationDays ?? '?'} days`);
    }
  } else {
    push('(none)');
  }
  push('');

  push(`== PAYMENT SUBMISSIONS (${data.payments.length}) ==`);
  if (data.payments.length) {
    for (const p of data.payments) {
      push(`- ${formatTimestamp(p.createdAt)} | Status: ${p.status || '?'} | Transaction ID: ${p.id}`);
    }
  } else {
    push('(none)');
  }
  push('');

  push('== ROOMS HOSTED / INVITES ==');
  push(`Rooms created: ${data.myRoomsCount}`);
  push(`Pending invites: ${data.invitesCount}`);
  push('');

  push('--- End of export ---');

  return lines.join('\n');
}

// --- Designed PDF export -----------------------------------------
//
// Same underlying data as buildUserDataExport above, but laid out as
// an actual document: a navy header banner, a cyan section bar per
// section (with a count badge), real striped tables via
// jspdf-autotable instead of raw "key: value" text dumps, and a
// footer with page numbers on every page. Colors match the app's own
// light-theme tokens (tokens.css) so the PDF doesn't feel like a
// different product from the site itself.

const NAVY = [30, 58, 95];       // --brand-gradient's darkest stop
const CYAN = [0, 144, 200];      // --cyan (light theme)
const TEXT_DARK = [30, 41, 59];
const TEXT_MUTED = [100, 116, 139];
const ROW_STRIPE = [241, 245, 249];
const BORDER = [226, 232, 240];

function sectionBar(doc, x, y, width, title, count) {
  const barHeight = 22;
  doc.setFillColor(...CYAN);
  doc.roundedRect(x, y, width, barHeight, 4, 4, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title, x + 10, y + barHeight / 2 + 4);
  if (count != null) {
    const countText = String(count);
    doc.setFontSize(9.5);
    doc.text(countText, x + width - 10, y + barHeight / 2 + 3.5, { align: 'right' });
  }
  return y + barHeight + 10;
}

function emptyNote(doc, x, y, text) {
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(text, x, y);
  return y + 18;
}

// Renders buildUserDataExport's underlying data as a designed,
// paginated PDF (jsPDF + jspdf-autotable), returning the jsPDF
// document object itself so callers can choose what to do with it -
// handleExportData calls doc.save(...) to download it,
// handleEmailExportToUser instead reads its base64 via
// doc.output('datauristring') to attach to an email. Keeping the
// layout logic here in one place (rather than duplicated per caller)
// means the download and the emailed copy always look identical.
export async function buildUserDataExportPdf(uid) {
  const data = await fetchExportData(uid);
  const { jsPDF } = await import('jspdf');
  const { autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const marginX = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const usableWidth = pageWidth - marginX * 2;

  const tableTheme = {
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 8, right: 8 }, textColor: TEXT_DARK, lineColor: BORDER },
    headStyles: { fontStyle: 'bold', textColor: NAVY, fillColor: false, lineWidth: { bottom: 1 }, lineColor: NAVY },
    alternateRowStyles: { fillColor: ROW_STRIPE },
    margin: { left: marginX, right: marginX },
  };

  // --- Header banner (page 1 only) ---
  const bannerHeight = 86;
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, bannerHeight, 'F');
  doc.setTextColor(255, 255, 255);

  // Embed the actual app logo (same image used for the Google OAuth
  // branding) rather than just styling text to look logo-like -
  // falls back to text-only if it can't be fetched for any reason,
  // so a network hiccup never breaks the whole export.
  let textStartX = marginX;
  try {
    const logoRes = await fetch('/icon-512.png');
    const logoBytes = new Uint8Array(await logoRes.arrayBuffer());
    const logoSize = 52;
    doc.addImage(logoBytes, 'PNG', marginX, (bannerHeight - logoSize) / 2, logoSize, logoSize);
    textStartX = marginX + logoSize + 14;
  } catch {
    // no logo available - text-only header below still works fine
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('MED101', textStartX, bannerHeight / 2 - 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Personal Data Export', textStartX, bannerHeight / 2 + 16);

  doc.setFontSize(8.5);
  const genLabel = `Generated ${data.generatedAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`;
  doc.text(genLabel, pageWidth - marginX, 38, { align: 'right' });
  doc.text(`Account UID: ${uid}`, pageWidth - marginX, 52, { align: 'right' });

  let y = bannerHeight + 22;

  // --- Explanatory note ---
  doc.setFillColor(...ROW_STRIPE);
  doc.roundedRect(marginX, y, usableWidth, 30, 4, 4, 'F');
  doc.setTextColor(...TEXT_MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    'This is everything Med101 stores about this account, compiled in response to a data access request (see Section 6 of the Privacy Policy).',
    marginX + 10,
    y + 18,
    { maxWidth: usableWidth - 20 }
  );
  y += 44;

  // --- Profile (2-column key/value table) ---
  y = sectionBar(doc, marginX, y, usableWidth, 'PROFILE');
  if (data.profile) {
    const rows = Object.entries(data.profile)
      .filter(([key]) => !PROFILE_SKIP_FIELDS.has(key))
      .map(([key, value]) => [key, formatValue(value)]);
    autoTable(doc, {
      ...tableTheme,
      startY: y,
      head: [['Field', 'Value']],
      body: rows,
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 150 } },
    });
    y = doc.lastAutoTable.finalY + 20;
  } else {
    y = emptyNote(doc, marginX, y, '(no profile document found)') + 6;
  }

  // --- Quiz history ---
  y = sectionBar(doc, marginX, y, usableWidth, 'QUIZ HISTORY', data.quizHistory.length);
  if (data.quizHistory.length) {
    autoTable(doc, {
      ...tableTheme,
      startY: y,
      head: [['Date', 'Subject', 'Score']],
      body: data.quizHistory.map((h) => [formatTimestamp(h.createdAt), h.mainSubject || '?', `${h.correct ?? '?'}/${h.total ?? '?'}`]),
      columnStyles: { 2: { halign: 'right', cellWidth: 60 } },
    });
    y = doc.lastAutoTable.finalY + 20;
  } else {
    y = emptyNote(doc, marginX, y, '(none)') + 6;
  }

  // --- Wrong / flagged questions (same shape, rendered by a helper) ---
  function questionsTable(title, list) {
    y = sectionBar(doc, marginX, y, usableWidth, title, list.length);
    if (list.length) {
      autoTable(doc, {
        ...tableTheme,
        startY: y,
        head: [['Subject', 'Subtopic', 'Question']],
        body: list.map((q) => [q.mainSubject || '?', q.s || '?', q.q || '(question text missing)']),
        columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 90 } },
      });
      y = doc.lastAutoTable.finalY + 20;
    } else {
      y = emptyNote(doc, marginX, y, '(none)') + 6;
    }
  }
  questionsTable('WRONG QUESTIONS', data.wrongQuestions);
  questionsTable('FLAGGED QUESTIONS', data.flaggedQuestions);

  // --- Friends ---
  y = sectionBar(doc, marginX, y, usableWidth, 'FRIENDS', data.friends.length);
  if (data.friends.length) {
    autoTable(doc, {
      ...tableTheme,
      startY: y,
      head: [['Friend']],
      body: data.friends.map((fr) => [fr.username || fr.displayName || fr.id]),
    });
    y = doc.lastAutoTable.finalY + 20;
  } else {
    y = emptyNote(doc, marginX, y, '(none)') + 6;
  }

  // --- Leaderboard stats ---
  y = sectionBar(doc, marginX, y, usableWidth, 'LEADERBOARD STATS');
  if (data.leaderboard) {
    autoTable(doc, {
      ...tableTheme,
      startY: y,
      head: [['Field', 'Value']],
      body: Object.entries(data.leaderboard).map(([key, value]) => [key, formatValue(value)]),
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 150 } },
    });
    y = doc.lastAutoTable.finalY + 20;
  } else {
    y = emptyNote(doc, marginX, y, '(no leaderboard entry)') + 6;
  }

  // --- Activation codes ---
  y = sectionBar(doc, marginX, y, usableWidth, 'MED101 MAXX ACTIVATION CODES', data.activationCodes.length);
  if (data.activationCodes.length) {
    autoTable(doc, {
      ...tableTheme,
      startY: y,
      head: [['Code', 'Used', 'Duration']],
      body: data.activationCodes.map((c) => [c.id, formatTimestamp(c.usedAt), `${c.durationDays ?? '?'} days`]),
    });
    y = doc.lastAutoTable.finalY + 20;
  } else {
    y = emptyNote(doc, marginX, y, '(none)') + 6;
  }

  // --- Payments ---
  y = sectionBar(doc, marginX, y, usableWidth, 'PAYMENT SUBMISSIONS', data.payments.length);
  if (data.payments.length) {
    autoTable(doc, {
      ...tableTheme,
      startY: y,
      head: [['Date', 'Status', 'Transaction ID']],
      body: data.payments.map((p) => [formatTimestamp(p.createdAt), p.status || '?', p.id]),
    });
    y = doc.lastAutoTable.finalY + 20;
  } else {
    y = emptyNote(doc, marginX, y, '(none)') + 6;
  }

  // --- Rooms / invites (single small info box, no table needed) ---
  y = sectionBar(doc, marginX, y, usableWidth, 'ROOMS HOSTED / INVITES');
  doc.setTextColor(...TEXT_DARK);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Rooms created: ${data.myRoomsCount}`, marginX, y);
  doc.text(`Pending invites: ${data.invitesCount}`, marginX, y + 14);

  // --- Footer on every page: page numbers + confidentiality note ---
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.5);
    doc.line(marginX, pageHeight - 30, pageWidth - marginX, pageHeight - 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Med101 — Confidential data export', marginX, pageHeight - 18);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - marginX, pageHeight - 18, { align: 'right' });
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

// Self-service version of emailDataExportToUser above - any signed-in
// student can call this on themselves (Settings -> "Email My Data")
// to get their own export within seconds, no admin involved. Calls
// api/request-my-data-export.py, which takes the target uid ONLY from
// the verified ID token (never from the request body), so this can
// only ever email the caller their own data.
export async function emailMyDataExport(currentUser) {
  const exportPdfBase64 = (
    await buildUserDataExportPdf(currentUser.uid)
  ).output('datauristring').split(',').slice(1).join(',');

  const idToken = await currentUser.getIdToken();

  const res = await fetch('/api/request-my-data-export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ exportPdfBase64 }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Failed to send (${res.status}).`);
  }

  return data;
}
