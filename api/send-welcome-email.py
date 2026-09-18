"""
Vercel Python serverless function: sends a one-time welcome email via
Resend right after a student creates an account.

Deliberately auth-gated rather than a plain open POST endpoint: it
only accepts a request carrying a valid Firebase ID token, and always
sends to *that token's own* email/name (never anything from the
request body) - otherwise this would be a free spam-to-anyone
endpoint. This still relies on account creation itself having some
cost/friction (an attacker would need real Firebase accounts to abuse
it), same as any other signup-triggered action.

Idempotent: writes users/{uid}.welcomeEmailSent = true on a
successful send and short-circuits on any later call for the same
uid, so retries (network hiccups, the client accidentally calling
twice) never double-send.

Required env vars:
  Firebase service account - same as api/upload-questions.py:
    FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
  RESEND_API_KEY   - from resend.com (free tier: 3,000/mo, 100/day)
  FROM_EMAIL       - optional, defaults to 'Med101 <welcome@med101.space>'.
                     Must be on a domain verified in Resend, or every
                     send will fail with a 403 from Resend's API.
"""

import json
import os
import re

from http.server import BaseHTTPRequestHandler

import requests
import firebase_admin
from firebase_admin import credentials, auth as fb_auth, firestore

ALLOWED_ORIGINS = {'https://med101.space', 'https://www.med101.space'}

FROM_EMAIL = os.environ.get('FROM_EMAIL', 'Med101 <welcome@med101.space>')

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


def _welcome_email_html(name):
    safe_name = (name or 'there').split('<')[0].strip() or 'there'
    return f"""
<div style="background:#050505;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:16px;padding:32px 28px;">
    <div style="font-size:26px;font-weight:800;letter-spacing:-0.01em;
                background:linear-gradient(90deg,#00e5ff,#a78bfa,#ff4f6b);
                -webkit-background-clip:text;background-clip:text;color:#a78bfa;">
      Med101
    </div>
    <div style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#8a8a8a;margin-top:4px;">
      Learn. Practice. Improve.
    </div>
    <h1 style="color:#f2f2f2;font-size:20px;margin:28px 0 12px;">Welcome, {safe_name}! 🎉</h1>
    <p style="color:#c8c8c8;font-size:14px;line-height:1.6;margin:0 0 16px;">
      Your Med101 account is ready. You've got access to the full question bank for your
      year and semester - quizzes, weak-topic tracking, and everything else, whenever you
      want to study.
    </p>
    <a href="https://med101.space"
       style="display:inline-block;margin-top:8px;padding:12px 24px;border-radius:10px;
              background:linear-gradient(90deg,#00e5ff,#a78bfa,#ff4f6b);color:#050505;
              font-weight:700;font-size:14px;text-decoration:none;">
      Start studying
    </a>
    <p style="color:#6a6a6a;font-size:12px;line-height:1.6;margin:28px 0 0;">
      If you didn't create this account, you can ignore this email.
    </p>
  </div>
</div>
""".strip()


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

        uid = decoded['uid']
        email = decoded.get('email')
        name = decoded.get('name')
        if not email:
            return self._send(400, {'error': 'Token has no email.'})

        db = firestore.client()
        user_ref = db.collection('users').document(uid)

        try:
            existing = user_ref.get()
            if existing.exists and existing.to_dict().get('welcomeEmailSent'):
                return self._send(200, {'sent': False, 'reason': 'already sent'})
        except Exception as e:
            return self._send(500, {'error': f'Could not check send status: {e}'})

        resend_key = os.environ.get('RESEND_API_KEY')
        if not resend_key:
            return self._send(500, {'error': 'RESEND_API_KEY is not configured.'})

        try:
            resp = requests.post(
                'https://api.resend.com/emails',
                headers={'Authorization': f'Bearer {resend_key}', 'Content-Type': 'application/json'},
                json={
                    'from': FROM_EMAIL,
                    'to': [email],
                    'subject': 'Welcome to Med101 🎉',
                    'html': _welcome_email_html(name),
                },
                timeout=10,
            )
        except Exception as e:
            return self._send(502, {'error': f'Resend request failed: {e}'})

        if resp.status_code >= 300:
            return self._send(502, {'error': f'Resend API error: {resp.status_code} {resp.text[:300]}'})

        try:
            user_ref.set({'welcomeEmailSent': True}, merge=True)
        except Exception:
            pass  # email already sent successfully; don't fail the request over the flag write

        return self._send(200, {'sent': True})
