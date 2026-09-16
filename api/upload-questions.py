"""
Vercel Python serverless function: parses an admin-uploaded PDF
question bank and writes the parsed questions straight to Firestore,
where useSemesterData.js picks them up live (no redeploy needed).

Expected PDF format (Option 1 - free, pattern-based parser, built
against Abhi's real "HA2_26_Answer_Key" export):
  - Questions numbered "N. stem text:"
  - Four options per question, "A. text" / "B. text" / "C. text" / "D. text"
  - The correct option is marked with a yellow highlight that, in this
    export pipeline, is drawn as a vector-filled rectangle behind the
    option's text (fill ~= (1,1,0)) rather than a real PDF highlight
    annotation - page.annots() is empty on the sample file, so we
    match option line bounding boxes against yellow drawn rects
    instead of reading annotations.

This is intentionally narrow: it is built to match ONE export format,
not PDFs in general. If a future question bank uses a different
layout (different lettering, real highlight annotations instead of
drawn rects, different numbering), this parser will need a matching
update - see /areas/med101.md "Question upload plan" for the planned
Option 2 (AI-powered, format-agnostic) upgrade path.

Required env vars (same Firebase service account already used by
api/ai-explanation.js - see GEMINI_SETUP.md):
  FIREBASE_PROJECT_ID
  FIREBASE_CLIENT_EMAIL
  FIREBASE_PRIVATE_KEY

Vercel Python function requirements are declared in api/requirements.txt.
"""

import os
import re
import json
import base64
from http.server import BaseHTTPRequestHandler

import fitz  # PyMuPDF
import firebase_admin
from firebase_admin import credentials, auth as fb_auth, firestore

# Must exactly match ADMIN_EMAILS in src/lib/AuthContext.jsx and
# isAdmin() in firestore.rules - keep all three in sync by hand.
ADMIN_EMAILS = {
    'admin.med101@gmail.com',
    'admin1.med101@gmail.com',
    'admin2.med101@gmail.com',
}

ALLOWED_ORIGINS = {'https://med101.space', 'https://www.med101.space'}

Q_PAT = re.compile(r'^(\d+)\.\s+(.*)$')
OPT_PAT = re.compile(r'^([A-D])\.\s+(.*)$')

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


def slugify(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def parse_pdf_bytes(pdf_bytes):
    """Returns a list of {'num', 'q', 'o': [...4 options], 'c': index-or-None}."""
    doc = fitz.open(stream=pdf_bytes, filetype='pdf')
    questions = []
    current_q = None

    def flush():
        nonlocal current_q
        if current_q and current_q['stem'] and len(current_q['options']) >= 2:
            stem = ' '.join(current_q['stem']).strip().rstrip(':').strip()
            opts = []
            correct = None
            for i, letter in enumerate(current_q['order']):
                o = current_q['options'][letter]
                opts.append(' '.join(o['text']).strip())
                if o['correct']:
                    correct = i
            questions.append({'num': current_q['num'], 'q': stem, 'o': opts, 'c': correct})
        current_q = None

    for page in doc:
        d = page.get_text('dict')

        yellow_rects = []
        for dr in page.get_drawings():
            fill = dr.get('fill')
            if fill and len(fill) == 3:
                r, g, b = fill
                if r > 0.9 and g > 0.9 and b < 0.3:
                    yellow_rects.append(dr['rect'])

        def overlaps_yellow(bbox):
            y0, y1 = bbox[1], bbox[3]
            return any(y0 < yr.y1 and y1 > yr.y0 for yr in yellow_rects)

        lines = []
        for block in d['blocks']:
            for line in block.get('lines', []):
                text = ''.join(span['text'] for span in line['spans']).strip()
                if text:
                    lines.append({'text': text, 'bbox': line['bbox']})

        for line in lines:
            text = line['text']
            qm = Q_PAT.match(text)
            om = OPT_PAT.match(text)
            if qm:
                flush()
                current_q = {'num': qm.group(1), 'stem': [qm.group(2)], 'options': {}, 'order': []}
            elif om and current_q is not None:
                letter = om.group(1)
                current_q['options'][letter] = {
                    'text': [om.group(2)],
                    'correct': overlaps_yellow(line['bbox']),
                }
                current_q['order'].append(letter)
            elif current_q is not None:
                if current_q['order']:
                    current_q['options'][current_q['order'][-1]]['text'].append(text)
                else:
                    current_q['stem'].append(text)
        flush()

    return questions


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
            length = int(self.headers.get('Content-Length', 0) or 0)
            raw = self.rfile.read(length) if length else b'{}'
            body = json.loads(raw or b'{}')
        except Exception:
            return self._send(400, {'error': 'Invalid JSON body.'})

        try:
            _init_admin()
            decoded = fb_auth.verify_id_token(m.group(1))
        except Exception as e:
            return self._send(401, {'error': f'Invalid or expired session: {e}'})

        email = decoded.get('email')
        if email not in ADMIN_EMAILS:
            return self._send(403, {'error': 'Admin access required.'})

        semester_id = body.get('semesterId')
        main_subject = body.get('mainSubject')
        subtopic = body.get('subtopic')
        pdf_b64 = body.get('pdfBase64')
        emoji = body.get('emoji') or '📖'
        desc = body.get('desc') or ''

        if not semester_id or not main_subject or not subtopic or not pdf_b64:
            return self._send(400, {'error': 'semesterId, mainSubject, subtopic, and pdfBase64 are all required.'})

        try:
            pdf_bytes = base64.b64decode(pdf_b64)
        except Exception:
            return self._send(400, {'error': 'pdfBase64 could not be decoded.'})

        try:
            parsed = parse_pdf_bytes(pdf_bytes)
        except Exception as e:
            return self._send(500, {'error': f'Could not parse PDF: {e}'})

        if not parsed:
            return self._send(422, {
                'error': 'No questions were recognized in this PDF. Check that it matches the expected '
                         'format (numbered questions, A-D options, yellow-highlighted correct answer).'
            })

        incomplete = [q['num'] for q in parsed if q['c'] is None]
        questions_out = [
            {'s': subtopic, 'q': q['q'], 'o': q['o'], 'c': q['c']}
            for q in parsed if q['c'] is not None
        ]

        if not questions_out:
            return self._send(422, {
                'error': 'Questions were found but none had a detectable highlighted answer - '
                         'nothing was saved.',
                'incompleteQuestionNumbers': incomplete,
            })

        doc_id = f"{semester_id}__{slugify(main_subject)}__{slugify(subtopic)}"

        try:
            db = firestore.client()
            db.collection('uploadedQuestions').document(doc_id).set({
                'semesterId': semester_id,
                'mainSubject': main_subject,
                'subtopic': subtopic,
                'subtopicEmoji': emoji,
                'subtopicDesc': desc,
                'questions': questions_out,
                'updatedAt': firestore.SERVER_TIMESTAMP,
                'uploadedBy': email,
            })
        except Exception as e:
            return self._send(500, {'error': f'Could not save to Firestore: {e}'})

        return self._send(200, {
            'success': True,
            'savedCount': len(questions_out),
            'skippedCount': len(incomplete),
            'incompleteQuestionNumbers': incomplete,
        })
