import {
  doc, getDoc, setDoc, updateDoc, runTransaction,
  collection, query, where, getDocs, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// ── Config (admin-editable UPI ID / price / instructions) ──────────
// Same pattern as homeNotice.js - a single admin-editable doc, read by
// everyone, written only by admin.
export async function getSubscriptionConfig() {
  const snap = await getDoc(doc(db, 'config', 'subscription'));
  return snap.exists() ? snap.data() : null;
}

export async function saveSubscriptionConfig({ upiId, priceLabel, qrImageUrl, instructions }) {
  await setDoc(
    doc(db, 'config', 'subscription'),
    { upiId, priceLabel, qrImageUrl: qrImageUrl || null, instructions: instructions || '', updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// ── Student: submit a payment for admin review ──────────────────────
// Doc ID is the UTR itself - see firestore.rules for why that's what
// blocks a duplicate submission of the same transaction.
export async function submitPaymentRequest({ uid, email, displayName, bankingName, phone, utr }) {
  const cleanUtr = utr.trim();
  if (!cleanUtr) throw new Error('Please enter the transaction ID (UTR).');
  const ref = doc(db, 'paymentRequests', cleanUtr);
  const existing = await getDoc(ref).catch(() => null);
  if (existing?.exists()) {
    throw new Error('This transaction ID has already been submitted. If this is a mistake, contact support.');
  }
  await setDoc(ref, {
    uid, email, displayName: displayName || '', bankingName: bankingName || '',
    phone: phone || '',
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  return cleanUtr;
}

// Watches this student's own submitted requests (so they can see
// "pending" / "approved" / "rejected" without needing admin to message
// them separately). Small collection per student in practice.
export async function getMyPaymentRequests(uid) {
  const q = query(collection(db, 'paymentRequests'), where('uid', '==', uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ utr: d.id, ...d.data() }));
}

// ── Admin: review queue ──────────────────────────────────────────
export async function getPendingPaymentRequests() {
  const q = query(collection(db, 'paymentRequests'), where('status', '==', 'pending'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ utr: d.id, ...d.data() }));
}

// ── Admin: every code ever issued, with who it belongs to ──────────
// Distinct from getPendingPaymentRequests (the review queue) - this
// is the historical record: who's been given a code, when, whether
// they've redeemed it yet, and when their access runs out. uid is on
// every code regardless of how old it is, so we look up each
// student's name/email from their own user doc rather than embedding
// it on the code at issue time - one lookup per distinct student
// (not per code), and it stays correct even if they change their
// display name later.
export async function getAllActivationCodes() {
  const snap = await getDocs(collection(db, 'activationCodes'));
  const codes = snap.docs.map((d) => ({ code: d.id, ...d.data() }));
  codes.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

  const uniqueUids = [...new Set(codes.map((c) => c.uid))];
  const userDocs = await Promise.all(uniqueUids.map((uid) => getDoc(doc(db, 'users', uid)).catch(() => null)));
  const userByUid = {};
  uniqueUids.forEach((uid, i) => { userByUid[uid] = userDocs[i]?.exists() ? userDocs[i].data() : null; });

  return codes.map((c) => {
    const student = userByUid[c.uid];
    let expiresAt = null;
    if (c.used && c.usedAt && c.durationDays) {
      const usedAtMs = c.usedAt.toMillis ? c.usedAt.toMillis() : c.usedAt.seconds * 1000;
      expiresAt = new Date(usedAtMs + c.durationDays * 24 * 60 * 60 * 1000);
    }
    return {
      ...c,
      studentName: student?.displayName || '(unknown)',
      studentEmail: student?.email || '',
      expiresAt,
    };
  });
}

function generateCode() {
  // 8 chars from an unambiguous alphabet (no 0/O/1/I) - readable over
  // a phone call or a blurry WhatsApp screenshot, still ~40 bits of
  // entropy (36^8), which is already moot as a guessing target since
  // the security rule also requires the code to belong to the reader's
  // own uid regardless.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let code = 'MED-';
  for (let i = 0; i < 8; i++) code += alphabet[bytes[i] % alphabet.length];
  return code;
}

// Approving a request creates the activation code (admin-only per
// rules) and marks the request approved with the duration chosen and
// the code issued, so it's all visible together in the admin queue's
// history. Retries on the astronomically unlikely chance of a code
// collision.
export async function approvePaymentRequest(utr, uid, durationDays) {
  let code;
  for (let attempt = 0; attempt < 3; attempt++) {
    code = generateCode();
    const codeRef = doc(db, 'activationCodes', code);
    const clash = await getDoc(codeRef);
    if (!clash.exists()) break;
    if (attempt === 2) throw new Error('Could not generate a unique code - try approving again.');
  }
  await setDoc(doc(db, 'activationCodes', code), {
    uid, utr, durationDays,
    used: false,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'paymentRequests', utr), {
    status: 'approved',
    durationDays,
    code,
    reviewedAt: serverTimestamp(),
  });
  return code;
}

export async function rejectPaymentRequest(utr, reason) {
  await updateDoc(doc(db, 'paymentRequests', utr), {
    status: 'rejected',
    rejectionReason: reason || '',
    reviewedAt: serverTimestamp(),
  });
}

// ── Student: redeem a code ──────────────────────────────────────────
// A transaction so two attempts to redeem the same code (e.g. a
// double-tap) can't both succeed - the security rule's own
// resource.data.used == false precondition backs this up too, but the
// transaction also gives us a clean "already used" error to show.
export async function redeemActivationCode(uid, rawCode) {
  const code = rawCode.trim().toUpperCase();
  const ref = doc(db, 'activationCodes', code);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('That code doesn\'t exist or isn\'t yours.');
    const data = snap.data();
    if (data.uid !== uid) throw new Error('That code doesn\'t exist or isn\'t yours.');
    if (data.used) throw new Error('That code has already been used.');
    tx.update(ref, { used: true, usedBy: uid, usedAt: serverTimestamp() });
    return data.durationDays;
  });
}

// ── Student: current premium status ─────────────────────────────────
// Deliberately derived from redeemed codes rather than a stored field -
// see firestore.rules for why. Supports stacking renewals correctly:
// if they redeem a new code before an old one's coverage ends, the
// effective expiry is the LATEST (usedAt + durationDays) across all of
// their used codes, not just the most recent redemption.
export async function getMyPremiumStatus(uid) {
  const q = query(collection(db, 'activationCodes'), where('uid', '==', uid), where('used', '==', true));
  const snap = await getDocs(q);
  let latest = null;
  snap.docs.forEach((d) => {
    const data = d.data();
    if (!data.usedAt || !data.durationDays) return;
    const usedAtMs = data.usedAt.toMillis ? data.usedAt.toMillis() : data.usedAt.seconds * 1000;
    const untilMs = usedAtMs + data.durationDays * 24 * 60 * 60 * 1000;
    if (!latest || untilMs > latest) latest = untilMs;
  });
  const premiumUntil = latest ? new Date(latest) : null;
  return { isPremium: !!premiumUntil && premiumUntil.getTime() > Date.now(), premiumUntil };
}
