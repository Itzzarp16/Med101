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

Env vars (already set): FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
"""

import json
import os
import re
import time
from datetime import datetime, timezone
from urllib.parse import quote

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

        db = firestore.client()
        action = payload.get('action') or 'send'
        try:
            if action == 'stats':
                return self._stats(db)
            if action == 'history':
                return self._history(db)
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

        if not devices:
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
