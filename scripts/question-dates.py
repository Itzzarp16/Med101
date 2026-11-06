#!/usr/bin/env python3
"""Rebuilds public/data/question-dates.json: for every main subject, when questions were
last ADDED (the newest commit where its question count went up) across the semester JSON
files in this repo's git history. Needs the full history (git fetch --unshallow).

Questions uploaded from the admin screen are dated automatically (Firestore updatedAt, or
subjectMeta.addedAt for GitHub saves), so this only matters for questions committed by hand.
Run:  python3 scripts/question-dates.py   then commit public/data/question-dates.json
"""
import datetime as dt
import json
import subprocess
from collections import Counter

FILES = ['y1s1', 'y1s2', 'y2s1', 'y2s2']


def git(*args):
    return subprocess.check_output(['git', *args], text=True, stderr=subprocess.DEVNULL)


def counts_at(commit, path):
    try:
        data = json.loads(git('show', f'{commit}:{path}'))
    except Exception:
        return None  # file missing or not JSON at that commit
    group = data.get('subjectGroup', {})
    return Counter(group.get(q.get('s'), q.get('s')) for q in data.get('questions', []))


out = {}
for name in FILES:
    path = f'public/data/{name}.json'
    log = git('log', '--reverse', '--format=%H %cI', '--', path).split('\n')
    prev = Counter()
    for line in filter(None, log):
        commit, iso = line.split(' ')
        now = counts_at(commit, path)
        if now is None:
            continue
        when = dt.datetime.fromisoformat(iso).astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        for subject, n in now.items():
            if subject and n > prev.get(subject, 0):
                out[subject] = max(out.get(subject, ''), when)
        prev = now

with open('public/data/question-dates.json', 'w', encoding='utf-8') as f:
    json.dump(dict(sorted(out.items())), f, ensure_ascii=False, indent=2)
    f.write('\n')
print(json.dumps(out, indent=2, ensure_ascii=False))
