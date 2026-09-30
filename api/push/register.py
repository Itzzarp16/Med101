"""
Vercel Python serverless function: saves (or removes) the signed-in
student's push-notification token so api/push/send-invite.py can reach
their phone/browser later.

The token is written with the Admin SDK to users/{uid}/pushTokens/{id},
where uid comes ONLY from the verified Firebase ID token - so nobody can
register a device against someone else's account, and no Firestore rule
changes are needed for this feature.

Body: {"action": "register" | "unregister", "token": "<FCM token>"}
Env vars (already set for the other endpoints):
  FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
"""

import hashlib
import json
import os
import re

from http.server import BaseHTTPRequestHandler

import firebase_admin
from firebase_admin import credentials, auth as fb_auth, firestore

ALLOWED_ORIGINS = {'https://med101.space', 'https://www.med101.space'}
MAX_TOKENS_PER_USER = 8  # phone + tablet + a couple of browsers; oldest are dropped

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
        uid = decoded['uid']

        try:
            length = int(self.headers.get('Content-Length', 0))
            payload = json.loads((self.rfile.read(length) if length else b'') or b'{}')
        except Exception as e:
            return self._send(400, {'error': f'Invalid request body: {e}'})

        token = (payload.get('token') or '').strip()
        action = payload.get('action') or 'register'
        if not token or len(token) > 4096:
            return self._send(400, {'error': 'Missing or invalid token.'})

        db = firestore.client()
        col = db.collection('users').document(uid).collection('pushTokens')
        doc_id = hashlib.sha256(token.encode('utf-8')).hexdigest()[:40]

        try:
            if action == 'unregister':
                col.document(doc_id).delete()
                return self._send(200, {'ok': True})

            col.document(doc_id).set({
                'token': token,
                'userAgent': (self.headers.get('User-Agent') or '')[:200],
                'updatedAt': firestore.SERVER_TIMESTAMP,
            })
            # Keep the list small: drop the least-recently-updated extras.
            docs = sorted(col.stream(), key=lambda d: (d.to_dict() or {}).get('updatedAt') or 0)
            for extra in docs[:-MAX_TOKENS_PER_USER]:
                extra.reference.delete()
        except Exception as e:
            return self._send(500, {'error': f'Could not save token: {e}'})

        return self._send(200, {'ok': True})
