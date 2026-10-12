#!/usr/bin/env python3
"""Verify every Python lab (src/labs/*.json with "lang": "python") with plain CPython.

For each lab: the solution must pass every test and the starter must fail at least one.
Uses src/py_harness.py, the same harness the in-browser (Pyodide) runner uses, so semantics match:
fresh namespace per test, assert_equal / assert_raises / run injected, top-level await allowed.
Each lab runs in its own subprocess; each test has a 2-second timeout (infinite loops are reported, not hung on).

Usage: python3 test/check_py_labs.py [lab-id ...]
"""
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
import os
LAB_DIR = pathlib.Path(os.environ.get('BSD_LAB_DIR') or ROOT / 'src' / 'labs')
HARNESS = ROOT / 'src' / 'py_harness.py'
TEST_TIMEOUT = 2.0

CHILD = r'''
import json, signal, sys
harness_src, lab_json, per_test = sys.argv[1], sys.argv[2], float(sys.argv[3])
H = {'__name__': '_py_harness'}
exec(compile(open(harness_src).read(), harness_src, 'exec'), H)

class _Timeout(KeyboardInterrupt):
    pass

def _alarm(signum, frame):
    raise _Timeout()

signal.signal(signal.SIGALRM, _alarm)
lab = json.load(open(lab_json))
out = {}
for role in ('solution', 'starter'):
    results = []
    code = lab.get(role) or ''
    for t in lab['tests']:
        signal.setitimer(signal.ITIMER_REAL, per_test)
        try:
            r = json.loads(H['_lab_run_test'](code, t.get('code', '')))
        except _Timeout:
            r = {'ok': False, 'msg': 'timed out after %gs (infinite loop?)' % per_test, 'tb': '', 'out': ''}
        except KeyboardInterrupt:
            r = {'ok': False, 'msg': 'KeyboardInterrupt', 'tb': '', 'out': ''}
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
        results.append(r)
    out[role] = results
sys.stdout.write('\n@@RESULT@@' + json.dumps(out))
'''


def shape_errors(lab, stem):
    errs = []
    if lab.get('id') != stem:
        errs.append(f'id "{lab.get("id")}" does not match filename "{stem}"')
    if not stem.startswith('py-'):
        errs.append('python lab ids must start with "py-"')
    for k in ('title', 'prompt', 'starter', 'solution', 'explain'):
        if not isinstance(lab.get(k), str) or not lab[k].strip():
            errs.append(f'missing string field "{k}"')
    if not isinstance(lab.get('minutes'), (int, float)):
        errs.append('missing number field "minutes"')
    tests = lab.get('tests')
    if not isinstance(tests, list) or not tests:
        errs.append('tests must be a non-empty array')
    else:
        if not 4 <= len(tests) <= 8:
            errs.append(f'has {len(tests)} tests (spec: 4-8)')
        for i, t in enumerate(tests):
            if not isinstance(t, dict) or not isinstance(t.get('name'), str) or not isinstance(t.get('code'), str):
                errs.append(f'test #{i + 1} needs string name and code')
    if not isinstance(lab.get('hints'), list) or not lab['hints']:
        errs.append('hints must be a non-empty array')
    return errs


def main():
    only = set(sys.argv[1:])
    files = sorted(LAB_DIR.glob('*.json'))
    checked = bad = 0
    for p in files:
        if only and p.stem not in only:
            continue
        try:
            lab = json.loads(p.read_text())
        except Exception as e:  # noqa: BLE001
            if p.stem.startswith('py-'):
                checked += 1
                bad += 1
                print(f'FAIL {p.name}: invalid JSON ({e})')
            continue
        if not isinstance(lab, dict) or lab.get('lang') != 'python':
            if p.stem.startswith('py-'):
                checked += 1
                bad += 1
                print(f'FAIL {p.name}: py-* lab without "lang": "python"')
            continue
        checked += 1
        problems = shape_errors(lab, p.stem)
        if not isinstance(lab.get('tests'), list) or any(not isinstance(t, dict) for t in lab['tests']):
            bad += 1
            print(f'FAIL {p.name}: ' + '; '.join(problems))
            continue
        budget = 10 + 2 * len(lab['tests']) * (TEST_TIMEOUT + 0.5)
        try:
            cp = subprocess.run([sys.executable, '-I', '-c', CHILD, str(HARNESS), str(p), str(TEST_TIMEOUT)],
                                capture_output=True, text=True, timeout=budget, cwd='/tmp')
            raw = cp.stdout.rsplit('@@RESULT@@', 1)
            if len(raw) != 2:
                raise RuntimeError('runner crashed: ' + (cp.stderr.strip().splitlines() or ['no output'])[-1])
            res = json.loads(raw[1])
        except subprocess.TimeoutExpired:
            bad += 1
            print(f'FAIL {p.name}: runner timed out after {budget:.0f}s')
            continue
        except Exception as e:  # noqa: BLE001
            bad += 1
            print(f'FAIL {p.name}: {e}')
            continue
        for t, r in zip(lab['tests'], res['solution']):
            if not r['ok']:
                detail = r['msg'] + ('\n         ' + r['tb'].replace('\n', '\n         ') if r['tb'] else '')
                problems.append(f'solution fails "{t["name"]}": {detail}')
        starter_fails = sum(1 for r in res['starter'] if not r['ok'])
        if starter_fails == 0:
            problems.append('starter passes every test (must fail at least one)')
        if problems:
            bad += 1
            print(f'FAIL {p.name}')
            for pr in problems:
                print('     - ' + pr)
        else:
            print(f'OK   {p.name}  ({len(lab["tests"])} tests; starter fails {starter_fails})')
    print(f'\n{checked - bad}/{checked} python labs OK')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
