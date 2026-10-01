#!/usr/bin/env python3
"""Restore Med101 payment + subscriber data from a backup email attachment.

The daily backup email carries med101-backup-YYYY-MM-DD.json (or .json.gz when
large). This puts paymentRequests, activationCodes and config/subscription back
into Firestore.

Safe by default:
  * Dry run unless you pass --apply (prints what it WOULD do).
  * Only creates documents that are missing. Existing documents are left alone,
    so restoring an old backup can't overwrite newer data. Pass --overwrite to
    replace existing documents with the backup's version.

Easiest place to run it is Google Cloud Shell (already signed in to your project):

    pip install firebase-admin
    python3 restore_backup.py med101-backup-2026-10-01.json --project med101-1
    python3 restore_backup.py med101-backup-2026-10-01.json --project med101-1 --apply

Elsewhere, first run:  gcloud auth application-default login
(or set GOOGLE_APPLICATION_CREDENTIALS to a service-account key file).
"""

import argparse
import base64
import gzip
import json
import sys
from datetime import datetime, timezone


def decode(v, db=None):
    """Undo the tagging done by the backup: {'__ts__': iso} -> datetime, etc."""
    if isinstance(v, dict):
        if set(v) == {'__ts__'}:
            return datetime.fromisoformat(v['__ts__']).astimezone(timezone.utc)
        if set(v) == {'__bytes__'}:
            return base64.b64decode(v['__bytes__'])
        if set(v) == {'__ref__'}:
            return db.document(v['__ref__']) if db is not None else v['__ref__']
        return {k: decode(x, db) for k, x in v.items()}
    if isinstance(v, list):
        return [decode(x, db) for x in v]
    return v


def load(path):
    opener = gzip.open if path.endswith('.gz') else open
    with opener(path, 'rt', encoding='utf-8') as f:
        data = json.load(f)
    if data.get('backupVersion') != 1:
        sys.exit('This does not look like a Med101 backup file (backupVersion != 1).')
    return data


def plan(data):
    """[(path, doc_dict_with_tags)] for everything in the backup."""
    items = []
    for coll, docs in data.get('collections', {}).items():
        for doc_id, d in docs.items():
            items.append((f'{coll}/{doc_id}', d))
    for path, d in data.get('docs', {}).items():
        items.append((path, d))
    return items


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('backup', help='path to med101-backup-....json or .json.gz')
    ap.add_argument('--project', required=True, help='Firebase project id, e.g. med101-1')
    ap.add_argument('--apply', action='store_true', help='actually write (default is a dry run)')
    ap.add_argument('--overwrite', action='store_true', help='replace documents that already exist')
    args = ap.parse_args()

    data = load(args.backup)
    items = plan(data)
    print(f"Backup from {data.get('createdAt')}: {len(items)} documents "
          f"({', '.join(f'{k}={len(v)}' for k, v in data.get('collections', {}).items())})")

    import firebase_admin
    from firebase_admin import firestore
    firebase_admin.initialize_app(options={'projectId': args.project})
    db = firestore.client()

    created = overwritten = skipped = 0
    for path, raw in items:
        ref = db.document(path)
        exists = ref.get().exists
        if exists and not args.overwrite:
            skipped += 1
            continue
        if args.apply:
            ref.set(decode(raw, db))
        if exists:
            overwritten += 1
        else:
            created += 1

    verb = 'Wrote' if args.apply else 'Would write'
    print(f'{verb}: {created} new, {overwritten} overwritten. Left alone (already exist): {skipped}.')
    if not args.apply:
        print('Dry run only. Re-run with --apply to restore.')


if __name__ == '__main__':
    main()
