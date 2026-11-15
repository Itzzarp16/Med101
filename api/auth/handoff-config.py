"""
GET /api/auth/handoff-config  ->  {"enabled": true|false}

Tells visitors who are not signed in whether the "sign in on
auth.med101.space" page is switched on (Admin portal -> Sign-in page).
They cannot read Firestore themselves, so this returns just that one flag.
Any problem reads as "off", so the normal login keeps working.
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(__file__))

from firebase_admin import firestore  # noqa: E402
from _fb import init_admin  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        enabled = False
        try:
            init_admin()
            snap = firestore.client().collection('config').document('authHandoff').get()
            enabled = bool(snap.exists and snap.to_dict().get('enabled') is True)
        except Exception as e:  # noqa: BLE001
            print('handoff-config failed:', e)
        body = json.dumps({'enabled': enabled}).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=20')
        self.end_headers()
        self.wfile.write(body)
