"""Shared Firebase Admin init for the auth hand-off endpoints.
(The leading underscore keeps Vercel from treating this file as a route.)"""
import os

import firebase_admin
from firebase_admin import credentials

# Must match ADMIN_EMAILS in src/lib/AuthContext.jsx / api/admin/delete-account.py.
ADMIN_EMAILS = {
    'admin.med101@gmail.com',
    'admin1.med101@gmail.com',
    'admin2.med101@gmail.com',
}

_app = None


def init_admin():
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
