"""
Vercel Python serverless function: emails a student's data export
(the same PDF report the admin can already download from
AdminUserDetailScreen's "Export Data" button) directly to that
student's own registered email address, as a PDF attachment.

Sent via Gmail SMTP (not Resend, unlike the other emails this app
sends) so the "From" address is a real admin.med101@gmail.com rather
than a med101.space address - Gmail's own servers are the ones
actually sending it, so there's no SPF/DKIM mismatch to worry about,
just an App Password.

The PDF itself is rendered client-side (buildUserDataExportPdf in
src/lib/dataExport.js, same jsPDF layout the download button already
uses) and its base64 output is sent up in the request body - this
endpoint doesn't re-derive or re-render anything, just attaches
whatever bytes the admin's browser produced. That keeps the export
layout in exactly one place instead of duplicating it in Python.

Admin-gated: only accepts a request carrying a valid Firebase ID
token whose email is in ADMIN_EMAILS. The recipient address is looked
up server-side from users/{targetUid}.email - never taken from the
request body - so a compromised/buggy client can't be used to spam
an arbitrary address; it can only ever email a real Med101 account's
own registered email.

Required env vars:
  Firebase service account - same as api/send-welcome-email.py:
    FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
  GMAIL_APP_PASSWORD - a 16-character Gmail App Password for
    admin.med101@gmail.com (Google Account -> Security -> 2-Step
    Verification must be ON first, then App Passwords -> generate
    one for "Mail"). A normal Gmail login password will NOT work
    here - Google blocks plain-password SMTP logins from apps.
  GMAIL_SENDER_EMAIL - optional, defaults to 'admin.med101@gmail.com'.
    Must be the same mailbox the App Password above belongs to.
"""

import base64
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

# Must exactly match ADMIN_EMAILS in src/lib/AuthContext.jsx,
# api/upload-questions.py, and isAdmin() in firestore.rules - keep all
# four in sync by hand.
ADMIN_EMAILS = {
    'admin.med101@gmail.com',
    'admin1.med101@gmail.com',
    'admin2.med101@gmail.com',
}

ALLOWED_ORIGINS = {'https://med101.space', 'https://www.med101.space'}

GMAIL_SENDER_EMAIL = os.environ.get('GMAIL_SENDER_EMAIL', 'admin.med101@gmail.com')

# A base64-encoded PDF stays well under Vercel's 4.5MB serverless
# request body limit even for a very active student's full history.
MAX_BASE64_CHARS = 6_000_000

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
        Attached is a full export of the data Med101 stores about your
        account (as a PDF), sent to you by a Med101 admin.
      </p>
      <p style="line-height: 1.5; color: #666; font-size: 13px;">
        Didn't request this? You can safely ignore this email, or
        reply if you have any questions.
      </p>
    </div>
    """


def _email_body_text(student_name):
    safe_name = (student_name or 'there').split('<')[0].strip() or 'there'
    return (
        f"Hi {safe_name},\n\n"
        "Attached is a full export of the data Med101 stores about your "
        "account (as a PDF), sent to you by a Med101 admin.\n\n"
        "Didn't request this? You can safely ignore this email, or reply "
        "if you have any questions.\n"
    )


def _send_via_gmail(app_password, to_email, student_name, pdf_bytes):
    msg = MIMEMultipart('mixed')
    msg['Subject'] = 'Your Med101 data export'
    msg['From'] = f'Med101 Admin <{GMAIL_SENDER_EMAIL}>'
    msg['To'] = to_email

    # A plain-text part alongside the HTML one isn't just a fallback for
    # text-only clients - most spam filters specifically penalize
    # HTML-only mail, so this is also a meaningful deliverability signal.
    alt = MIMEMultipart('alternative')
    alt.attach(MIMEText(_email_body_text(student_name), 'plain'))
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

        if decoded.get('email') not in ADMIN_EMAILS:
            return self._send(403, {'error': 'Admin access required.'})

        try:
            length = int(self.headers.get('Content-Length', 0))
            raw = self.rfile.read(length) if length else b''
            payload = json.loads(raw or b'{}')
        except Exception as e:
            return self._send(400, {'error': f'Invalid request body: {e}'})

        target_uid = (payload.get('uid') or '').strip()
        export_pdf_base64 = payload.get('exportPdfBase64') or ''
        if not target_uid:
            return self._send(400, {'error': 'Missing uid.'})
        if not export_pdf_base64.strip():
            return self._send(400, {'error': 'Missing exportPdfBase64.'})
        if len(export_pdf_base64) > MAX_BASE64_CHARS:
            return self._send(400, {'error': 'Export file too large.'})

        try:
            pdf_bytes = base64.b64decode(export_pdf_base64)
        except Exception:
            return self._send(400, {'error': 'exportPdfBase64 is not valid base64.'})

        db = firestore.client()
        try:
            target_snap = db.collection('users').document(target_uid).get()
        except Exception as e:
            return self._send(500, {'error': f'Could not look up user: {e}'})

        if not target_snap.exists:
            return self._send(404, {'error': 'User not found.'})

        target = target_snap.to_dict() or {}
        target_email = target.get('email')
        target_name = target.get('displayName')
        if not target_email:
            return self._send(400, {'error': 'This account has no email on file.'})

        app_password = os.environ.get('GMAIL_APP_PASSWORD')
        if not app_password:
            return self._send(500, {'error': 'GMAIL_APP_PASSWORD is not configured.'})

        try:
            _send_via_gmail(app_password, target_email, target_name, pdf_bytes)
        except smtplib.SMTPAuthenticationError as e:
            return self._send(502, {'error': f'Gmail rejected the login - check GMAIL_APP_PASSWORD: {e}'})
        except Exception as e:
            return self._send(502, {'error': f'Failed to send via Gmail: {e}'})

        return self._send(200, {'sent': True, 'to': target_email})

