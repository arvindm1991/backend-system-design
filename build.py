#!/usr/bin/env python3
"""Assemble the single-file course page: dist/index.html.

Reads src/head.html, src/body.html, every src/lessons/*.html (one <template> each),
every src/labs/*.json and src/shell.js, and inlines them all into one page.
Broken lesson or lab files are skipped with a warning so parallel authors don't block each other.
Validation problems are printed as WARN lines; `python3 build.py --strict` exits 1 if there are any.
"""
import html
import json
import pathlib
import re
import sys
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / 'src'
OUT = ROOT / 'dist' / 'index.html'

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}
# SVG elements are often self-closed (<rect/>); HTMLParser reports those via handle_startendtag.
TPL_RE = re.compile(r'<template\s+([^>]*)>', re.S)
ATTR_RE = re.compile(r'([\w-]+)\s*=\s*("([^"]*)"|\'([^\']*)\')')


class Balance(HTMLParser):
    """Checks that tags are balanced (ignoring void elements and implicitly closed <p>/<li>/...)."""
    OPTIONAL_END = {'p', 'li', 'td', 'th', 'tr', 'thead', 'tbody', 'tfoot', 'dt', 'dd', 'option'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.errors = []

    def handle_starttag(self, tag, attrs):
        if tag in VOID:
            return
        self.stack.append((tag, self.getpos()[0]))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append(f'line {self.getpos()[0]}: stray </{tag}>')
            return
        if self.stack[-1][0] == tag:
            self.stack.pop()
            return
        # tolerate implicitly closed optional-end elements
        names = [t for t, _ in self.stack]
        if tag in names:
            while self.stack and self.stack[-1][0] != tag:
                t, ln = self.stack.pop()
                if t not in self.OPTIONAL_END:
                    self.errors.append(f'line {ln}: <{t}> not closed before </{tag}> (line {self.getpos()[0]})')
            self.stack.pop()
        else:
            self.errors.append(f'line {self.getpos()[0]}: </{tag}> without matching open tag (open: <{self.stack[-1][0]}>)')

    def close_check(self):
        for t, ln in self.stack:
            if t not in self.OPTIONAL_END:
                self.errors.append(f'line {ln}: <{t}> never closed')


def attrs_of(s):
    out = {}
    for m in ATTR_RE.finditer(s):
        out[m.group(1)] = html.unescape(m.group(3) if m.group(3) is not None else m.group(4))
    return out


def load_labs(warn):
    labs = {}
    for p in sorted((SRC / 'labs').glob('*.json')):
        try:
            lab = json.loads(p.read_text())
        except Exception as e:  # noqa: BLE001
            warn(f'labs/{p.name}: invalid JSON, skipped ({e})')
            continue
        if not isinstance(lab, dict) or not isinstance(lab.get('tests'), list):
            warn(f'labs/{p.name}: not a lab object with a tests array, skipped')
            continue
        if lab.get('id') != p.stem:
            warn(f'labs/{p.name}: id "{lab.get("id")}" does not match the file name; using "{p.stem}"')
            lab['id'] = p.stem
        for k in ('title', 'prompt', 'starter', 'solution'):
            if not isinstance(lab.get(k), str):
                warn(f'labs/{p.name}: missing "{k}"')
                lab[k] = lab.get(k) or ''
        if lab.get('lang') == 'python' and not p.stem.startswith('py-'):
            warn(f'labs/{p.name}: python lab ids must start with "py-"')
        if lab.get('lang') not in (None, 'js', 'javascript', 'python'):
            warn(f'labs/{p.name}: unknown lang "{lab.get("lang")}"')
        lab.setdefault('hints', [])
        lab.setdefault('explain', '')
        labs[p.stem] = lab
    return labs


def load_lessons(labs, warn):
    lessons = []
    templates = []
    for p in sorted((SRC / 'lessons').glob('*.html')):
        text = p.read_text()
        tpls = TPL_RE.findall(text)
        if len(tpls) != 1:
            warn(f'lessons/{p.name}: expected exactly one <template>, found {len(tpls)}; skipped')
            continue
        a = attrs_of(tpls[0])
        lid = a.get('id', '')
        if not lid.startswith('tpl-'):
            warn(f'lessons/{p.name}: template id must start with "tpl-"; skipped')
            continue
        lid = lid[4:]
        if lid != p.stem:
            warn(f'lessons/{p.name}: template id tpl-{lid} does not match file name')
        if text.count('</template>') != 1:
            warn(f'lessons/{p.name}: missing or extra </template>; skipped')
            continue
        try:
            order = int(a.get('data-order', ''))
        except ValueError:
            warn(f'lessons/{p.name}: data-order is not an integer; skipped')
            continue
        title = a.get('data-title') or lid
        part = a.get('data-part') or 'Other'
        # balance check
        bp = Balance()
        try:
            bp.feed(text)
            bp.close()
            bp.close_check()
        except Exception as e:  # noqa: BLE001
            bp.errors.append(f'parser error: {e}')
        for err in bp.errors[:6]:
            warn(f'lessons/{p.name}: unbalanced HTML: {err}')
        # quizzes
        for m in re.finditer(r"data-quiz='([^']*)'", text):
            raw = html.unescape(m.group(1))
            try:
                qs = json.loads(raw)
                for i, q in enumerate(qs if isinstance(qs, list) else [qs]):
                    if not (isinstance(q.get('o'), list) and isinstance(q.get('a'), int) and 0 <= q['a'] < len(q['o'])):
                        warn(f'lessons/{p.name}: quiz question {i + 1} has a bad "o"/"a"')
            except Exception as e:  # noqa: BLE001
                line = text[:m.start()].count('\n') + 1
                warn(f'lessons/{p.name}: quiz JSON on line {line} does not parse ({e})')
        # estimation drills: data-estimate='{"title","prompt","fields":[{"key","label","unit","answer"}],"soWhat","worked"}'
        for m in re.finditer(r"data-estimate='([^']*)'", text):
            line = text[:m.start()].count('\n') + 1
            try:
                d = json.loads(html.unescape(m.group(1)))
            except Exception as e:  # noqa: BLE001
                warn(f'lessons/{p.name}: estimate JSON on line {line} does not parse ({e})')
                continue
            fields = d.get('fields') if isinstance(d, dict) else None
            if not isinstance(fields, list) or not fields:
                warn(f'lessons/{p.name}: estimate on line {line} has no "fields"')
                continue
            for k in ('title', 'prompt', 'soWhat', 'worked'):
                if not isinstance(d.get(k), str) or not d[k].strip():
                    warn(f'lessons/{p.name}: estimate "{d.get("title")}" is missing "{k}"')
            keys = [f.get('key') for f in fields if isinstance(f, dict)]
            if len(set(keys)) != len(fields) or not all(isinstance(k, str) and k for k in keys):
                warn(f'lessons/{p.name}: estimate "{d.get("title")}" needs a unique "key" on every field')
            for f in fields:
                if not isinstance(f, dict) or not isinstance(f.get('label'), str) or not (isinstance(f.get('answer'), (int, float)) and f['answer'] > 0):
                    warn(f'lessons/{p.name}: estimate "{d.get("title")}" field {f.get("key") if isinstance(f, dict) else f!r} needs a "label" and a positive numeric "answer"')
        if 'data-estimate="' in text:
            warn(f'lessons/{p.name}: data-estimate uses double quotes; use a single-quoted attribute')
        if 'data-quiz="' in text:
            warn(f'lessons/{p.name}: data-quiz uses double quotes; spec requires single-quoted attribute')
        lab_ids = re.findall(r'data-lab="([^"]+)"', text)
        for lab_id in lab_ids:
            if lab_id not in labs:
                warn(f'lessons/{p.name}: data-lab="{lab_id}" has no src/labs/{lab_id}.json')
        lessons.append({'id': lid, 'title': title, 'part': part, 'order': order, 'labs': lab_ids})
        templates.append((order, lid, text.strip()))
    ids = [l['id'] for l in lessons]
    for d in {x for x in ids if ids.count(x) > 1}:
        warn(f'duplicate lesson id: {d}')
    lessons.sort(key=lambda l: (l['order'], l['id']))
    templates.sort()
    return lessons, [t for _, _, t in templates]


def js_json(obj):
    s = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    # never let embedded content close the <script> or open an HTML comment
    return s.replace('</', '<\\/').replace('<!--', '<\\!--').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')


def build():
    warnings = []
    warn = lambda m: warnings.append(m)  # noqa: E731
    labs = load_labs(warn)
    lessons, templates = load_lessons(labs, warn)
    used = {x for l in lessons for x in l['labs']}
    for lab_id in labs:
        if lab_id not in used:
            warn(f'labs/{lab_id}.json is not referenced by any lesson')
    def load_videos():
        # "Watch first" videos per lesson, from src/videos-*.json. Bad files are skipped with a warning.
        vids = {}
        for vp in sorted(SRC.glob('videos-*.json')):
            try:
                vids.update(json.loads(vp.read_text()))
            except Exception as e:  # noqa: BLE001
                print('WARN: skipping', vp.name, e)
        return vids

    page = '\n'.join([
        (SRC / 'head.html').read_text(),
        (SRC / 'body.html').read_text(),
        '\n'.join(templates),
        '<script>',
        'const LESSONS = ' + js_json(lessons) + ';',
        'const LABS = ' + js_json(labs) + ';',
        'const VIDEOS = ' + js_json(load_videos()) + ';',
        'const PY_HARNESS = ' + js_json((SRC / 'py_harness.py').read_text()) + ';',
        (SRC / 'shell.js').read_text(),
        '</script>',
        '</body>',
        '</html>',
        '',
    ])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page)
    for w in warnings:
        print('WARN', w)
    print(f'built {OUT.relative_to(ROOT)}: {len(lessons)} lessons, {len(labs)} labs, {len(page) // 1024} KB')
    for l in lessons:
        print(f'  {l["order"]:>4}  {l["id"]:<18} {l["part"]:<32} labs: {", ".join(l["labs"]) or "-"}')
    return warnings


if __name__ == '__main__':
    w = build()
    if '--strict' in sys.argv and w:
        sys.exit(1)
