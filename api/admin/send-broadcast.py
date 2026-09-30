"""
Vercel Python serverless function: admin sends a push notification to
EVERY student who has turned notifications on.

Admin-gated like api/admin/delete-account.py: needs a valid Firebase ID
token whose email is in ADMIN_EMAILS. Title/body come from the admin's
form; delivery goes to every doc in the pushTokens collection group
(written by api/push/register.py).

Body: {"title": "...", "body": "...", "url": "/", "dryRun": true|false}
  dryRun=true only counts devices, so the admin sees the reach before sending.
Env vars (already set): FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
"""

import json
import os
import re
import time

from http.server import BaseHTTPRequestHandler

import firebase_admin
from firebase_admin import credentials, auth as fb_auth, firestore, messaging

# Keep in sync with the other admin endpoints / AuthContext.jsx / firestore.rules.
ADMIN_EMAILS = {
    'admin.med101@gmail.com',
    'admin1.med101@gmail.com',
    'admin2.med101@gmail.com',
}
ALLOWED_ORIGINS = {'https://med101.space', 'https://www.med101.space'}
BATCH = 500            # FCM send_each limit
COOLDOWN_S = 30        # guards against double-taps / accidental repeats

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


def _clean(text, limit):
    return re.sub(r'\s+', ' ', str(text or '')).strip()[:limit]


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
        if decoded.get('email') not in ADMIN_EMAILS or not decoded.get('email_verified', True):
            return self._send(403, {'error': 'Admins only.'})

        try:
            length = int(self.headers.get('Content-Length', 0))
            payload = json.loads((self.rfile.read(length) if length else b'') or b'{}')
        except Exception as e:
            return self._send(400, {'error': f'Invalid request body: {e}'})

        title = _clean(payload.get('title'), 60)
        body = _clean(payload.get('body'), 200)
        url = str(payload.get('url') or '/')
        if not url.startswith('/'):
            url = '/'  # only in-app paths
        dry_run = bool(payload.get('dryRun'))
        if not dry_run and (not title or not body):
            return self._send(400, {'error': 'Title and message are required.'})

        db = firestore.client()
        token_docs = list(db.collection_group('pushTokens').stream())
        # De-duplicate tokens (same device registered twice).
        seen, docs = set(), []
        for d in token_docs:
            t = (d.to_dict() or {}).get('token')
            if t and t not in seen:
                seen.add(t)
                docs.append((d, t))

        if dry_run:
            return self._send(200, {'ok': True, 'devices': len(docs)})

        meta_ref = db.collection('config').document('broadcastState')
        meta = meta_ref.get()
        last = (meta.to_dict() or {}).get('lastSentAt') if meta.exists else None
        if last is not None and time.time() - last.timestamp() < COOLDOWN_S:
            return self._send(429, {'error': 'A broadcast was just sent. Wait a moment.'})
        meta_ref.set({'lastSentAt': firestore.SERVER_TIMESTAMP, 'by': decoded.get('email')})

        data = {'title': title, 'body': body, 'url': url, 'tag': f'broadcast-{int(time.time())}'}
        sent = failed = 0
        try:
            for i in range(0, len(docs), BATCH):
                chunk = docs[i:i + BATCH]
                messages = [
                    messaging.Message(
                        token=t,
                        data=data,
                        webpush=messaging.WebpushConfig(headers={'Urgency': 'high', 'TTL': '86400'}),
                    )
                    for _, t in chunk
                ]
                result = messaging.send_each(messages)
                for (doc, _), resp in zip(chunk, result.responses):
                    if resp.success:
                        sent += 1
                    else:
                        failed += 1
                        if isinstance(resp.exception, (messaging.UnregisteredError, messaging.SenderIdMismatchError)):
                            doc.reference.delete()  # stale device
        except Exception as e:
            return self._send(500, {'error': f'Broadcast failed part-way: {e}', 'sent': sent})

        return self._send(200, {'ok': True, 'sent': sent, 'failed': failed, 'devices': len(docs)})
