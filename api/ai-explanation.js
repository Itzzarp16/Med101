// Vercel serverless endpoint for AI-generated question explanations.
// Uses the Firebase Admin SDK (service account) since aiExplanations/
// aiUsage are locked to `allow read, write: if false` in firestore.rules -
// deliberately server-only, so a student's own ID token can't read/write
// them directly the way api/telegram/payment-submission.js does for
// student-owned data. See GEMINI_SETUP.md for the required env vars.

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';

function initAdmin() {
  if (getApps().length) return;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

function json(res, status, body) {
  return res.status(status).json(body);
}

function questionCacheId({ subject, subtopic, question, options, correctIndex }) {
  const normalized = JSON.stringify({ subject, subtopic, question, options, correctIndex });
  return createHash('sha256').update(normalized).digest('hex').slice(0, 40);
}

async function isPremiumOrPaused(db, uid) {
  const configSnap = await db.doc('config/subscription').get();
  if (configSnap.data()?.premiumPaused) return true;

  const codesSnap = await db
    .collection('activationCodes')
    .where('uid', '==', uid)
    .where('used', '==', true)
    .get();

  let latestUntilMs = null;
  codesSnap.forEach((d) => {
    const data = d.data();
    if (!data.usedAt || !data.durationDays) return;
    const usedAtMs = data.usedAt.toMillis ? data.usedAt.toMillis() : data.usedAt._seconds * 1000;
    const untilMs = usedAtMs + data.durationDays * 24 * 60 * 60 * 1000;
    if (!latestUntilMs || untilMs > latestUntilMs) latestUntilMs = untilMs;
  });

  return !!latestUntilMs && latestUntilMs > Date.now();
}

// Anti-abuse: refuse to generate an explanation for anything that isn't
// actually one of Med101's own questions, so this endpoint can't be used
// as a free-form "ask Gemini anything" proxy. Fetches the same static
// JSON the app itself serves questions from.
async function questionExistsInBank(req, { subtopic, question, options, correctIndex }) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'med101.space';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  // TODO: extend this list if/when more semester data files are added
  // (see SEMESTER_MANIFEST in src/lib/useSemesterData.js).
  const files = ['y1s2'];

  for (const id of files) {
    try {
      const bankRes = await fetch(`${proto}://${host}/data/${id}.json`);
      if (!bankRes.ok) continue;
      const bank = await bankRes.json();
      const found = (bank.questions || []).some((q) =>
        q.s === subtopic &&
        q.q === question &&
        q.c === correctIndex &&
        Array.isArray(q.o) &&
        q.o.length === options.length &&
        q.o.every((opt, i) => opt === options[i])
      );
      if (found) return true;
    } catch {
      // try the next file
    }
  }
  return false;
}

async function generateExplanation({ subject, subtopic, question, options, correctIndex }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

  const labeled = options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join('\n');
  const correctLetter = String.fromCharCode(65 + correctIndex);

  const prompt = [
    'You are a medical school tutor helping a student understand a quiz question they just answered.',
    subject ? `Subject: ${subject}` : null,
    subtopic ? `Topic: ${subtopic}` : null,
    `Question: ${question}`,
    `Options:\n${labeled}`,
    `Correct answer: ${correctLetter}. ${options[correctIndex]}`,
    '',
    'Write a clear, concise explanation (3-5 sentences) of why this is the correct answer, referencing the key medical concept involved. Briefly note why the most tempting wrong option (if any) is incorrect. Plain text only, no markdown formatting, no restating the question verbatim.',
  ].filter(Boolean).join('\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
      }),
    }
  );

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Gemini request failed (${response.status}): ${errBody.slice(0, 200)}`);
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim();
  if (!text) throw new Error('Gemini returned an empty explanation.');
  return { text, model };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  const origin = req.headers.origin;
  if (origin && !['https://med101.space', 'https://www.med101.space'].includes(origin)) {
    return json(res, 403, { error: 'Origin not allowed.' });
  }

  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return json(res, 401, { error: 'Missing Firebase authentication.' });

  try {
    initAdmin();
    const idToken = match[1];
    const decoded = await getAuth().verifyIdToken(idToken);
    const uid = decoded.uid;
    const db = getFirestore();

    const { subject, subtopic, question, options, correctIndex } = req.body || {};
    if (!question || !Array.isArray(options) || options.length < 2 || typeof correctIndex !== 'number') {
      return json(res, 400, { error: 'Missing or invalid question data.' });
    }

    const allowed = await isPremiumOrPaused(db, uid);
    if (!allowed) return json(res, 403, { error: 'AI explanations are a Premium feature.' });

    const validQuestion = await questionExistsInBank(req, { subtopic, question, options, correctIndex });
    if (!validQuestion) return json(res, 400, { error: 'Question does not match the Med101 question bank.' });

    const cacheId = questionCacheId({ subject, subtopic, question, options, correctIndex });
    const cacheRef = db.doc(`aiExplanations/${cacheId}`);
    const cacheSnap = await cacheRef.get();
    if (cacheSnap.exists) {
      return json(res, 200, { explanation: cacheSnap.data().explanation, cached: true });
    }

    const dailyLimit = parseInt(process.env.GEMINI_DAILY_GENERATION_LIMIT || '50', 10);
    const today = new Date().toISOString().slice(0, 10);
    const usageRef = db.doc(`aiUsage/${uid}_${today}`);
    const usageSnap = await usageRef.get();
    if ((usageSnap.data()?.count || 0) >= dailyLimit) {
      return json(res, 429, { error: `Daily AI explanation limit (${dailyLimit}) reached - try again tomorrow.` });
    }

    const { text: explanation, model } = await generateExplanation({ subject, subtopic, question, options, correctIndex });

    await cacheRef.set({
      explanation,
      model,
      subject: subject || null,
      subtopic: subtopic || null,
      createdAt: FieldValue.serverTimestamp(),
    });
    await usageRef.set(
      { count: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    return json(res, 200, { explanation, cached: false });
  } catch (error) {
    console.error('AI explanation error:', error);
    return json(res, 500, { error: error.message || 'Could not generate an explanation.' });
  }
}
