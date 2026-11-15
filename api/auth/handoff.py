"""
POST /api/auth/handoff   (Authorization: Bearer <Firebase ID token>)
  ->  {"token": "<Firebase custom token>"}

Used by the sign-in page on auth.med101.space: after a student signs in
there, this checks the login and returns a one-time pass the main site
(med101.space) uses to sign the same student in. Refused when:
  - the switch is off (Admin portal -> Sign-in page),
  - the request does not come from auth.med101.space,
  - the account is an admin (admins sign in directly on med101.space/admin),
  - the student has no Med101 profile, or the account is disabled.

Required env vars (already set for the other endpoints):
  FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
"""
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(__file__))

from firebase_admin import auth as fb_auth, firestore  # noqa: E402
from _fb import ADMIN_EMAILS, init_admin  # noqa: E402

ALLOWED_ORIGINS = {'https://auth.med101.space'}


class handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        payload = json.dumps(body).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
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
        if self.headers.get('Origin') not in ALLOWED_ORIGINS:
            return self._send(403, {'error': 'origin'})

        m = re.match(r'^Bearer\s+(.+)$', self.headers.get('Authorization', ''), re.I)
        if not m:
            return self._send(401, {'error': 'auth'})

        try:
            init_admin()
            db = firestore.client()

            flag = db.collection('config').document('authHandoff').get()
            if not (flag.exists and flag.to_dict().get('enabled') is True):
                return self._send(403, {'error': 'disabled'})

            decoded = fb_auth.verify_id_token(m.group(1), check_revoked=True)
            uid = decoded['uid']
            email = (decoded.get('email') or '').lower()

            if email in {e.lower() for e in ADMIN_EMAILS}:
                return self._send(403, {'error': 'admin'})

            profile = db.collection('users').document(uid).get()
            if not profile.exists:
                return self._send(403, {'error': 'no-profile'})
            if profile.to_dict().get('disabled'):
                return self._send(403, {'error': 'disabled-account'})

            token = fb_auth.create_custom_token(uid)
            if isinstance(token, bytes):
                token = token.decode('utf-8')
            return self._send(200, {'token': token})
        except Exception as e:  # noqa: BLE001
            print('handoff failed:', e)
            return self._send(401, {'error': 'invalid'})
