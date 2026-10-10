import base64, json, os, re
from http.server import BaseHTTPRequestHandler
import requests
import firebase_admin
from firebase_admin import credentials, auth as fb_auth, firestore

ADMIN_EMAILS = {'admin.med101@gmail.com', 'admin1.med101@gmail.com', 'admin2.med101@gmail.com'}
ALLOWED_ORIGINS = {'https://med101.space', 'https://www.med101.space'}
SEMESTERS = {'y1s1':'semester-1','y1s2':'semester-2','y2s1':'semester-3','y2s2':'semester-4','y3s1':'semester-5','y3s2':'semester-6'}
MANIFEST = 'public/answer-keys/manifest.json'
_app = None

def init_admin():
    global _app
    if _app is not None:
        return
    if firebase_admin._apps:
        _app = firebase_admin.get_app()
        return
    key = os.environ.get('FIREBASE_PRIVATE_KEY', '').replace('\\n', '\n')
    _app = firebase_admin.initialize_app(credentials.Certificate({
        'type':'service_account','project_id':os.environ.get('FIREBASE_PROJECT_ID'),
        'client_email':os.environ.get('FIREBASE_CLIENT_EMAIL'),'private_key':key,
        'token_uri':'https://oauth2.googleapis.com/token'
    }))

def gh_headers(token):
    return {'Authorization':f'Bearer {token}','Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}

def gh_get(url, headers, branch):
    r = requests.get(url, headers=headers, params={'ref':branch}, timeout=25)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json()

def gh_put(url, headers, branch, content, message, sha=None):
    payload = {'message':message,'content':base64.b64encode(content).decode('ascii'),'branch':branch}
    if sha:
        payload['sha'] = sha
    r = requests.put(url, headers=headers, json=payload, timeout=45)
    r.raise_for_status()

class handler(BaseHTTPRequestHandler):
    def send_json(self, status, value):
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Cache-Control','no-store')
        origin = self.headers.get('Origin')
        if origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin',origin)
            self.send_header('Vary','Origin')
        self.end_headers()
        self.wfile.write(json.dumps(value,ensure_ascii=False).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(204)
        origin = self.headers.get('Origin')
        if origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin',origin)
        self.send_header('Access-Control-Allow-Methods','POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers','Content-Type, Authorization')
        self.end_headers()

    def do_POST(self):
        origin = self.headers.get('Origin')
        if origin and origin not in ALLOWED_ORIGINS:
            return self.send_json(403,{'error':'Origin not allowed.'})
        parts = self.headers.get('Authorization','').split(' ',1)
        if len(parts) != 2 or parts[0].lower() != 'bearer':
            return self.send_json(401,{'error':'Missing Firebase authentication.'})
        try:
            length = int(self.headers.get('Content-Length',0) or 0)
            body = json.loads(self.rfile.read(length) or b'{}')
        except Exception:
            return self.send_json(400,{'error':'Invalid JSON body.'})
        try:
            init_admin()
            decoded = fb_auth.verify_id_token(parts[1])
        except Exception:
            return self.send_json(401,{'error':'Invalid or expired session. Please sign in again.'})
        email = decoded.get('email')
        if email not in ADMIN_EMAILS:
            return self.send_json(403,{'error':'Admin access required.'})
        if (decoded.get('firebase') or {}).get('sign_in_second_factor') != 'totp':
            return self.send_json(403,{'error':'Two-step login required. Sign out and sign in again with your authenticator code.'})

        semester_id = body.get('semesterId')
        subject = ' '.join(str(body.get('subject') or '').split())[:120]
        upload_id = str(body.get('uploadId') or '')
        try:
            chunk_count = int(body.get('chunkCount') or 0)
        except (TypeError,ValueError):
            chunk_count = 0
        if semester_id not in SEMESTERS or not subject or not upload_id or not upload_id[:1].isdigit() or not 1 <= chunk_count <= 30:
            return self.send_json(400,{'error':'Choose a semester, enter a subject, and upload a valid PDF.'})

        refs = [firestore.client().collection('pdfUploadChunks').document(f'{upload_id}_{i}') for i in range(chunk_count)]
        try:
            snaps = [ref.get() for ref in refs]
            if not all(s.exists and (s.to_dict() or {}).get('uploadId') == upload_id for s in snaps):
                return self.send_json(400,{'error':'PDF upload is incomplete. Please try again.'})
            pdf_bytes = base64.b64decode(''.join((s.to_dict() or {}).get('data','') for s in snaps),validate=True)
        except Exception:
            return self.send_json(400,{'error':'Could not reassemble the PDF. Please try again.'})
        finally:
            for ref in refs:
                try: ref.delete()
                except Exception: pass
        if not pdf_bytes.startswith(b'%PDF-'):
            return self.send_json(400,{'error':'The selected file is not a valid PDF.'})
        if len(pdf_bytes) > 15*1024*1024:
            return self.send_json(413,{'error':'PDFs must be 15 MB or smaller.'})

        token = os.environ.get('GITHUB_TOKEN')
        if not token:
            return self.send_json(503,{'error':'GitHub publishing is not configured. Add GITHUB_TOKEN in Vercel Environment Variables.'})
        repo = os.environ.get('GITHUB_REPO','Itzzarp16/Med101')
        branch = os.environ.get('GITHUB_BRANCH','react-rebuild')
        folder = SEMESTERS[semester_id]
        slug = re.sub(r'[^a-z0-9]+','-',subject.lower()).strip('-')[:90].strip('-')
        if not slug:
            return self.send_json(400,{'error':'Please enter a valid subject name.'})
        filename = slug + '.pdf'
        path = f'public/answer-keys/{folder}/{filename}'
        root = f'https://api.github.com/repos/{repo}/contents/'
        headers = gh_headers(token)
        try:
            old_pdf = gh_get(root+path,headers,branch)
            gh_put(root+path,headers,branch,pdf_bytes,f'Publish answer key: {subject} ({folder})',old_pdf.get('sha') if old_pdf else None)

            old_manifest = gh_get(root+MANIFEST,headers,branch)
            manifest_sha = old_manifest.get('sha') if old_manifest else None
            manifest = json.loads(base64.b64decode(old_manifest.get('content') or '').decode('utf-8')) if old_manifest else {'pdfs':[]}
            if not isinstance(manifest,dict) or not isinstance(manifest.get('pdfs'),list):
                manifest = {'pdfs':[]}
            public_path = '/' + path.removeprefix('public/')
            item = {'semesterId':semester_id,'subject':subject,'filename':filename,'path':public_path}
            pdfs = [p for p in manifest['pdfs'] if not (p.get('semesterId')==semester_id and p.get('filename')==filename)]
            pdfs.append(item)
            order = list(SEMESTERS)
            pdfs.sort(key=lambda p:(order.index(p['semesterId']) if p.get('semesterId') in order else 99,p.get('subject','').lower()))
            new_manifest = (json.dumps({'pdfs':pdfs},ensure_ascii=False,indent=2)+'\n').encode('utf-8')
            gh_put(root+MANIFEST,headers,branch,new_manifest,f'Update answer-key index: {subject} ({folder})',manifest_sha)
        except requests.HTTPError as e:
            detail = ''
            try: detail = e.response.text[:220]
            except Exception: pass
            return self.send_json(502,{'error':'GitHub rejected the upload. Check GITHUB_TOKEN has Contents read/write access. '+detail})
        except Exception as e:
            return self.send_json(502,{'error':'Could not publish to GitHub: '+str(e)[:220]})
        return self.send_json(200,{'success':True,'subject':subject,'semesterId':semester_id,'path':public_path,'message':'PDF committed to GitHub. It will appear after Vercel finishes deploying the new commit.'})
