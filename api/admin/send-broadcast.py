"""
Vercel Python serverless function: admin push notifications.

One endpoint, several actions (all admin-only, same ADMIN_EMAILS check as
the other admin endpoints; Firebase ID token required):

  {"action": "stats"}    -> how many students/devices can be reached, in total
                            and per (current) semester
  {"action": "send",  title, body, screen, audience}
                         -> send to the chosen audience
  {"action": "test",  title, body, screen}
                         -> send only to the calling admin's own devices
  {"action": "history"}  -> the last 15 broadcasts

audience: {"type": "all"}
        | {"type": "semesters", "semesters": ["y1s2", "y2s1"]}
        | {"type": "student",   "username": "someone"}

"semester" means each student's CURRENT semester - enrolledYearSemester
advanced by the academic calendar, exactly like academicCalendar.js does
for the app itself.

screen: where tapping the notification opens ('home' or a whitelisted
screen key - see SCREENS).

GET (cron only): the ONE daily Vercel cron (vercel.json, 03:30 UTC = 09:30
Kyrgyzstan) runs two jobs, each isolated from the other's failures:
  1. exam reminders, 2. the payment/subscriber backup (below).
?job=exam or ?job=backup runs just one. Vercel keys crons by path, so two
crons on this one path would overwrite each other - hence one cron, two jobs.
This lives in this file, not its own function, because the Hobby plan allows
at most 12 serverless functions per deployment.

Exam reminders send an automatic push to every
student whose CURRENT semester has an exam in 7 days or tomorrow.

  - Exam dates come from src/data/examSchedule.json (built-in defaults,
    bundled via "includeFiles" in vercel.json) and, when an admin has edited
    a semester in Admin -> Exam Schedule, from Firestore
    config/examSchedule.exams[semester], which replaces that semester's
    defaults.
  - Auth: Vercel sends "Authorization: Bearer <CRON_SECRET>" once a
    CRON_SECRET env var exists. If it is unset or does not match, nothing runs.
    Add ?dry=1 (with the same header) to see what WOULD be sent.
  - Sent reminders are remembered in adminMeta/examReminders so a retried or
    double-fired cron never notifies anyone twice. Sends show up in the admin
    "Recently sent" list as "Semester N - auto reminder".

Backup job (runs with the cron above, or alone via GET ?job=backup): daily backup of the
payment + subscriber data (paymentRequests, activationCodes, config/subscription)
emailed to the admin via Resend as a JSON file (complete, used for restore)
plus CSVs (for reading). Add &dry=1 to count without sending. Also available
to admins as POST actions "backup-now" and "backup-status" (Admin -> Backups).
Restore with scripts/restore_backup.py. Last run is kept in adminMeta/backup.

Env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (already set),
CRON_SECRET (for the GET jobs), RESEND_API_KEY (already set, used for the backup email),
BACKUP_EMAIL_TO (optional, comma-separated, defaults to admin.med101@gmail.com),
FROM_EMAIL / REPLY_TO_EMAIL (optional, same defaults as the other email endpoints)
"""

import base64
import csv
import gzip
import hmac
import io
import json
import os
import re
import time
from datetime import date, datetime, timedelta, timezone
from urllib.parse import parse_qs, quote, urlparse

from http.server import BaseHTTPRequestHandler

import requests
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

# Mirror of SEMESTER_ORDER / DEFAULT_CALENDAR in src/lib/academicCalendar.js.
SEMESTER_ORDER = ['y1s1', 'y1s2', 'y2s1', 'y2s2', 'y3s1', 'y3s2']
DEFAULT_CALENDAR = {
    'y1s1': '2025-09-01',
    'y1s2': '2026-02-01',
    'y2s1': '2099-01-01',
    'y2s2': '2099-06-01',
    'y3s1': '2099-11-01',
    'y3s2': '2100-04-01',
}

# Screen keys the app's deep-link handler (App.jsx) accepts.
SCREENS = {'home', 'leaderboard', 'challenge', 'friends', 'weak-topics', 'history'}

# Exam reminders: Kyrgyzstan has no daylight saving (always UTC+6).
KG = timezone(timedelta(hours=6))
REMIND_DAYS = {7: 'week', 1: 'day'}
DEFAULTS_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'data', 'examSchedule.json')

# Backup of payment + subscriber data.
BACKUP_COLLECTIONS = ['paymentRequests', 'activationCodes']
BACKUP_SINGLE_DOCS = [('config', 'subscription')]
BACKUP_TO = [a.strip() for a in os.environ.get('BACKUP_EMAIL_TO', 'admin.med101@gmail.com').split(',') if a.strip()]
FROM_EMAIL = os.environ.get('FROM_EMAIL', 'Med101 Admin <admin@med101.space>')
REPLY_TO_EMAIL = os.environ.get('REPLY_TO_EMAIL', 'support@med101.space')
BACKUP_COOLDOWN_S = 30
GZIP_ABOVE_BYTES = 12 * 1024 * 1024  # Resend allows ~40 MB per email; stay well under

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


def username_doc_id(name):
    """Mirror of usernameDocId() in src/lib/profile.js."""
    encoded = quote(name, safe="!'()*-._~").replace('.', '%2E')
    if re.match(r'^__.*__$', encoded):
        encoded = '%5F' + encoded[1:]
    return encoded


def _parse_date(value):
    try:
        d = datetime.fromisoformat(str(value))
    except Exception:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def resolve_current_semester(enrolled, calendar, now):
    """Mirror of resolveCurrentSemester() in academicCalendar.js (without the
    availableSemesterIds hold-back, which only the client can know)."""
    start = SEMESTER_ORDER.index(enrolled) if enrolled in SEMESTER_ORDER else 0
    current = SEMESTER_ORDER[start]
    for sem in SEMESTER_ORDER[start:]:
        d = _parse_date(calendar.get(sem)) if calendar.get(sem) else None
        if d is None:
            break
        if d <= now:
            current = sem
        else:
            break
    return current


def _calendar(db):
    cal = dict(DEFAULT_CALENDAR)
    snap = db.collection('config').document('academicCalendar').get()
    if snap.exists:
        for k, v in (snap.to_dict() or {}).items():
            if isinstance(v, str):
                cal[k] = v
    return cal


def _collect_devices(db, only_uid=None):
    """[(uid, token, doc_ref)], de-duplicated by token."""
    if only_uid:
        stream = db.collection('users').document(only_uid).collection('pushTokens').stream()
    else:
        stream = db.collection_group('pushTokens').stream()
    seen, out = set(), []
    for d in stream:
        t = (d.to_dict() or {}).get('token')
        if not t or t in seen:
            continue
        seen.add(t)
        out.append((d.reference.parent.parent.id, t, d.reference))
    return out


def _semester_by_uid(db, uids):
    refs = [db.collection('users').document(u) for u in uids]
    enrolled = {}
    for i in range(0, len(refs), 300):
        for snap in db.get_all(refs[i:i + 300], field_paths=['enrolledYearSemester']):
            enrolled[snap.id] = (snap.to_dict() or {}).get('enrolledYearSemester') if snap.exists else None
    cal = _calendar(db)
    now = datetime.now(timezone.utc)
    return {u: resolve_current_semester(enrolled.get(u), cal, now) for u in uids}


def _audience_label(audience):
    t = audience.get('type')
    if t == 'semesters':
        nums = sorted(SEMESTER_ORDER.index(s) + 1 for s in audience['semesters'])
        return 'Semester ' + ', '.join(str(n) for n in nums)
    if t == 'student':
        return '@' + audience.get('username', '')
    return 'All students'


def _url_for(screen):
    return '/' if screen == 'home' else f'/?open={screen}'


# ── exam reminders (daily cron, GET) ─────────────────────────

def load_schedule(db):
    """{semester: [exam, ...]} - built-in defaults, replaced per semester by
    whatever an admin saved in Firestore."""
    with open(DEFAULTS_PATH, encoding='utf-8') as f:
        schedule = json.load(f)
    snap = db.collection('config').document('examSchedule').get()
    if snap.exists:
        for sem, exams in ((snap.to_dict() or {}).get('exams') or {}).items():
            if isinstance(exams, list):
                schedule[sem] = exams
    return schedule


def due_reminders(schedule, today):
    """Pure function: [(semester, exam, kind, days)] for exams exactly 7 days
    or 1 day away from `today` (a date)."""
    out = []
    for sem, exams in schedule.items():
        if sem not in SEMESTER_ORDER:
            continue
        for exam in exams or []:
            try:
                exam_day = date.fromisoformat(str(exam.get('date')))
            except Exception:
                continue
            days = (exam_day - today).days
            if days in REMIND_DAYS:
                out.append((sem, exam, REMIND_DAYS[days], days))
    return out


def message_for(exam, kind):
    name = _clean(exam.get('label') or exam.get('subject'), 55)
    note = _clean(exam.get('note'), 30)
    tail = f' ({note})' if note else ''
    exam_day = date.fromisoformat(str(exam['date']))
    pretty = f"{exam_day.day} {exam_day.strftime('%b')}"
    if kind == 'week':
        return (f'📅 {name} exam in 1 week',
                f'{name} is on {pretty}{tail}. Start revising now - a quick quiz a day adds up.')
    return (f'⏰ {name} exam tomorrow',
            f'Last push before {name}{tail}. Try a quick quiz today. Good luck!')


def reminder_key(sem, exam, kind):
    slug = re.sub(r'[^a-z0-9]+', '_', str(exam.get('subject', '')).lower()).strip('_')[:40]
    return f"{sem}__{slug}__{exam.get('date')}__{kind}"


def run_exam_reminders(dry):
    _init_admin()
    db = firestore.client()
    now = datetime.now(timezone.utc)
    today = now.astimezone(KG).date()
    due = due_reminders(load_schedule(db), today)

    state_ref = db.collection('adminMeta').document('examReminders')
    state = state_ref.get()
    already = ((state.to_dict() or {}).get('sent') or {}) if state.exists else {}

    all_devices, sem_of = None, {}  # loaded once, only if something is due
    report = []
    for sem, exam, kind, days in due:
        key = reminder_key(sem, exam, kind)
        title, body = message_for(exam, kind)
        row = {'semester': sem, 'subject': exam.get('subject'), 'kind': kind, 'title': title}
        if key in already:
            report.append({**row, 'result': 'already-sent'})
            continue
        if all_devices is None:
            all_devices = _collect_devices(db)
            uids = sorted({u for u, _, _ in all_devices})
            sem_of = _semester_by_uid(db, uids) if uids else {}
        devices = [d for d in all_devices if sem_of.get(d[0]) == sem]
        if dry:
            report.append({**row, 'result': 'dry-run', 'devices': len(devices)})
            continue
        # Mark first: if the send dies half-way we'd rather skip a few
        # students than notify everyone twice on a retry.
        state_ref.set({'sent': {key: firestore.SERVER_TIMESTAMP}}, merge=True)
        sent = failed = 0
        data = {'title': title, 'body': body, 'url': '/', 'screen': 'home',
                'kind': 'broadcast', 'tag': f'exam-{key}'[:100]}
        for i in range(0, len(devices), BATCH):
            chunk = devices[i:i + BATCH]
            msgs = [messaging.Message(token=t, data=data,
                                      webpush=messaging.WebpushConfig(headers={'Urgency': 'high', 'TTL': '43200'}))
                    for _, t, _ in chunk]
            result = messaging.send_each(msgs)
            for (_, _, ref), resp in zip(chunk, result.responses):
                if resp.success:
                    sent += 1
                else:
                    failed += 1
                    if isinstance(resp.exception, (messaging.UnregisteredError, messaging.SenderIdMismatchError)):
                        ref.delete()  # stale device
        num = SEMESTER_ORDER.index(sem) + 1
        db.collection('broadcasts').add({
            'title': title, 'body': body, 'screen': 'home',
            'audience': {'type': 'semesters', 'semesters': [sem]},
            'audienceLabel': f'Semester {num} \u00b7 auto reminder',
            'sent': sent, 'failed': failed, 'devices': len(devices),
            'students': len({u for u, _, _ in devices}),
            'by': 'auto', 'sentAt': firestore.SERVER_TIMESTAMP,
        })
        report.append({**row, 'result': 'sent', 'sent': sent, 'failed': failed, 'devices': len(devices)})
    return {'ok': True, 'today': today.isoformat(), 'dry': dry, 'reminders': report}



def has_second_factor(decoded):
    """Admin actions need a token from a sign-in that used the authenticator
    app (two-step login). Plain password / Google-only sessions are refused."""
    return (decoded.get('firebase') or {}).get('sign_in_second_factor') == 'totp'


# ── backup of payment + subscriber data ─────────────────────

def _backup_value(v):
    """Firestore value -> JSON-safe, in a form scripts/restore_backup.py can undo."""
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return {'__ts__': v.astimezone(timezone.utc).isoformat()}
    if isinstance(v, (bytes, bytearray)):
        return {'__bytes__': base64.b64encode(bytes(v)).decode('ascii')}
    if hasattr(v, 'path') and hasattr(v, 'id') and hasattr(v, 'parent'):  # DocumentReference
        return {'__ref__': v.path}
    if isinstance(v, dict):
        return {str(k): _backup_value(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_backup_value(x) for x in v]
    return v


def collect_backup(db):
    """{'collections': {name: {docId: data}}, 'docs': {path: data}}"""
    out = {'collections': {}, 'docs': {}}
    for name in BACKUP_COLLECTIONS:
        out['collections'][name] = {d.id: _backup_value(d.to_dict() or {}) for d in db.collection(name).stream()}
    for coll, doc_id in BACKUP_SINGLE_DOCS:
        snap = db.collection(coll).document(doc_id).get()
        if snap.exists:
            out['docs'][f'{coll}/{doc_id}'] = _backup_value(snap.to_dict() or {})
    return out


def _csv_cell(v):
    if isinstance(v, dict) and set(v) == {'__ts__'}:
        v = v['__ts__']
    elif isinstance(v, (dict, list)):
        v = json.dumps(v, ensure_ascii=False)
    elif v is None:
        v = ''
    v = str(v)
    # Spreadsheet formula injection: student-typed text must not run as a formula.
    return "'" + v if v[:1] in ('=', '+', '-', '@', '\t', '\r') else v


def _csv_bytes(docs):
    cols = sorted({k for d in docs.values() for k in d})
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(['id'] + cols)
    for doc_id, d in sorted(docs.items()):
        w.writerow([_csv_cell(doc_id)] + [_csv_cell(d.get(c)) for c in cols])
    return buf.getvalue().encode('utf-8-sig')  # BOM so Excel reads UTF-8 names correctly


def _backup_counts(data):
    pay = data['collections'].get('paymentRequests', {})
    by_status = {}
    for d in pay.values():
        st = str(d.get('status') or 'unknown')
        by_status[st] = by_status.get(st, 0) + 1
    return {
        'paymentRequests': len(pay),
        'paymentsByStatus': by_status,
        'activationCodes': len(data['collections'].get('activationCodes', {})),
    }


def run_backup(db, trigger, dry=False):
    now = datetime.now(timezone.utc)
    day = now.astimezone(KG).date().isoformat()
    meta_ref = db.collection('adminMeta').document('backup')
    prev = meta_ref.get()
    prev_counts = ((prev.to_dict() or {}).get('counts') or {}) if prev.exists else {}

    status = {'trigger': trigger, 'ok': False, 'error': None, 'counts': None, 'to': BACKUP_TO, 'bytes': 0}
    try:
        data = collect_backup(db)
        counts = _backup_counts(data)
        status['counts'] = counts
        if dry:
            return {'ok': True, 'dry': True, 'day': day, 'counts': counts, 'to': BACKUP_TO}

        key = os.environ.get('RESEND_API_KEY')
        if not key:
            raise RuntimeError('RESEND_API_KEY is not configured.')
        if not BACKUP_TO:
            raise RuntimeError('No backup recipient (BACKUP_EMAIL_TO).')

        payload = {'backupVersion': 1, 'createdAt': now.isoformat(), 'counts': counts, **data}
        raw = json.dumps(payload, ensure_ascii=False, indent=1).encode('utf-8')
        files = [(f'med101-backup-{day}.json', raw)]
        if len(raw) > GZIP_ABOVE_BYTES:
            files = [(f'med101-backup-{day}.json.gz', gzip.compress(raw))]
        files.append((f'payments-{day}.csv', _csv_bytes(data['collections']['paymentRequests'])))
        files.append((f'activation-codes-{day}.csv', _csv_bytes(data['collections']['activationCodes'])))
        status['bytes'] = sum(len(b) for _, b in files)

        # A sharp drop since the previous backup is the early warning for
        # accidental deletion, so flag it right in the subject line.
        warn = ''
        for k in ('paymentRequests', 'activationCodes'):
            before, after = prev_counts.get(k), counts[k]
            if isinstance(before, int) and before >= 5 and after < before * 0.8:
                warn = '\u26a0\ufe0f '
        subject = f"{warn}Med101 backup {day}: {counts['paymentRequests']} payments, {counts['activationCodes']} premium codes"
        st = ', '.join(f'{n} {k}' for k, n in sorted(counts['paymentsByStatus'].items())) or 'none'
        text = (
            f"Med101 payment + subscriber backup for {day}.\n\n"
            f"Payments: {counts['paymentRequests']} ({st})\nPremium codes: {counts['activationCodes']}\n\n"
            "The .json file is the complete copy and is what the restore script reads. "
            "The .csv files are for reading in Excel/Sheets.\n"
            "Keep these emails: they are your restore point if the database is ever lost or wiped."
            + ("\n\nWARNING: the counts dropped sharply since the last backup. Check the data." if warn else '')
        )
        resp = requests.post(
            'https://api.resend.com/emails',
            headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
            json={
                'from': FROM_EMAIL, 'to': BACKUP_TO, 'reply_to': REPLY_TO_EMAIL,
                'subject': subject, 'text': text,
                'attachments': [{'filename': n, 'content': base64.b64encode(b).decode('ascii')} for n, b in files],
            },
            timeout=25,
        )
        if resp.status_code >= 300:
            raise RuntimeError(f'Resend error {resp.status_code}: {resp.text[:200]}')
        status['ok'] = True
        return {'ok': True, 'day': day, 'counts': counts, 'to': BACKUP_TO, 'bytes': status['bytes'], 'warning': bool(warn)}
    except Exception as e:
        status['error'] = str(e)[:300]
        raise
    finally:
        if not dry:
            try:
                meta_ref.set({**status, 'lastRunAt': firestore.SERVER_TIMESTAMP}, merge=True)
            except Exception:
                pass


def backup_status(db):
    snap = db.collection('adminMeta').document('backup').get()
    d = (snap.to_dict() or {}) if snap.exists else {}
    at = d.get('lastRunAt')
    return {
        'ok': True,
        'lastRunAt': at.isoformat() if at else None,
        'lastOk': d.get('ok'),
        'error': d.get('error'),
        'counts': d.get('counts'),
        'to': d.get('to') or BACKUP_TO,
        'trigger': d.get('trigger'),
        'bytes': d.get('bytes'),
        'lastRunMs': at.timestamp() * 1000 if at else None,
    }


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

    def do_GET(self):
        # Only the daily Vercel cron uses GET on this endpoint.
        secret = os.environ.get('CRON_SECRET', '')
        if not secret:
            return self._send(503, {'error': 'CRON_SECRET is not configured.'})
        supplied = self.headers.get('Authorization', '')
        if not hmac.compare_digest(supplied, f'Bearer {secret}'):
            return self._send(401, {'error': 'Unauthorized.'})
        q = parse_qs(urlparse(self.path).query)
        dry = q.get('dry') == ['1']
        job = (q.get('job') or ['all'])[0]
        if job not in ('all', 'exam', 'backup'):
            return self._send(400, {'error': 'Unknown job.'})
        # The daily cron calls this with no job and runs both. They are
        # isolated: a failure in one never stops the other.
        out, failed = {}, False
        if job in ('all', 'exam'):
            try:
                out['exam'] = run_exam_reminders(dry)
            except Exception as e:
                out['exam'] = {'ok': False, 'error': str(e)[:300]}
                failed = True
        if job in ('all', 'backup'):
            try:
                _init_admin()
                out['backup'] = run_backup(firestore.client(), 'cron', dry)
            except Exception as e:
                out['backup'] = {'ok': False, 'error': str(e)[:300]}
                failed = True
        return self._send(500 if failed else 200, {'ok': not failed, **out})

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
        if not has_second_factor(decoded):
            return self._send(403, {'error': 'Two-step login required. Sign out, sign back in and enter your authenticator code.'})

        try:
            length = int(self.headers.get('Content-Length', 0))
            payload = json.loads((self.rfile.read(length) if length else b'') or b'{}')
        except Exception as e:
            return self._send(400, {'error': f'Invalid request body: {e}'})

        db = firestore.client()
        action = payload.get('action') or 'send'
        try:
            if action == 'stats':
                return self._stats(db)
            if action == 'history':
                return self._history(db)
            if action == 'backup-status':
                return self._send(200, backup_status(db))
            if action == 'backup-now':
                st = backup_status(db)
                if st['lastRunMs'] and time.time() * 1000 - st['lastRunMs'] < BACKUP_COOLDOWN_S * 1000:
                    return self._send(429, {'error': 'A backup just ran. Wait a moment.'})
                return self._send(200, run_backup(db, 'manual'))
            if action in ('send', 'test'):
                return self._deliver(db, decoded, payload, test=(action == 'test'))
        except Exception as e:
            return self._send(500, {'error': f'Something went wrong: {e}'})
        return self._send(400, {'error': 'Unknown action.'})

    # ── actions ──────────────────────────────────────────────

    def _stats(self, db):
        devices = _collect_devices(db)
        uids = sorted({u for u, _, _ in devices})
        sem = _semester_by_uid(db, uids) if uids else {}
        by_sem = {s: {'devices': 0, 'students': 0} for s in SEMESTER_ORDER}
        for u in uids:
            by_sem[sem[u]]['students'] += 1
        for u, _, _ in devices:
            by_sem[sem[u]]['devices'] += 1
        return self._send(200, {
            'ok': True, 'devices': len(devices), 'students': len(uids), 'bySemester': by_sem,
        })

    def _history(self, db):
        rows = []
        q = db.collection('broadcasts').order_by('sentAt', direction=firestore.Query.DESCENDING).limit(15)
        for d in q.stream():
            x = d.to_dict() or {}
            sent_at = x.get('sentAt')
            rows.append({
                'id': d.id,
                'title': x.get('title'),
                'body': x.get('body'),
                'audience': x.get('audienceLabel'),
                'screen': x.get('screen'),
                'sent': x.get('sent', 0),
                'failed': x.get('failed', 0),
                'devices': x.get('devices', 0),
                'sentAt': sent_at.isoformat() if sent_at else None,
            })
        return self._send(200, {'ok': True, 'history': rows})

    def _deliver(self, db, decoded, payload, test):
        title = _clean(payload.get('title'), 60)
        body = _clean(payload.get('body'), 200)
        screen = payload.get('screen') or 'home'
        if screen not in SCREENS:
            screen = 'home'
        if not title or not body:
            return self._send(400, {'error': 'Title and message are required.'})

        audience = payload.get('audience') or {'type': 'all'}
        if not test:
            atype = audience.get('type')
            if atype == 'semesters':
                sems = [s for s in (audience.get('semesters') or []) if s in SEMESTER_ORDER]
                if not sems:
                    return self._send(400, {'error': 'Pick at least one semester.'})
                audience = {'type': 'semesters', 'semesters': sems}
            elif atype == 'student':
                name = str(audience.get('username') or '').strip().lstrip('@').lower()
                if not name:
                    return self._send(400, {'error': 'Enter a username.'})
                snap = db.collection('usernames').document(username_doc_id(name)).get()
                if not snap.exists:
                    return self._send(404, {'error': f'No student with the username "{name}".'})
                audience = {'type': 'student', 'username': name, 'uid': (snap.to_dict() or {}).get('uid')}
            else:
                audience = {'type': 'all'}

        # Cooldown for real sends only (a test to yourself is always allowed).
        if not test:
            meta_ref = db.collection('adminMeta').document('broadcastState')
            meta = meta_ref.get()
            last = (meta.to_dict() or {}).get('lastSentAt') if meta.exists else None
            if last is not None and time.time() - last.timestamp() < COOLDOWN_S:
                return self._send(429, {'error': 'A broadcast was just sent. Wait a moment.'})

        if test:
            devices = _collect_devices(db, only_uid=decoded['uid'])
            if not devices:
                return self._send(200, {'ok': True, 'sent': 0, 'devices': 0, 'reason': 'no-devices'})
        elif audience['type'] == 'student':
            devices = _collect_devices(db, only_uid=audience['uid'])
        else:
            devices = _collect_devices(db)
            if audience['type'] == 'semesters':
                uids = sorted({u for u, _, _ in devices})
                sem = _semester_by_uid(db, uids) if uids else {}
                wanted = set(audience['semesters'])
                devices = [d for d in devices if sem.get(d[0]) in wanted]

        if not test:
            # Persist an in-app inbox item for every targeted account, including
            # students without push permission/device tokens. Push delivery and
            # the in-app notification center are deliberately independent.
            if audience['type'] == 'student':
                target_uids = [audience['uid']]
            else:
                target_uids = [d.id for d in db.collection('users').stream()]
                if audience['type'] == 'semesters' and target_uids:
                    sem_of = _semester_by_uid(db, target_uids)
                    wanted = set(audience['semesters'])
                    target_uids = [u for u in target_uids if sem_of.get(u) in wanted]
            sent_at = firestore.SERVER_TIMESTAMP
            for uid in target_uids:
                db.collection('users').document(uid).collection('notifications').add({
                    'title': title, 'body': body, 'screen': screen,
                    'kind': 'broadcast', 'createdAt': sent_at, 'read': False,
                    'by': decoded.get('email'),
                })

        if not devices:
            if not test:
                db.collection('broadcasts').add({
                    'title': title, 'body': body, 'screen': screen,
                    'audience': {k: v for k, v in audience.items() if k != 'uid'},
                    'audienceLabel': _audience_label(audience),
                    'sent': 0, 'failed': 0, 'devices': 0, 'students': len(target_uids),
                    'by': decoded.get('email'), 'sentAt': firestore.SERVER_TIMESTAMP,
                })
                db.collection('adminMeta').document('broadcastState').set(
                    {'lastSentAt': firestore.SERVER_TIMESTAMP, 'by': decoded.get('email')})
            return self._send(200, {'ok': True, 'sent': 0, 'devices': 0, 'reason': 'no-devices'})


        if not test:
            db.collection('adminMeta').document('broadcastState').set(
                {'lastSentAt': firestore.SERVER_TIMESTAMP, 'by': decoded.get('email')})

        data = {
            'title': title, 'body': body, 'url': _url_for(screen), 'screen': screen,
            'kind': 'broadcast', 'tag': f'broadcast-{int(time.time())}',
        }
        sent = failed = removed = 0
        try:
            for i in range(0, len(devices), BATCH):
                chunk = devices[i:i + BATCH]
                messages = [
                    messaging.Message(
                        token=t, data=data,
                        webpush=messaging.WebpushConfig(headers={'Urgency': 'high', 'TTL': '86400'}),
                    )
                    for _, t, _ in chunk
                ]
                result = messaging.send_each(messages)
                for (_, _, ref), resp in zip(chunk, result.responses):
                    if resp.success:
                        sent += 1
                    else:
                        failed += 1
                        if isinstance(resp.exception, (messaging.UnregisteredError, messaging.SenderIdMismatchError)):
                            ref.delete()  # stale device
                            removed += 1
        except Exception as e:
            return self._send(500, {'error': f'Broadcast failed part-way: {e}', 'sent': sent})

        students = len({u for u, _, _ in devices})
        if not test:
            db.collection('broadcasts').add({
                'title': title, 'body': body, 'screen': screen,
                'audience': {k: v for k, v in audience.items() if k != 'uid'},
                'audienceLabel': _audience_label(audience),
                'sent': sent, 'failed': failed, 'devices': len(devices), 'students': students,
                'by': decoded.get('email'), 'sentAt': firestore.SERVER_TIMESTAMP,
            })
        return self._send(200, {
            'ok': True, 'sent': sent, 'failed': failed, 'removed': removed,
            'devices': len(devices), 'students': students,
        })
