"""
Vercel Python serverless function: sends a push notification to a
student when someone invites them to a challenge room, or sends them a
friend request (type "friendRequest"). One endpoint for both because the
Vercel Hobby plan caps a project at 12 serverless functions.

The client calls this right after writing the invite doc
(users/{toUid}/invites/{inviteId}). The notification text is built HERE
from that stored invite - never from anything the caller sends - and the
endpoint only fires when:
  - the caller's Firebase ID token is valid, and
  - the invite exists, was created by that same caller (fromUid), and
    is under 2 minutes old, and
  - it hasn't already been pushed (pushedAt), and
  - the recipient wasn't pushed in the last 15 seconds (anti-spam).

Body: {"toUid": "...", "inviteId": "...", "type": "invite" | "friendRequest"}
  (for a friend request, inviteId is the SENDER's uid - that is the request
  doc id - and the doc is users/{toUid}/friendRequests/{inviteId})
Env vars (already set for the other endpoints):
  FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
"""

import json
import os
import re
import time

from http.server import BaseHTTPRequestHandler

import firebase_admin
from firebase_admin import credentials, auth as fb_auth, firestore, messaging

ALLOWED_ORIGINS = {'https://med101.space', 'https://www.med101.space'}
INVITE_MAX_AGE_S = 120
RECIPIENT_COOLDOWN_S = 15

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

        try:
            length = int(self.headers.get('Content-Length', 0))
            payload = json.loads((self.rfile.read(length) if length else b'') or b'{}')
        except Exception as e:
            return self._send(400, {'error': f'Invalid request body: {e}'})

        to_uid = (payload.get('toUid') or '').strip()
        invite_id = (payload.get('inviteId') or '').strip()
        kind = (payload.get('type') or 'invite').strip()
        if kind not in ('invite', 'friendRequest'):
            return self._send(400, {'error': 'Unknown notification type.'})
        if not to_uid or not invite_id:
            return self._send(400, {'error': 'Missing toUid or inviteId.'})

        db = firestore.client()
        user_ref = db.collection('users').document(to_uid)
        invite_ref = user_ref.collection('friendRequests' if kind == 'friendRequest' else 'invites').document(invite_id)
        snap = invite_ref.get()
        if not snap.exists:
            return self._send(404, {'error': 'Invite not found.'})
        invite = snap.to_dict() or {}

        if invite.get('fromUid') != decoded['uid']:
            return self._send(403, {'error': 'Not your invite.'})
        if invite.get('pushedAt'):
            return self._send(200, {'ok': True, 'sent': 0, 'reason': 'already-sent'})
        created = invite.get('createdAt')
        if created is None or time.time() - created.timestamp() > INVITE_MAX_AGE_S:
            return self._send(400, {'error': 'Invite is too old to notify.'})

        meta_ref = user_ref.collection('pushMeta').document('state')
        meta = meta_ref.get()
        last = ((meta.to_dict() or {}).get('lastPushAt') if meta.exists else None)
        if last is not None and time.time() - last.timestamp() < RECIPIENT_COOLDOWN_S:
            return self._send(200, {'ok': True, 'sent': 0, 'reason': 'cooldown'})

        token_docs = list(user_ref.collection('pushTokens').stream())
        invite_ref.update({'pushedAt': firestore.SERVER_TIMESTAMP})
        if not token_docs:
            return self._send(200, {'ok': True, 'sent': 0, 'reason': 'no-devices'})
        meta_ref.set({'lastPushAt': firestore.SERVER_TIMESTAMP})

        from_name = _clean(invite.get('fromName'), 50) or 'A friend'
        if kind == 'friendRequest':
            title = f'👥 {from_name} wants to be your friend'
            body = 'Open Med101 to accept or decline.'
            screen = 'friends'
            data = {'title': title, 'body': body, 'url': '/', 'screen': screen,
                    'kind': kind, 'tag': f'friend-{invite_id}'}
        else:
            subject = _clean(invite.get('mainSubject'), 60)
            title = f'⚔️ {from_name} challenged you'
            body = f'Join the {subject} quiz room and compete!' if subject else 'Join their quiz room and compete!'
            screen = 'friends'
            data = {'title': title, 'body': body, 'url': '/', 'screen': screen,
                    'kind': kind, 'tag': f'invite-{invite_id}'}

        # Persist in the in-app inbox even if this user has no push token.
        # A stable ID prevents duplicate inbox entries if the endpoint retries.
        inbox_id = f'{kind}-{invite_id}'
        user_ref.collection('notifications').document(inbox_id).set({
            'title': title, 'body': body, 'screen': screen, 'kind': kind,
            'createdAt': firestore.SERVER_TIMESTAMP, 'read': False,
            'fromUid': decoded['uid'], 'sourceId': invite_id,
        }, merge=True)

        messages = [
            messaging.Message(
                token=(d.to_dict() or {}).get('token'),
                data=data,
                webpush=messaging.WebpushConfig(headers={'Urgency': 'high', 'TTL': '3600'}),
            )
            for d in token_docs
        ]
        sent = 0
        try:
            batch = messaging.send_each(messages)
            for doc, resp in zip(token_docs, batch.responses):
                if resp.success:
                    sent += 1
                elif isinstance(resp.exception, (messaging.UnregisteredError, messaging.SenderIdMismatchError)):
                    doc.reference.delete()  # stale device - stop trying it
        except Exception as e:
            return self._send(500, {'error': f'Push failed: {e}'})

        return self._send(200, {'ok': True, 'sent': sent})
