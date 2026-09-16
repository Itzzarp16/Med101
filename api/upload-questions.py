"""
Vercel Python serverless function: parses an admin-uploaded PDF
question bank and saves the parsed questions via one of two methods,
chosen per-upload by the `saveMethod` field:

  - saveMethod: 'firestore' (default) - writes to Firestore, where
    useSemesterData.js picks it up live within the same page load, no
    redeploy. Small ongoing Firestore read cost (see below).
  - saveMethod: 'github' - commits the questions directly into the
    semester's static JSON file (public/data/{semesterId}.json) via
    the GitHub Contents API. Zero Firestore usage at all - the
    questions become indistinguishable from the hand-written JSON
    content. Costs a Vercel rebuild (~30-60s) since production
    auto-deploys from this branch; nothing else to do by hand.

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

Required env vars:
  Firestore path (same Firebase service account already used by
  api/ai-explanation.js - see GEMINI_SETUP.md):
    FIREBASE_PROJECT_ID
    FIREBASE_CLIENT_EMAIL
    FIREBASE_PRIVATE_KEY
  GitHub path (add these once in Vercel -> Settings -> Environment
  Variables if you want to use saveMethod: 'github' - not required
  for the Firestore path):
    GITHUB_TOKEN   - a personal access token with 'repo' scope (or a
                     fine-grained token with Contents: Read & Write
                     on this repo only)
    GITHUB_REPO    - defaults to 'Itzzarp16/Med101' if unset
    GITHUB_BRANCH  - defaults to 'react-rebuild' if unset - must be
                     whichever branch is set as Vercel's Production
                     Branch, or the commit won't auto-deploy

Vercel Python function requirements are declared in api/requirements.txt.
"""

import os
import re
import json
import base64
from http.server import BaseHTTPRequestHandler

import fitz  # PyMuPDF
import requests
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


def github_upsert_questions(semester_id, main_subject, subtopic, questions_out, emoji, desc):
    """Commits the parsed questions into public/data/{semesterId}.json
    on GitHub, replacing any previously-uploaded batch for this same
    subtopic (matched by the .s field) - re-uploading a corrected PDF
    for the same subtopic overwrites rather than duplicates, same
    behavior as the Firestore path. Raises on any failure - the caller
    catches and reports it."""
    token = os.environ['GITHUB_TOKEN']
    repo = os.environ.get('GITHUB_REPO', 'Itzzarp16/Med101')
    branch = os.environ.get('GITHUB_BRANCH', 'react-rebuild')
    path = f'public/data/{semester_id}.json'
    api_url = f'https://api.github.com/repos/{repo}/contents/{path}'
    headers = {'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github+json'}

    get_resp = requests.get(api_url, headers=headers, params={'ref': branch}, timeout=20)
    get_resp.raise_for_status()
    file_info = get_resp.json()
    sha = file_info['sha']
    data = json.loads(base64.b64decode(file_info['content']).decode('utf-8'))

    # Replace this subtopic's questions wholesale (drop the old batch,
    # append the new one) rather than appending on top of stale data.
    data['questions'] = [q for q in data.get('questions', []) if q.get('s') != subtopic] + questions_out
    data.setdefault('subjectGroup', {})[subtopic] = main_subject
    existing_meta = data.setdefault('subjectMeta', {}).get(subtopic, {})
    data['subjectMeta'][subtopic] = {
        'emoji': emoji or existing_meta.get('emoji', '📖'),
        'desc': desc or existing_meta.get('desc', ''),
        'accent': existing_meta.get('accent', 'var(--cyan)'),
    }

    new_content = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    put_resp = requests.put(api_url, headers=headers, json={
        'message': f'Upload questions: {subtopic} ({main_subject}, {semester_id})',
        'content': base64.b64encode(new_content.encode('utf-8')).decode('utf-8'),
        'sha': sha,
        'branch': branch,
    }, timeout=20)
    put_resp.raise_for_status()


EXPECTED_LETTERS = ('A', 'B', 'C', 'D')


def _malformed_reason(stem, options):
    if not stem:
        return 'question text is empty (numbering matched but no stem text followed)'
    missing = [l for l in EXPECTED_LETTERS if l not in options]
    if missing:
        found = len(options)
        return f'only {found} option(s) detected, missing {", ".join(missing)}'
    extra = [l for l in options if l not in EXPECTED_LETTERS]
    if extra:
        return f'unexpected option label(s): {", ".join(extra)}'
    return 'unrecognized structure'


def parse_pdf_bytes(pdf_bytes):
    """Returns (questions, malformed, total_q_matches).

    questions: list of {'num', 'q', 'o': [...exactly 4 options, A-D order], 'c': index-or-None}
    malformed: list of {'num', 'reason'} for questions whose numbering matched
      but which didn't resolve to a clean stem + exactly options A-D (e.g. a
      layout that broke the option-lettering regex, a stray page-break, etc.)
    total_q_matches: how many times the "N. text" numbering pattern matched at
      all, across the whole document - if this is 0 the PDF almost certainly
      isn't in the expected format at all, as opposed to being in the right
      format but hitting parse edge cases.
    """
    doc = fitz.open(stream=pdf_bytes, filetype='pdf')
    questions = []
    malformed = []
    total_q_matches = 0
    current_q = None

    def flush():
        nonlocal current_q
        if current_q is None:
            return
        stem = ' '.join(current_q['stem']).strip().rstrip(':').strip()
        has_all_options = all(l in current_q['options'] for l in EXPECTED_LETTERS) \
            and len(current_q['options']) == len(EXPECTED_LETTERS)
        if not stem or not has_all_options:
            malformed.append({
                'num': current_q['num'],
                'reason': _malformed_reason(stem, current_q['options']),
            })
        else:
            # Build options in fixed A-D order (not PDF encounter order) -
            # if a layout ever interleaves options oddly (e.g. two-column
            # pages), encounter order can differ from letter order, which
            # would silently point 'c' (a positional index) at the wrong
            # option. Keying strictly off the letter avoids that.
            opts = []
            correct = None
            for i, letter in enumerate(EXPECTED_LETTERS):
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
                total_q_matches += 1
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

    return questions, malformed, total_q_matches


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

        save_method = body.get('saveMethod') or 'firestore'
        if save_method not in ('firestore', 'github'):
            return self._send(400, {'error': "saveMethod must be 'firestore' or 'github'."})

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
            parsed, malformed, total_q_matches = parse_pdf_bytes(pdf_bytes)
        except Exception as e:
            return self._send(500, {'error': f'Could not parse PDF: {e}'})

        if total_q_matches == 0:
            return self._send(422, {
                'error': "No numbered questions were detected anywhere in this PDF. This parser only "
                         "matches questions written as 'N. question text' - if this PDF uses a "
                         "different numbering or layout, it isn't a match for this parser at all "
                         "(see the format note at the top of upload-questions.py)."
            })

        incomplete = [q['num'] for q in parsed if q['c'] is None]
        questions_out = [
            {'s': subtopic, 'q': q['q'], 'o': q['o'], 'c': q['c']}
            for q in parsed if q['c'] is not None
        ]

        if not questions_out:
            error = 'Questions were found but none could be saved: '
            reasons = []
            if incomplete:
                reasons.append(f'{len(incomplete)} had no detectable highlighted answer')
            if malformed:
                reasons.append(f'{len(malformed)} had a structural problem (see malformedQuestions)')
            return self._send(422, {
                'error': error + '; '.join(reasons) + '.',
                'incompleteQuestionNumbers': incomplete,
                'malformedQuestions': malformed,
            })

        try:
            if save_method == 'github':
                # Zero Firestore usage - commits straight into the
                # static JSON file. Requires GITHUB_TOKEN to be set;
                # a missing/invalid token raises here and is reported
                # to the admin rather than silently falling back.
                github_upsert_questions(semester_id, main_subject, subtopic, questions_out, emoji, desc)
            else:
                db = firestore.client()
                # One document PER SEMESTER (not per upload) - the client
                # reads uploadedQuestions/{semesterId} directly by ID, so
                # this keeps the app's read cost fixed at exactly one doc
                # per active semester no matter how many subtopics get
                # uploaded over time. Read-merge-write here (instead of a
                # dotted-field-path merge) so re-uploading one subtopic
                # only touches its own entry, leaving every other
                # previously-uploaded subtopic in this semester untouched.
                sem_ref = db.collection('uploadedQuestions').document(semester_id)
                sem_snap = sem_ref.get()
                subjects = (sem_snap.to_dict() or {}).get('subjects', {}) if sem_snap.exists else {}
                subtopic_key = slugify(subtopic)
                subjects[subtopic_key] = {
                    'mainSubject': main_subject,
                    'subtopic': subtopic,
                    'subtopicEmoji': emoji,
                    'subtopicDesc': desc,
                    'questions': questions_out,
                    'updatedAt': firestore.SERVER_TIMESTAMP,
                    'uploadedBy': email,
                }
                sem_ref.set({'subjects': subjects}, merge=False)
        except Exception as e:
            dest = 'GitHub' if save_method == 'github' else 'Firestore'
            return self._send(500, {'error': f'Could not save to {dest}: {e}'})

        return self._send(200, {
            'success': True,
            'saveMethod': save_method,
            'savedCount': len(questions_out),
            'skippedCount': len(incomplete) + len(malformed),
            'incompleteQuestionNumbers': incomplete,
            'malformedQuestions': malformed,
        })
