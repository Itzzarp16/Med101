"""
Vercel Python serverless function: auto-activates Med101 Maxx for the
caller's own account when their currently enrolled semester's price
(config/subscription.priceLabelsBySemester[semester], falling back to
the shared priceLabel) is a bare zero - e.g. the admin typed "0" or
"00" into Per-Semester Pricing in AdminPaymentsScreen to make that
semester free.

Why this needs a server endpoint at all rather than just writing the
activationCode straight from the client: firestore.rules deliberately
restricts `create` on activationCodes to admin only (see the rules
file's comment on that collection - it's the one thing keeping a
student from just granting themselves premium via dev tools). So even
though "the price is 0" is public, non-sensitive information, actually
issuing the code still has to happen through something that can prove
what the effective price really is - hence this endpoint re-derives
the price server-side from Firestore rather than trusting anything
the client claims about it, then uses the Admin SDK (which bypasses
those rules entirely, same as api/request-my-data-export.py) to write
the code on the student's behalf.

Idempotent: if the student already has a still-valid free-grant code
for this exact semester, this just confirms that instead of stacking
another one - so a student re-opening the Premium screen (which calls
this automatically whenever the effective price is 0) never spams
new codes.

The granted code uses a long (10-year) duration rather than a real
subscription length, since there's no natural "expiry" for a
free semester - if the admin later sets a real price for this
semester, NEW enrollments no longer qualify, but a code already
granted while it was free is not retroactively revoked (matching how
a real one-time free promo would normally be honored).

Required env vars: same as api/request-my-data-export.py -
  FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
"""

import json
import os
import re

from http.server import BaseHTTPRequestHandler

import firebase_admin
from firebase_admin import credentials, auth as fb_auth, firestore

ALLOWED_ORIGINS = {'https://med101.space', 'https://www.med101.space'}

# Free-grant codes don't expire on any meaningful subscription
# schedule - see docstring above for why 10 years is used as an
# effectively-permanent duration instead.
FREE_GRANT_DURATION_DAYS = 3650

# Matches the same "is this label a bare number" check PremiumScreen.jsx
# uses client-side (extractAmount/formatPrice) - only a plain number or
# ₹-prefixed number (e.g. "0", "00", "₹0", "0.00") is ever treated as an
# actual amount; a fuller label like "Contact admin" or "₹299/3 months"
# is never auto-interpreted as free even if it happens to contain a 0.
_BARE_AMOUNT_RE = re.compile(r'^₹?(\d+(\.\d+)?)$')

_app = None


def _init_admin():
    global _app
    if _app is not None:
        return _app
    if firebase_admin._apps:
        _app = firebase_admin.get_app()
        return _app
    private_key = os.environ.get('FIREBASE_PRIVATE_KEY', '').replace('\\n', '\n')
    cred = credentials.Certificate({
        'type': 'service_account',
        'project_id': os.environ.get('FIREBASE_PROJECT_ID'),
        'client_email': os.environ.get('FIREBASE_CLIENT_EMAIL'),
        'private_key': private_key,
        'token_uri': 'https://oauth2.googleapis.com/token',
    })
    _app = firebase_admin.initialize_app(cred)
    return _app


def _extract_amount(label):
    """None if the label isn't a bare number; otherwise the float value."""
    if not label:
        return None
    m = _BARE_AMOUNT_RE.match(label.strip())
    if not m:
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


class handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        payload = json.dumps(body).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        origin = self.headers.get('Origin')
        if origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(204)
        origin = self.headers.get('Origin')
        if origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_POST(self):
        origin = self.headers.get('Origin')
        if origin and origin not in ALLOWED_ORIGINS:
            return self._send(403, {'error': 'Origin not allowed.'})

        auth_header = self.headers.get('Authorization', '')
        m = re.match(r'^Bearer\s+(.+)$', auth_header, re.I)
        if not m:
            return self._send(401, {'error': 'Missing Firebase authentication.'})

        try:
            _init_admin()
            decoded = fb_auth.verify_id_token(m.group(1))
        except Exception as e:
            return self._send(401, {'error': f'Invalid or expired session: {e}'})

        # The uid comes ONLY from the verified token, never the request
        # body - this can only ever act on the caller's own account.
        uid = decoded.get('uid')
        if not uid:
            return self._send(401, {'error': 'Invalid session.'})

        db = firestore.client()

        try:
            user_snap = db.collection('users').document(uid).get()
        except Exception as e:
            return self._send(500, {'error': f'Could not look up your account: {e}'})

        if not user_snap.exists:
            return self._send(404, {'error': 'Account profile not found.'})

        semester = (user_snap.to_dict() or {}).get('enrolledYearSemester') or 'y1s1'

        try:
            config_snap = db.collection('config').document('subscription').get()
        except Exception as e:
            return self._send(500, {'error': f'Could not look up pricing: {e}'})

        config_data = config_snap.to_dict() if config_snap.exists else {}
        per_semester = (config_data or {}).get('priceLabelsBySemester') or {}
        effective_label = per_semester.get(semester) or config_data.get('priceLabel')

        amount = _extract_amount(effective_label)
        if amount is None or amount != 0:
            return self._send(400, {'error': 'This semester is not currently free.'})

        # Idempotent: if a still-valid free grant already exists for
        # this exact semester, just confirm it rather than issuing a
        # second one - the Premium screen calls this automatically
        # whenever the price is 0, so this runs far more than once per
        # student.
        try:
            existing = (
                db.collection('activationCodes')
                .where('uid', '==', uid)
                .where('yearSemester', '==', semester)
                .where('grantedFree', '==', True)
                .where('used', '==', True)
                .get()
            )
        except Exception as e:
            return self._send(500, {'error': f'Could not check existing access: {e}'})

        for doc in existing:
            data = doc.to_dict() or {}
            used_at = data.get('usedAt')
            duration_days = data.get('durationDays')
            # usedAt is a Firestore timestamp (datetime) once read back -
            # compare directly rather than round-tripping through millis.
            if used_at is not None and duration_days:
                import datetime as _dt
                now = _dt.datetime.now(_dt.timezone.utc)
                until = used_at + _dt.timedelta(days=duration_days)
                if until > now:
                    return self._send(200, {'activated': True, 'alreadyActive': True})

        try:
            db.collection('activationCodes').document().set({
                'uid': uid,
                'yearSemester': semester,
                'durationDays': FREE_GRANT_DURATION_DAYS,
                'used': True,
                'usedBy': uid,
                'usedAt': firestore.SERVER_TIMESTAMP,
                'createdAt': firestore.SERVER_TIMESTAMP,
                'grantedFree': True,
            })
        except Exception as e:
            return self._send(500, {'error': f'Could not activate free access: {e}'})

        return self._send(200, {'activated': True, 'alreadyActive': False})
