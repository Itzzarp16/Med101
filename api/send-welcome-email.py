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
WHATSAPP_GROUP_URL = 'https://chat.whatsapp.com/Kn2NDwg7Wij5VQbs35hYMx?s=cl&p=a&mlu=4&ilr=4'

# Must exactly match YEAR_SEMESTER_OPTIONS in AuthScreen.jsx/SettingsScreen.jsx.
YEAR_SEMESTER_LABELS = {
    'y1s1': 'Year 1 · Semester 1',
    'y1s2': 'Year 1 · Semester 2',
    'y2s1': 'Year 2 · Semester 1',
    'y2s2': 'Year 2 · Semester 2',
    'y3s1': 'Year 3 · Semester 1',
    'y3s2': 'Year 3 · Semester 2',
}

_TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), 'templates', 'welcome-email.html')
with open(_TEMPLATE_PATH, 'r', encoding='utf-8') as f:
    _TEMPLATE = f.read()

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


def _welcome_email_html(name, year_semester):
    safe_name = (name or 'there').split('<')[0].strip() or 'there'
    label = YEAR_SEMESTER_LABELS.get(year_semester, 'your year and semester')
    return (
        _TEMPLATE
        .replace('{{NAME}}', safe_name)
        .replace('{{YEAR_SEMESTER_LABEL}}', label)
        .replace('{{CTA_URL}}', 'https://med101.space')
        .replace('{{WHATSAPP_URL}}', WHATSAPP_GROUP_URL)
    )


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
            existing_data = existing.to_dict() if existing.exists else {}
            if existing_data.get('welcomeEmailSent'):
                return self._send(200, {'sent': False, 'reason': 'already sent'})
        except Exception as e:
            return self._send(500, {'error': f'Could not check send status: {e}'})

        year_semester = existing_data.get('enrolledYearSemester')

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
                    'html': _welcome_email_html(name, year_semester),
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
