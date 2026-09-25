import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { formatDuration } from './timeTracking';
import { SEMESTER_ORDER } from './academicCalendar';

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
const PROFILE_SKIP_FIELDS = new Set(['activeDeviceId', 'usernameNormalized', 'photoURL']);

// These two fields exist on every profile but are unreadable if
// dumped through formatValue() like everything else: topicStats is a
// nested per-subtopic stats object that renders as one giant wall of
// raw JSON, and seenQuestions is a list of hundreds of internal
// question IDs with no meaning to a student reading this export.
// Both get pulled out of the generic key/value dump and rendered
// properly instead (topicStats as its own TOPIC PERFORMANCE table,
// seenQuestions as a simple count).
const PROFILE_SPECIAL_FIELDS = new Set(['topicStats', 'seenQuestions']);

// Raw Firestore field names (camelCase) mean nothing to a student
// reading their own data export - every one shown in a Field/Value
// table gets translated through here first. Anything not listed
// falls back to prettifyFieldName's generic camelCase -> Title Case
// conversion, so a field added later never regresses to being
// unreadable again.
const FIELD_LABELS = {
  displayName: 'Display Name',
  email: 'Email',
  username: 'Username',
  enrolledYearSemester: 'Year & Semester',
  enrolledAt: 'Enrolled On',
  lastActiveAt: 'Last Active At',
  lastActiveDate: 'Last Active Date',
  activeDeviceAt: 'Device Last Verified',
  streakCount: 'Current Streak',
  longestStreak: 'Longest Streak',
  totalTimeMs: 'Time Spent on Site',
  topicStatsUpdatedAt: 'Topic Stats Last Updated',
  questionsSeen: 'Questions Seen',
  totalCorrect: 'Total Correct Answers',
  totalAnswered: 'Total Questions Answered',
  accuracyPct: 'Overall Accuracy',
  qualifiedAccuracyPct: 'Overall Accuracy',
  timeMs: 'Total Time Answering',
  updatedAt: 'Last Updated',
};

const SEMESTER_LABELS = {
  y1s1: 'Year 1 · Sem 1',
  y1s2: 'Year 1 · Sem 2',
  y2s1: 'Year 2 · Sem 1',
  y2s2: 'Year 2 · Sem 2',
  y3s1: 'Year 3 · Sem 1',
  y3s2: 'Year 3 · Sem 2',
};

function prettifyFieldName(key) {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

// A few fields have technically-correct but unreadable raw values -
// milliseconds instead of a duration, a percentage with no % sign, a
// semester code like "y1s2" instead of "Year 1 · Sem 2".
function formatFieldValue(key, value) {
  if (key === 'totalTimeMs' || key === 'timeMs') return formatDuration(value || 0);
  if (key === 'accuracyPct' || key === 'qualifiedAccuracyPct') return value != null ? `${value}%` : '(none)';
  if (key === 'enrolledYearSemester') return SEMESTER_LABELS[value] || formatValue(value);
  return formatValue(value);
}

function topicPerformanceRows(topicStats) {
  if (!topicStats || typeof topicStats !== 'object') return [];
  return Object.entries(topicStats)
    .map(([subtopic, s]) => ({
      subject: s?.mainSubject || '?',
      subtopic,
      answered: s?.answered || 0,
      correct: s?.correct || 0,
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject) || a.subtopic.localeCompare(b.subtopic));
}

// Every profile field EXCEPT the two special-cased ones above, with
// a human label and a readable value - plus a friendly "Questions
// Seen: <count>" row standing in for the raw ID list.
function profileDisplayRows(profile) {
  const rows = [];
  for (const [key, value] of Object.entries(profile)) {
    if (PROFILE_SKIP_FIELDS.has(key) || PROFILE_SPECIAL_FIELDS.has(key)) continue;
    rows.push([prettifyFieldName(key), formatFieldValue(key, value)]);
  }
  if (Array.isArray(profile.seenQuestions)) {
    rows.push([prettifyFieldName('questionsSeen'), String(profile.seenQuestions.length)]);
  }
  return rows;
}

// leaderboard/{uid} has the same problem as topicStats did: semesters
// and subjects are nested per-scope breakdown objects that would
// otherwise dump as raw JSON. Pulled out into their own readable
// tables instead, same treatment as Topic Performance above.
const LEADERBOARD_SKIP_FIELDS = new Set(['photoURL']);
const LEADERBOARD_SPECIAL_FIELDS = new Set(['semesters', 'subjects']);

function leaderboardDisplayRows(lb) {
  const rows = [];
  for (const [key, value] of Object.entries(lb)) {
    if (LEADERBOARD_SKIP_FIELDS.has(key) || LEADERBOARD_SPECIAL_FIELDS.has(key)) continue;
    rows.push([prettifyFieldName(key), formatFieldValue(key, value)]);
  }
  return rows;
}

function semesterBreakdownRows(semesters) {
  if (!semesters || typeof semesters !== 'object') return [];
  return Object.entries(semesters)
    .map(([id, s]) => ({
      id,
      label: SEMESTER_LABELS[id] || id,
      answered: s?.totalAnswered || 0,
      correct: s?.totalCorrect || 0,
      accuracyPct: s?.accuracyPct ?? 0,
      timeMs: s?.timeMs || 0,
    }))
    .sort((a, b) => SEMESTER_ORDER.indexOf(a.id) - SEMESTER_ORDER.indexOf(b.id));
}

function subjectBreakdownRows(subjects) {
  if (!subjects || typeof subjects !== 'object') return [];
  return Object.entries(subjects)
    .map(([name, s]) => ({
      label: name,
      answered: s?.totalAnswered || 0,
      correct: s?.totalCorrect || 0,
      accuracyPct: s?.accuracyPct ?? 0,
      timeMs: s?.timeMs || 0,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}


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
    for (const [key, value] of profileDisplayRows(data.profile)) {
      push(`${key}: ${value}`);
    }
  } else {
    push('(no profile document found)');
  }
  push('');

  const topicRows = topicPerformanceRows(data.profile?.topicStats);
  push(`== TOPIC PERFORMANCE (${topicRows.length}) ==`);
  if (topicRows.length) {
    for (const t of topicRows) {
      const pct = t.answered ? Math.round((t.correct / t.answered) * 100) : 0;
      push(`- [${t.subject}] ${t.subtopic}: ${t.correct}/${t.answered} correct (${pct}%)`);
    }
  } else {
    push('(none)');
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
    for (const [label, value] of leaderboardDisplayRows(data.leaderboard)) {
      push(`${label}: ${value}`);
    }
    const semRows = semesterBreakdownRows(data.leaderboard.semesters);
    if (semRows.length) {
      push('-- By Semester --');
      for (const r of semRows) {
        push(`- ${r.label}: ${r.correct}/${r.answered} correct (${r.accuracyPct}%), ${formatDuration(r.timeMs)}`);
      }
    }
    const subjRows = subjectBreakdownRows(data.leaderboard.subjects);
    if (subjRows.length) {
      push('-- By Subject --');
      for (const r of subjRows) {
        push(`- ${r.label}: ${r.correct}/${r.answered} correct (${r.accuracyPct}%), ${formatDuration(r.timeMs)}`);
      }
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
const TEXT_DARK = [30, 41, 59];
const TEXT_MUTED = [100, 116, 139];
const RULE_LIGHT = [203, 213, 225];
const HEADER_FILL = [241, 245, 249];

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Fetches the same Syne ExtraBold font the site's own "Med101"
// wordmark uses (tokens.css: .topbar-logo, font-family 'Syne',
// weight 800) and registers it with jsPDF, so the PDF header can use
// the real wordmark font instead of approximating it with Helvetica.
// Returns true/false rather than throwing, so a failed font fetch
// just falls back to Helvetica instead of breaking the export.
async function loadSyneFont(doc) {
  try {
    const res = await fetch('/fonts/Syne-ExtraBold.ttf');
    if (!res.ok) return false;
    const base64 = arrayBufferToBase64(await res.arrayBuffer());
    doc.addFileToVFS('Syne-ExtraBold.ttf', base64);
    doc.addFont('Syne-ExtraBold.ttf', 'Syne', 'bold');
    return true;
  } catch {
    return false;
  }
}

// A formal ruled heading instead of a colored pill: bold small-caps-
// style text with a thin rule underneath, the way a printed report
// or legal document sets off its sections - not a filled colored bar.
function sectionBar(doc, x, y, width, title, count) {
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const label = count != null ? `${title} (${count})` : title;
  doc.text(label, x, y + 10);
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1);
  doc.line(x, y + 16, x + width, y + 16);
  return y + 28;
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
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 8, right: 8 }, textColor: TEXT_DARK, lineColor: RULE_LIGHT, lineWidth: 0.5 },
    headStyles: { fontStyle: 'bold', textColor: NAVY, fillColor: HEADER_FILL, lineColor: RULE_LIGHT, lineWidth: 0.5 },
    margin: { left: marginX, right: marginX },
  };

  // --- Letterhead (page 1 only): plain white background, not a
  // filled color banner - a printed report doesn't have a solid
  // color block across the top, just a logo/wordmark and a rule. ---
  const bannerHeight = 86;
  doc.setTextColor(...NAVY);

  // Embed the actual app logo (same image used for the Google OAuth
  // branding) rather than just styling text to look logo-like -
  // falls back to text-only if it can't be fetched for any reason,
  // so a network hiccup never breaks the whole export.
  let textStartX = marginX;
  try {
    const logoRes = await fetch('/icon-512.png');
    const logoBytes = new Uint8Array(await logoRes.arrayBuffer());
    const logoSize = 46;
    doc.addImage(logoBytes, 'PNG', marginX, 14, logoSize, logoSize);
    textStartX = marginX + logoSize + 14;
  } catch {
    // no logo available - text-only header below still works fine
  }

  // Match the site's actual wordmark (tokens.css .topbar-logo: 'Syne'
  // at weight 800) rather than approximating it with bold Helvetica -
  // falls back to Helvetica Bold if the font can't be fetched.
  const hasSyne = await loadSyneFont(doc);
  doc.setFont(hasSyne ? 'Syne' : 'helvetica', 'bold');
  doc.setFontSize(hasSyne ? 22 : 20);
  doc.text('Med101', textStartX, 34);

  // Tagline directly under the wordmark, matching .topbar-tagline:
  // small, letter-spaced, uppercase, muted.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('LEARN. PRACTICE. IMPROVE.', textStartX, 48, { charSpace: 1.1 });

  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  {
    // jsPDF's align:'right' doesn't account for charSpace when
    // measuring text width, so combining them overflows past the
    // intended right margin - approximate the letter-spaced width by
    // hand instead and left-align at the resulting position.
    const label = 'PERSONAL DATA EXPORT';
    const charSpaceVal = 0.5;
    const approxWidth = doc.getTextWidth(label) + charSpaceVal * (label.length - 1);
    doc.text(label, pageWidth - marginX - approxWidth, 22, { charSpace: charSpaceVal });
  }
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_MUTED);
  doc.setFontSize(8.5);
  const genLabel = `Generated: ${data.generatedAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`;
  doc.text(genLabel, pageWidth - marginX, 38, { align: 'right' });
  doc.text(`Account UID: ${uid}`, pageWidth - marginX, 52, { align: 'right' });

  // A double rule under the letterhead - a thicker navy line with a
  // thin gray hairline just beneath it - the way a formal letterhead
  // or report cover separates its header block from the body.
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1.5);
  doc.line(marginX, bannerHeight, pageWidth - marginX, bannerHeight);
  doc.setDrawColor(...RULE_LIGHT);
  doc.setLineWidth(0.5);
  doc.line(marginX, bannerHeight + 3, pageWidth - marginX, bannerHeight + 3);

  let y = bannerHeight + 22;

  // --- Explanatory note (plain text, no colored box) ---
  doc.setTextColor(...TEXT_MUTED);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.text(
    'This is everything Med101 stores about this account, compiled in response to a data access request (see Section 6 of the Privacy Policy).',
    marginX,
    y,
    { maxWidth: usableWidth }
  );
  y += 26;

  // --- Profile (2-column key/value table) ---
  y = sectionBar(doc, marginX, y, usableWidth, 'PROFILE');
  if (data.profile) {
    autoTable(doc, {
      ...tableTheme,
      startY: y,
      head: [['Field', 'Value']],
      body: profileDisplayRows(data.profile),
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 150 } },
    });
    y = doc.lastAutoTable.finalY + 20;
  } else {
    y = emptyNote(doc, marginX, y, '(no profile document found)') + 6;
  }

  // --- Topic performance (readable table instead of the raw
  // topicStats JSON blob that used to be dumped in the Profile table) ---
  const topicRows = topicPerformanceRows(data.profile?.topicStats);
  y = sectionBar(doc, marginX, y, usableWidth, 'TOPIC PERFORMANCE', topicRows.length);
  if (topicRows.length) {
    autoTable(doc, {
      ...tableTheme,
      startY: y,
      head: [['Subject', 'Subtopic', 'Answered', 'Correct', 'Accuracy']],
      body: topicRows.map((t) => [
        t.subject,
        t.subtopic,
        String(t.answered),
        String(t.correct),
        t.answered ? `${Math.round((t.correct / t.answered) * 100)}%` : '-',
      ]),
      columnStyles: { 2: { halign: 'right', cellWidth: 65 }, 3: { halign: 'right', cellWidth: 55 }, 4: { halign: 'right', cellWidth: 65 } },
    });
    y = doc.lastAutoTable.finalY + 20;
  } else {
    y = emptyNote(doc, marginX, y, '(none)') + 6;
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
      body: leaderboardDisplayRows(data.leaderboard),
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 150 } },
    });
    y = doc.lastAutoTable.finalY + 20;

    function breakdownTable(title, rows, firstColLabel) {
      y = sectionBar(doc, marginX, y, usableWidth, title, rows.length);
      if (rows.length) {
        autoTable(doc, {
          ...tableTheme,
          startY: y,
          head: [[firstColLabel, 'Answered', 'Correct', 'Accuracy', 'Time Spent']],
          body: rows.map((r) => [r.label, String(r.answered), String(r.correct), `${r.accuracyPct}%`, formatDuration(r.timeMs)]),
          columnStyles: { 1: { halign: 'right', cellWidth: 65 }, 2: { halign: 'right', cellWidth: 55 }, 3: { halign: 'right', cellWidth: 60 }, 4: { halign: 'right', cellWidth: 70 } },
        });
        y = doc.lastAutoTable.finalY + 20;
      } else {
        y = emptyNote(doc, marginX, y, '(none)') + 6;
      }
    }
    breakdownTable('LEADERBOARD — BY SEMESTER', semesterBreakdownRows(data.leaderboard.semesters), 'Semester');
    breakdownTable('LEADERBOARD — BY SUBJECT', subjectBreakdownRows(data.leaderboard.subjects), 'Subject');
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
  y += 40;

  // --- Closing note: flows right after the last section like any
  // other block, rather than being stranded alone on its own mostly-
  // empty page - only breaks to a fresh page if there genuinely isn't
  // room left, the same rule a real report would follow. ---
  const closingBlockHeight = 110;
  const pageHeightNow = doc.internal.pageSize.getHeight();
  if (y + closingBlockHeight > pageHeightNow - 50) {
    doc.addPage();
    y = 50;
  }

  doc.setDrawColor(...RULE_LIGHT);
  doc.setLineWidth(0.5);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 22;

  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Thank You', marginX, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(
    'Thank you for being part of the Med101 community and trusting us with your learning journey.',
    marginX,
    y + 15,
    { maxWidth: usableWidth }
  );
  y += 46;

  doc.setFont(hasSyne ? 'Syne' : 'helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.setFontSize(hasSyne ? 17 : 15);
  doc.text('Med101', pageWidth - marginX, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...TEXT_MUTED);
  {
    const tagline = 'LEARN. PRACTICE. IMPROVE.';
    const charSpaceVal = 1.1;
    const taglineWidth = doc.getTextWidth(tagline) + charSpaceVal * (tagline.length - 1);
    doc.text(tagline, pageWidth - marginX - taglineWidth, y + 12, { charSpace: charSpaceVal });
  }

  // --- Footer on every page: page numbers + confidentiality note ---
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...RULE_LIGHT);
    doc.setLineWidth(0.5);
    doc.line(marginX, pageHeight - 30, pageWidth - marginX, pageHeight - 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Med101 - Confidential data export', marginX, pageHeight - 18);
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
