"""
Vercel cron job (daily, see vercel.json): sends an automatic push reminder
to every student whose CURRENT semester has an exam in 7 days or tomorrow.

Exam dates come from src/data/examSchedule.json (built-in defaults, bundled
via "includeFiles" in vercel.json) and, when an admin has edited a semester
in Admin -> Exam Schedule, from Firestore config/examSchedule.exams[semester],
which replaces that semester's defaults.

Security: Vercel calls this with "Authorization: Bearer <CRON_SECRET>" once a
CRON_SECRET env var exists. If it is not set, or does not match, nothing runs.
Add ?dry=1 (with the same header) to see what WOULD be sent without sending.

Sent reminders are remembered in adminMeta/examReminders so a retried or
double-fired cron never notifies anyone twice. Sends also appear in the
admin "Recently sent" list as "Semester N - auto reminder".

Env vars: CRON_SECRET (new), FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL,
FIREBASE_PRIVATE_KEY (already set).
"""

import hmac
import json
import os
import re
import time
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlparse, parse_qs

from http.server import BaseHTTPRequestHandler

import firebase_admin
from firebase_admin import credentials, firestore, messaging

# Kyrgyzstan has no daylight saving: always UTC+6.
KG = timezone(timedelta(hours=6))
REMIND_DAYS = {7: 'week', 1: 'day'}
BATCH = 500

# Mirror of SEMESTER_ORDER / DEFAULT_CALENDAR in src/lib/academicCalendar.js
# (same logic as api/admin/send-broadcast.py).
SEMESTER_ORDER = ['y1s1', 'y1s2', 'y2s1', 'y2s2', 'y3s1', 'y3s2']
DEFAULT_CALENDAR = {
    'y1s1': '2025-09-01', 'y1s2': '2026-02-01', 'y2s1': '2099-01-01',
    'y2s2': '2099-06-01', 'y3s1': '2099-11-01', 'y3s2': '2100-04-01',
}
DEFAULTS_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'data', 'examSchedule.json')

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


def _parse_date(value):
    try:
        d = datetime.fromisoformat(str(value))
    except Exception:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def resolve_current_semester(enrolled, calendar, now):
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


def _devices_for_semester(db, semester, calendar, now):
    seen, devices = set(), []
    for d in db.collection_group('pushTokens').stream():
        t = (d.to_dict() or {}).get('token')
        if t and t not in seen:
            seen.add(t)
            devices.append((d.reference.parent.parent.id, t, d.reference))
    uids = sorted({u for u, _, _ in devices})
    refs = [db.collection('users').document(u) for u in uids]
    enrolled = {}
    for i in range(0, len(refs), 300):
        for snap in db.get_all(refs[i:i + 300], field_paths=['enrolledYearSemester']):
            enrolled[snap.id] = (snap.to_dict() or {}).get('enrolledYearSemester') if snap.exists else None
    return [dv for dv in devices
            if resolve_current_semester(enrolled.get(dv[0]), calendar, now) == semester]


def _calendar(db):
    cal = dict(DEFAULT_CALENDAR)
    snap = db.collection('config').document('academicCalendar').get()
    if snap.exists:
        for k, v in (snap.to_dict() or {}).items():
            if isinstance(v, str):
                cal[k] = v
    return cal


def run(dry):
    _init_admin()
    db = firestore.client()
    now = datetime.now(timezone.utc)
    today = now.astimezone(KG).date()
    schedule = load_schedule(db)
    due = due_reminders(schedule, today)

    state_ref = db.collection('adminMeta').document('examReminders')
    state = state_ref.get()
    already = ((state.to_dict() or {}).get('sent') or {}) if state.exists else {}
    calendar = _calendar(db) if due else {}

    report = []
    for sem, exam, kind, days in due:
        key = reminder_key(sem, exam, kind)
        title, body = message_for(exam, kind)
        row = {'semester': sem, 'subject': exam.get('subject'), 'kind': kind, 'title': title}
        if key in already:
            report.append({**row, 'result': 'already-sent'})
            continue
        devices = _devices_for_semester(db, sem, calendar, now)
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
                        ref.delete()
        num = SEMESTER_ORDER.index(sem) + 1
        db.collection('broadcasts').add({
            'title': title, 'body': body, 'screen': 'home',
            'audience': {'type': 'semesters', 'semesters': [sem]},
            'audienceLabel': f'Semester {num} · auto reminder',
            'sent': sent, 'failed': failed, 'devices': len(devices),
            'students': len({u for u, _, _ in devices}),
            'by': 'auto', 'sentAt': firestore.SERVER_TIMESTAMP,
        })
        report.append({**row, 'result': 'sent', 'sent': sent, 'failed': failed, 'devices': len(devices)})
    return {'ok': True, 'today': today.isoformat(), 'dry': dry, 'reminders': report}


class handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        payload = json.dumps(body).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        secret = os.environ.get('CRON_SECRET', '')
        if not secret:
            return self._send(503, {'error': 'CRON_SECRET is not configured.'})
        supplied = self.headers.get('Authorization', '')
        if not hmac.compare_digest(supplied, f'Bearer {secret}'):
            return self._send(401, {'error': 'Unauthorized.'})
        dry = parse_qs(urlparse(self.path).query).get('dry') == ['1']
        try:
            return self._send(200, run(dry))
        except Exception as e:
            return self._send(500, {'error': f'Reminder run failed: {e}'})
