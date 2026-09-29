"""
Vercel Python serverless function: permanently deletes a student's
account - the Firebase Authentication login AND every Firestore doc
that belongs to them - which the browser can't do on its own (deleting
an Auth user needs the Admin SDK).

Removes: the Firebase Auth user, users/{uid} and all its subcollections,
leaderboard/{uid}, presence/{uid}, and their usernames/{name} claim
(only if it still points at this uid). Payment/activation records are
deliberately left alone - they're financial history, not profile data.

Admin-gated exactly like api/admin/email-data-export.py: needs a valid
Firebase ID token whose email is in ADMIN_EMAILS. An admin can't delete
their own account or another admin's through this endpoint.

Required env vars (already set for the other endpoints):
  FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
"""

import json
import os
import re

from http.server import BaseHTTPRequestHandler

import firebase_admin
from firebase_admin import credentials, auth as fb_auth, firestore

# Must exactly match ADMIN_EMAILS in src/lib/AuthContext.jsx,
# api/upload-questions.py, api/admin/email-data-export.py and isAdmin()
# in firestore.rules - keep all of them in sync by hand.
ADMIN_EMAILS = {
    'admin.med101@gmail.com',
    'admin1.med101@gmail.com',
    'admin2.med101@gmail.com',
}

ALLOWED_ORIGINS = {'https://med101.space', 'https://www.med101.space'}

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

        m = re.match(r'^Bearer\s+(.+)$', self.headers.get('Authorization', ''), re.I)
        if not m:
            return self._send(401, {'error': 'Missing Firebase authentication.'})

        try:
            _init_admin()
            decoded = fb_auth.verify_id_token(m.group(1))
        except Exception as e:
            return self._send(401, {'error': f'Invalid or expired session: {e}'})

        if decoded.get('email') not in ADMIN_EMAILS:
            return self._send(403, {'error': 'Admin access required.'})

        try:
            length = int(self.headers.get('Content-Length', 0))
            payload = json.loads((self.rfile.read(length) if length else b'') or b'{}')
        except Exception as e:
            return self._send(400, {'error': f'Invalid request body: {e}'})

        uid = (payload.get('uid') or '').strip()
        if not uid:
            return self._send(400, {'error': 'Missing uid.'})
        if uid == decoded.get('uid'):
            return self._send(400, {'error': "You can't delete your own account here."})

        db = firestore.client()
        user_ref = db.collection('users').document(uid)
        snap = user_ref.get()
        data = snap.to_dict() if snap.exists else {}

        target_email = data.get('email')
        if not target_email:
            try:
                target_email = fb_auth.get_user(uid).email
            except Exception:
                target_email = None
        if target_email in ADMIN_EMAILS:
            return self._send(403, {'error': "Admin accounts can't be deleted here."})

        try:
            db.recursive_delete(user_ref)  # users/{uid} + every subcollection
            db.collection('leaderboard').document(uid).delete()
            db.collection('presence').document(uid).delete()
            username = data.get('username')
            if username:
                claim_ref = db.collection('usernames').document(username)
                claim = claim_ref.get()
                if claim.exists and (claim.to_dict() or {}).get('uid') == uid:
                    claim_ref.delete()
            try:
                fb_auth.delete_user(uid)
            except fb_auth.UserNotFoundError:
                pass  # login already gone - fine
        except Exception as e:
            return self._send(500, {'error': f'Delete failed: {e}'})

        return self._send(200, {'ok': True})
