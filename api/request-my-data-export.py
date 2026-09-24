"""
Vercel Python serverless function: self-service version of
api/admin/email-data-export.py. Any signed-in student can call this
directly (Settings -> "Email My Data") to have their own PDF export
sent to their own registered email within seconds - no admin has to
do anything.

Same Gmail-SMTP-as-admin.med101@gmail.com delivery as the admin
endpoint (see that file's docstring for the App Password setup).

The PDF is rendered client-side (buildUserDataExportPdf in
src/lib/dataExport.js - same function and layout the admin's
download/email buttons use) and its base64 output is sent up in the
request body, same as the admin endpoint.

CRITICAL difference from the admin endpoint: there is no uid in the
request body at all, and no admin check. The target uid is taken
ONLY from the verified Firebase ID token's own `uid` claim, and the
recipient email is looked up server-side from that same uid's
users/{uid}.email. This is what makes it safe to let ANY signed-in
user call this: nothing in the request can make it email anyone
other than the caller themselves.

A per-user cooldown (via the admin SDK, so it can't be bypassed by a
client simply not reporting it) blocks re-sending for a few minutes,
mainly to avoid a student accidentally spamming their own inbox (or
tripping Gmail's sending rate limits) by mashing the button.

Required env vars: same as api/admin/email-data-export.py -
  FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
  GMAIL_APP_PASSWORD, GMAIL_SENDER_EMAIL (optional)
"""

import base64
import datetime
import json
import os
import re
import smtplib
import ssl

from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from http.server import BaseHTTPRequestHandler

import firebase_admin
from firebase_admin import credentials, auth as fb_auth, firestore

ALLOWED_ORIGINS = {'https://med101.space', 'https://www.med101.space'}

GMAIL_SENDER_EMAIL = os.environ.get('GMAIL_SENDER_EMAIL', 'admin.med101@gmail.com')

# A base64-encoded PDF stays well under Vercel's 4.5MB serverless
# request body limit even for a very active student's full history.
MAX_BASE64_CHARS = 6_000_000

# Blocks a second request for this long after a successful send -
# generous enough that a genuine re-request (e.g. "I didn't get it,
# let me try again") still works within a reasonable wait, tight
# enough to stop accidental button-mashing.
COOLDOWN_SECONDS = 120

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


def _email_body_html(student_name):
    safe_name = (student_name or 'there').split('<')[0].strip() or 'there'
    return f"""
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a2e;">
      <h2 style="margin: 0 0 12px;">Your Med101 data export</h2>
      <p style="line-height: 1.5;">Hi {safe_name},</p>
      <p style="line-height: 1.5;">
        As requested, attached is a full export of the data Med101
        stores about your account (as a PDF).
      </p>
      <p style="line-height: 1.5; color: #666; font-size: 13px;">
        Didn't request this? Someone may have access to your account -
        consider changing your password, and reply to this email if
        you have any concerns.
      </p>
    </div>
    """


def _send_via_gmail(app_password, to_email, student_name, pdf_bytes):
    msg = MIMEMultipart('mixed')
    msg['Subject'] = 'Your Med101 data export'
    msg['From'] = f'Med101 Admin <{GMAIL_SENDER_EMAIL}>'
    msg['To'] = to_email

    alt = MIMEMultipart('alternative')
    alt.attach(MIMEText(_email_body_html(student_name), 'html'))
    msg.attach(alt)

    part = MIMEBase('application', 'pdf')
    part.set_payload(pdf_bytes)
    encoders.encode_base64(part)
    part.add_header('Content-Disposition', 'attachment', filename='med101-data-export.pdf')
    msg.attach(part)

    context = ssl.create_default_context()
    with smtplib.SMTP('smtp.gmail.com', 587, timeout=20) as server:
        server.starttls(context=context)
        server.login(GMAIL_SENDER_EMAIL, app_password)
        server.sendmail(GMAIL_SENDER_EMAIL, [to_email], msg.as_string())


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

        # The uid comes ONLY from the verified token - never from the
        # request body - so this can only ever act on the caller's own
        # account.
        uid = decoded.get('uid')
        if not uid:
            return self._send(401, {'error': 'Invalid session.'})

        try:
            length = int(self.headers.get('Content-Length', 0))
            raw = self.rfile.read(length) if length else b''
            payload = json.loads(raw or b'{}')
        except Exception as e:
            return self._send(400, {'error': f'Invalid request body: {e}'})

        export_pdf_base64 = payload.get('exportPdfBase64') or ''
        if not export_pdf_base64.strip():
            return self._send(400, {'error': 'Missing exportPdfBase64.'})
        if len(export_pdf_base64) > MAX_BASE64_CHARS:
            return self._send(400, {'error': 'Export file too large.'})

        try:
            pdf_bytes = base64.b64decode(export_pdf_base64)
        except Exception:
            return self._send(400, {'error': 'exportPdfBase64 is not valid base64.'})

        db = firestore.client()
        user_ref = db.collection('users').document(uid)

        try:
            snap = user_ref.get()
        except Exception as e:
            return self._send(500, {'error': f'Could not look up your account: {e}'})

        if not snap.exists:
            return self._send(404, {'error': 'Account profile not found.'})

        data = snap.to_dict() or {}
        target_email = data.get('email')
        target_name = data.get('displayName')
        if not target_email:
            return self._send(400, {'error': 'Your account has no email on file.'})

        # Server-enforced cooldown via the admin SDK (bypasses Firestore
        # rules entirely, so it can't be skipped by a client that just
        # doesn't send/update the field itself).
        last_sent = data.get('lastDataExportEmailAt')
        if last_sent is not None:
            last_dt = last_sent if isinstance(last_sent, datetime.datetime) else None
            if last_dt is not None:
                elapsed = (datetime.datetime.now(datetime.timezone.utc) - last_dt).total_seconds()
                if elapsed < COOLDOWN_SECONDS:
                    wait = int(COOLDOWN_SECONDS - elapsed)
                    return self._send(429, {'error': f'Please wait {wait}s before requesting another export.'})

        app_password = os.environ.get('GMAIL_APP_PASSWORD')
        if not app_password:
            return self._send(500, {'error': 'GMAIL_APP_PASSWORD is not configured.'})

        try:
            _send_via_gmail(app_password, target_email, target_name, pdf_bytes)
        except smtplib.SMTPAuthenticationError as e:
            return self._send(502, {'error': f'Gmail rejected the login - check GMAIL_APP_PASSWORD: {e}'})
        except Exception as e:
            return self._send(502, {'error': f'Failed to send via Gmail: {e}'})

        try:
            user_ref.set({'lastDataExportEmailAt': firestore.SERVER_TIMESTAMP}, merge=True)
        except Exception:
            pass  # Best-effort - a failed cooldown-stamp write shouldn't fail a send that already succeeded.

        return self._send(200, {'sent': True, 'to': target_email})
