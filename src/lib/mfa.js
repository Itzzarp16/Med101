// Two-step login (TOTP authenticator app) helpers for admin accounts.
//
// Needs "Firebase Authentication with Identity Platform" with TOTP enabled
// as a second factor for the project. Until that is switched on, nothing
// here runs: sign-in never throws auth/multi-factor-auth-required, and the
// enrollment screen explains what is missing.

import {
  getMultiFactorResolver,
  multiFactor,
  TotpMultiFactorGenerator,
} from 'firebase/auth';
import { auth } from './firebase';

const ISSUER = 'Med101 Admin';

export const isMfaRequiredError = (err) => err?.code === 'auth/multi-factor-auth-required';

// Turn the sign-in error into a resolver the UI can ask a code for.
export function resolverFromError(err) {
  return getMultiFactorResolver(auth, err);
}

// Finish a sign-in that stopped at the second step.
export async function completeMfaChallenge(resolver, code) {
  const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  if (!hint) {
    const e = new Error('This account needs a second step that this page does not support.');
    e.code = 'med101/unsupported-second-factor';
    throw e;
  }
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, String(code).replace(/\s+/g, ''));
  return resolver.resolveSignIn(assertion);
}

export function enrolledTotpFactors(user) {
  if (!user) return [];
  return multiFactor(user).enrolledFactors.filter((f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID);
}

// Step 1 of enrollment: new secret + the otpauth:// link for it.
export async function beginTotpEnrollment(user) {
  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  const uri = secret.generateQrCodeUrl(user.email, ISSUER);
  return { secret, uri, key: secret.secretKey };
}

// Step 2: the user types the current 6-digit code from their app.
export async function finishTotpEnrollment(user, secret, code, displayName = 'Authenticator app') {
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, String(code).replace(/\s+/g, ''));
  await multiFactor(user).enroll(assertion, displayName);
}

export async function removeTotp(user, factorUid) {
  await multiFactor(user).unenroll(factorUid);
}

// Friendly text for the errors Firebase gives during these flows.
export function mfaErrorText(err) {
  const map = {
    'auth/invalid-verification-code': 'That code is wrong or has expired. Check the newest code in your app and try again.',
    'auth/code-expired': 'That code has expired. Use the newest code in your app.',
    'auth/requires-recent-login': 'For security, sign out, sign back in, then try again.',
    'auth/unverified-email': 'Verify this account\u2019s email first, then try again.',
    'auth/operation-not-allowed': 'Two-step login is not switched on for this project yet. Enable TOTP under Firebase \u2192 Authentication \u2192 Sign-in method \u2192 Advanced (Identity Platform).',
    'auth/second-factor-already-in-use': 'This authenticator is already added to the account.',
    'auth/too-many-requests': 'Too many attempts. Wait a bit and try again.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return map[err?.code] || err?.message || 'Something went wrong. Please try again.';
}
