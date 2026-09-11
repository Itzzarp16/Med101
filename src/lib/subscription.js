import {
  doc, getDoc, setDoc, updateDoc, runTransaction,
  collection, query, where, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from './firebase';

// ── Config (admin-editable UPI ID / price / instructions) ──────────
// Same pattern as homeNotice.js - a single admin-editable doc, read by
// everyone, written only by admin.
export function fmtDate(ts) {
  if (!ts) return '-';
  const ms = ts.toMillis ? ts.toMillis() : ts.seconds * 1000;
  return new Date(ms).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function expiryLabel(codeRow) {
  if (!codeRow.used) return { text: 'Not activated yet', color: 'var(--text3)' };
  if (!codeRow.expiresAt) return { text: '-', color: 'var(--text3)' };
  const daysLeft = Math.ceil(
    (codeRow.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  );
  if (daysLeft < 0) {
    return {
      text: `Expired ${fmtDate({ seconds: codeRow.expiresAt.getTime() / 1000 })}`,
      color: 'var(--red)'
    };
  }
  if (daysLeft === 0) return { text: 'Expires today', color: 'var(--amber)' };
  return {
    text: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`,
    color: daysLeft <= 7 ? 'var(--amber)' : 'var(--green)'
  };
}

export async function getSubscriptionConfig() {
  const snap = await getDoc(doc(db, 'config', 'subscription'));
  return snap.exists() ? snap.data() : null;
}

export async function saveSubscriptionConfig({
  upiId,
  priceLabel,
  qrImageUrl,
  instructions,
  activationMethod
}) {
  await setDoc(
    doc(db, 'config', 'subscription'),
    {
      upiId,
      priceLabel,
      qrImageUrl: qrImageUrl || null,
      instructions: instructions || '',
      activationMethod: activationMethod === 'code' ? 'code' : 'auto',
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// ── Student: submit a payment for admin review ──────────────────────
export async function submitPaymentRequest({
  uid,
  email,
  displayName,
  bankingName,
  phone,
  utr
}) {
  const cleanUtr = utr.trim();

  if (!cleanUtr) {
    throw new Error('Please enter the transaction ID (UTR).');
  }

  const ref = doc(db, 'paymentRequests', cleanUtr);
  const existing = await getDoc(ref).catch(() => null);

  if (existing?.exists()) {
    throw new Error(
      'This transaction ID has already been submitted. If this is a mistake, contact support.'
    );
  }

  await setDoc(ref, {
    uid,
    email,
    displayName: displayName || '',
    bankingName: bankingName || '',
    phone: phone || '',
    status: 'pending',
    createdAt: serverTimestamp(),
  });

  // Telegram notification
  const idToken = await auth.currentUser?.getIdToken();

  if (idToken) {
    const response = await fetch('/api/telegram/payment-submission', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        utr: cleanUtr,
        displayName: displayName || '',
        bankingName: bankingName || '',
        phone: phone || '',
      }),
    });

    if (!response.ok) {
      console.warn(
        'Telegram notification was not sent:',
        await response.text().catch(() => '')
      );
    }
  }

  return cleanUtr;
}

export async function getMyPaymentRequests(uid) {
  const q = query(
    collection(db, 'paymentRequests'),
    where('uid', '==', uid)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ utr: d.id, ...d.data() }));
}

export async function getPendingPaymentRequests() {
  const q = query(
    collection(db, 'paymentRequests'),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ utr: d.id, ...d.data() }));
}

export async function getAllActivationCodes() {
  const snap = await getDocs(collection(db, 'activationCodes'));
  const codes = snap.docs.map((d) => ({ code: d.id, ...d.data() }));

  codes.sort(
    (a, b) =>
      (b.createdAt?.toMillis?.() || 0) -
      (a.createdAt?.toMillis?.() || 0)
  );

  const uniqueUids = [...new Set(codes.map((c) => c.uid))];

  const userDocs = await Promise.all(
    uniqueUids.map((uid) =>
      getDoc(doc(db, 'users', uid)).catch(() => null)
    )
  );

  const userByUid = {};

  uniqueUids.forEach((uid, i) => {
    userByUid[uid] = userDocs[i]?.exists()
      ? userDocs[i].data()
      : null;
  });

  const uniqueUtrs = [
    ...new Set(codes.map((c) => c.utr).filter(Boolean))
  ];

  const reqDocs = await Promise.all(
    uniqueUtrs.map((utr) =>
      getDoc(doc(db, 'paymentRequests', utr)).catch(() => null)
    )
  );

  const reqByUtr = {};

  uniqueUtrs.forEach((utr, i) => {
    reqByUtr[utr] = reqDocs[i]?.exists()
      ? reqDocs[i].data()
      : null;
  });

  return codes.map((c) => {
    const student = userByUid[c.uid];
    const request = c.utr ? reqByUtr[c.utr] : null;

    let expiresAt = null;

    if (c.used && c.usedAt && c.durationDays) {
      const usedAtMs = c.usedAt.toMillis
        ? c.usedAt.toMillis()
        : c.usedAt.seconds * 1000;

      expiresAt = new Date(
        usedAtMs + c.durationDays * 24 * 60 * 60 * 1000
      );
    }

    return {
      ...c,
      studentName: student?.displayName || '(unknown)',
      studentEmail: student?.email || '',
      bankingName: request?.bankingName || '',
      phone: request?.phone || '',
      expiresAt,
    };
  });
}

function generateCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);

  crypto.getRandomValues(bytes);

  let code = 'MED-';

  for (let i = 0; i < 8; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }

  return code;
}

export async function approvePaymentRequest(
  utr,
  uid,
  durationDays,
  method = 'auto'
) {
  let code;

  for (let attempt = 0; attempt < 3; attempt++) {
    code = generateCode();

    const codeRef = doc(db, 'activationCodes', code);
    const clash = await getDoc(codeRef);

    if (!clash.exists()) break;

    if (attempt === 2) {
      throw new Error(
        'Could not generate a unique code - try approving again.'
      );
    }
  }

  const now = serverTimestamp();
  const autoActivate = method !== 'code';

  await setDoc(doc(db, 'activationCodes', code), {
    uid,
    utr,
    durationDays,
    used: autoActivate,
    ...(autoActivate ? { usedBy: uid, usedAt: now } : {}),
    createdAt: now,
  });

  await updateDoc(doc(db, 'paymentRequests', utr), {
    status: 'approved',
    durationDays,
    code,
    activationMethod: autoActivate ? 'auto' : 'code',
    reviewedAt: serverTimestamp(),
  });

  return { code, autoActivate };
}

export async function rejectPaymentRequest(utr, reason) {
  await updateDoc(doc(db, 'paymentRequests', utr), {
    status: 'rejected',
    rejectionReason: reason || '',
    reviewedAt: serverTimestamp(),
  });
}

export async function redeemActivationCode(uid, rawCode) {
  const code = rawCode.trim().toUpperCase();
  const ref = doc(db, 'activationCodes', code);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);

    if (!snap.exists()) {
      throw new Error("That code doesn't exist or isn't yours.");
    }

    const data = snap.data();

    if (data.uid !== uid) {
      throw new Error("That code doesn't exist or isn't yours.");
    }

    if (data.used) {
      throw new Error('That code has already been used.');
    }

    tx.update(ref, {
      used: true,
      usedBy: uid,
      usedAt: serverTimestamp()
    });

    return data.durationDays;
  });
}

export async function getMyPremiumStatus(uid) {
  const q = query(
    collection(db, 'activationCodes'),
    where('uid', '==', uid),
    where('used', '==', true)
  );

  const snap = await getDocs(q);
  let latest = null;

  snap.docs.forEach((d) => {
    const data = d.data();

    if (!data.usedAt || !data.durationDays) return;

    const usedAtMs = data.usedAt.toMillis
      ? data.usedAt.toMillis()
      : data.usedAt.seconds * 1000;

    const untilMs =
      usedAtMs + data.durationDays * 24 * 60 * 60 * 1000;

    if (!latest || untilMs > latest) {
      latest = untilMs;
    }
  });

  const premiumUntil = latest ? new Date(latest) : null;

  return {
    isPremium:
      !!premiumUntil && premiumUntil.getTime() > Date.now(),
    premiumUntil
  };
}
