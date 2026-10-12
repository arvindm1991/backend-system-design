#!/usr/bin/env python3
"""Playwright smoke test for dist/index.html.

  python3 test/run.py            build, then test every lesson route, quizzes and labs
  python3 test/run.py --shots    also save screenshots to test/shots/ (start + a lesson, light/dark, desktop/phone)
  python3 test/run.py --shots=api,sql   screenshot these lessons too

Checks: no page errors / console errors; every lesson renders an <h1>; quizzes parse; every data-lab resolves;
no horizontal page scroll at phone width; one quiz answers; every lab fails with its starter and passes with its
solution when run through the in-page runner.
"""
import pathlib
import subprocess
import sys

import urllib.request

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import pyodide_stub  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist' / 'index.html'
SHOTS = ROOT / 'test' / 'shots'
CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

problems = []


def fail(msg):
    problems.append(msg)
    print('  FAIL', msg)


def main():
    shots_arg = next((a for a in sys.argv[1:] if a.startswith('--shots')), None)
    subprocess.run([sys.executable, str(ROOT / 'build.py')], check=True, stdout=subprocess.DEVNULL)
    url = DIST.as_uri()
    # Python labs need Pyodide from jsDelivr. If this machine can't reach it, use a local stand-in
    # that runs the same harness in CPython (see test/pyodide_stub.py) and say so.
    init_script = ''
    try:
        urllib.request.urlopen('https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js', timeout=8).read(100)
        print('Pyodide CDN reachable: Python labs run on real Pyodide')
    except Exception as e:  # noqa: BLE001
        srv, base = pyodide_stub.start()
        init_script = f'window.BSD_PYODIDE_INDEX = {base!r};'
        print(f'Pyodide CDN NOT reachable ({type(e).__name__}); Python labs use the local CPython stand-in at {base}')
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        _new_context = browser.new_context

        def new_context(**kw):
            c = _new_context(**kw)
            if init_script:
                c.add_init_script(init_script)
            return c
        browser.new_context = new_context
        ctx = browser.new_context(viewport={'width': 1280, 'height': 900})
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
        page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' and 'fonts.g' not in m.text and 'ERR_' not in m.text else None)
        page.goto(url)
        page.wait_for_selector('#lesson h1')
        lessons = page.evaluate('LESSONS')
        labs = page.evaluate('Object.keys(LABS)')
        print(f'{len(lessons)} lessons, {len(labs)} labs')

        # ---- every route renders ----
        quiz_lesson = None
        for l in lessons:
            errors.clear()
            page.evaluate(f'location.hash = {l["id"]!r}')
            page.wait_for_function(f'document.title.length && (location.hash === "#" + {l["id"]!r})')
            page.wait_for_timeout(30)
            info = page.evaluate('''() => {
              const a = document.querySelector('#lesson');
              return {
                h1: (a.querySelector('h1') || {}).textContent || '',
                quizzes: a.querySelectorAll('.quiz').length,
                badQuiz: [...a.querySelectorAll('.lab-missing')].map(x => x.textContent),
                labs: a.querySelectorAll('.lab').length,
                diagrams: a.querySelectorAll('figure.diagram svg').length,
                pager: !!a.querySelector('.pager'),
                current: (document.querySelector('.side-link.is-current .side-num + span') || {}).textContent || '',
                words: a.textContent.split(/\\s+/).length,
              };
            }''')
            tag = f'{l["order"]:>4} {l["id"]:<18}'
            if not info['h1']:
                fail(f'{l["id"]}: no <h1>')
            for b in info['badQuiz']:
                fail(f'{l["id"]}: {b}')
            if info['current'] != l['title']:
                fail(f'{l["id"]}: sidebar current item is "{info["current"]}"')
            if not info['pager']:
                fail(f'{l["id"]}: no pager')
            for e in errors:
                fail(f'{l["id"]}: {e}')
            if info['quizzes'] and not quiz_lesson:
                quiz_lesson = l['id']
            print(f'  ok {tag} words≈{info["words"]:<5} quizzes={info["quizzes"]} labs={info["labs"]} diagrams={info["diagrams"]}')

        # ---- answer one quiz question ----
        if quiz_lesson:
            page.evaluate(f'location.hash = {quiz_lesson!r}')
            page.wait_for_selector('.quiz .q-opt')
            q = page.locator('.quiz .q').first
            q.locator('.q-opt').first.click()
            why = q.locator('.q-why')
            if not why.is_visible() or not why.inner_text().strip():
                fail('quiz: clicking an option did not reveal the explanation')
            elif not q.locator('.q-opt.is-right').count():
                fail('quiz: correct option not highlighted')
            else:
                print(f'  ok quiz answered in {quiz_lesson}: {why.inner_text()[:70]!r}...')
        else:
            print('  (no quizzes found)')

        # ---- labs: starter fails, solution passes, in the page ----
        lab_lessons = [(l['id'], x) for l in lessons for x in l['labs'] if x in labs]
        py_checked = py_loop_checked = False
        # Python syntax highlighting in lesson snippets
        for l in lessons:
            if l['id'].startswith('py-'):
                page.evaluate(f'location.hash = {l["id"]!r}')
                page.wait_for_timeout(50)
                n = page.evaluate('() => document.querySelectorAll(".code .t-kw").length')
                if not n:
                    fail(f'{l["id"]}: no highlighted Python keywords in code snippets')
                break
        for lid, lab in lab_lessons:
            errors.clear()
            page.evaluate(f'location.hash = {lid!r}')
            root = page.locator(f'#lab-{lab}')
            root.wait_for()
            ta = root.locator('textarea.ce-ta')
            starter, solution = page.evaluate(f'[LABS[{lab!r}].starter, LABS[{lab!r}].solution]')

            def set_code(code):
                ta.evaluate('(t, v) => { t.value = v; t.dispatchEvent(new Event("input")); }', code)

            is_py = page.evaluate(f'LABS[{lab!r}].lang === "python"')

            def run():
                root.locator('[data-act="run"]').click()
                root.locator('.lab-summary.is-ok, .lab-summary.is-bad').wait_for(timeout=180000 if is_py else 30000)
                return root.locator('.lab-summary').get_attribute('class'), root.locator('.lab-summary').inner_text()

            if is_py and not py_checked:
                py_checked = True
                st = root.locator('.lab-pystatus')
                try:
                    page.wait_for_function('(el) => /Loading Python… first time only, about 10 MB|Python ready/.test(el.textContent)', arg=st.element_handle(), timeout=10000)
                    print('  ok python lab shows loading state: ' + st.inner_text())
                except Exception:  # noqa: BLE001
                    fail(f'lab {lab}: python status line never showed loading/ready ({st.inner_text()!r})')

            set_code(starter)
            cls, txt = run()
            if 'is-ok' in cls:
                fail(f'lab {lab}: starter passes all tests in the page')
            set_code(solution)
            cls, txt = run()
            if 'is-ok' not in cls:
                fail(f'lab {lab}: solution does not pass in the page ({txt}): ' + root.locator('.lab-tests').inner_text()[:400])
            elif not root.locator('.lab-explain').is_visible():
                fail(f'lab {lab}: explain not shown after passing')
            else:
                print(f'  ok lab {lab:<22} starter fails, solution: {txt}')
            # hints + solution reveal
            if root.locator('[data-act="hint"]').is_enabled():
                root.locator('[data-act="hint"]').click()
                if not root.locator('.lab-hint').count():
                    fail(f'lab {lab}: hint did not appear')
            root.locator('[data-act="solution"]').click()
            root.locator('[data-act="sol-yes"]').click()
            if not root.locator('.lab-solution .code').is_visible():
                fail(f'lab {lab}: solution did not show')
            if is_py and not py_loop_checked:
                py_loop_checked = True
                set_code('while True:\n    pass\n')
                cls, txt = run()
                body = root.locator('.lab-results').inner_text()
                if 'Timed out' not in body:
                    fail(f'lab {lab}: infinite loop was not stopped by the timeout: {body[:200]}')
                set_code(solution)
                cls, txt = run()
                if 'is-ok' not in cls:
                    fail(f'lab {lab}: solution failed after the worker was restarted ({txt})')
                else:
                    print(f'  ok python worker: infinite loop timed out, worker restarted, solution passes again ({page.evaluate("PyRuntime.mode")} mode)')
                # traceback + print output rendering
                set_code(solution + '\n\nprint("hello from print")\n' + 'raise ValueError("boom")\n')
                cls, txt = run()
                body = root.locator('.lab-results').inner_text()
                if 'hello from print' not in body or 'ValueError: boom' not in body or 'File "<your code>"' not in body:
                    fail(f'lab {lab}: print output or traceback not shown: {body[:300]}')
                else:
                    print('  ok python print() output and trimmed traceback are shown')
            set_code(starter)  # leave the draft clean
            for e in errors:
                fail(f'lab {lab}: {e}')

        # ---- progress persisted ----
        saved = page.evaluate('JSON.parse(localStorage.getItem("bsd:labs") || "{}")')
        if lab_lessons and not all(saved.get(x) for _, x in lab_lessons):
            fail('lab progress not saved to localStorage')

        # ---- phone width: no horizontal page scroll ----
        phone = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pp = phone.new_page()
        perr = []
        pp.on('pageerror', lambda e: perr.append(str(e)))
        pp.goto(url)
        pp.wait_for_selector('#lesson h1')
        for l in lessons:
            pp.evaluate(f'location.hash = {l["id"]!r}')
            pp.wait_for_function(f'location.hash === "#" + {l["id"]!r}')
            pp.wait_for_timeout(30)
            over = pp.evaluate('''() => {
              const w = document.documentElement.clientWidth;
              const bad = [...document.querySelectorAll('#lesson *')].filter(el => {
                const r = el.getBoundingClientRect();
                return r.right > w + 1 && !el.closest('.diagram-scroll, .tbl-wrap, .code, .lab-editor, pre');
              }).slice(0, 3).map(el => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''));
              return { sw: document.documentElement.scrollWidth, w, bad };
            }''')
            if over['sw'] > over['w'] + 1 or over['bad']:
                fail(f'{l["id"]}: horizontal overflow at 390px (scrollWidth {over["sw"]} > {over["w"]}) {over["bad"]}')
        # drawer opens and navigates
        pp.click('#sideToggle')
        pp.wait_for_timeout(300)
        if not pp.evaluate('document.body.classList.contains("side-open")'):
            fail('phone: sidebar toggle did not open the drawer')
        if len(lessons) > 1:
            pp.locator('.side-link').nth(1).click()
            pp.wait_for_timeout(300)
            if pp.evaluate('document.body.classList.contains("side-open")'):
                fail('phone: drawer did not close after navigating')
        for e in perr:
            fail(f'phone: {e}')
        print('  ok phone width checks')

        # ---- screenshots ----
        if shots_arg:
            SHOTS.mkdir(exist_ok=True)
            extra = shots_arg.split('=', 1)[1].split(',') if '=' in shots_arg else []
            ids = ['start'] + [x for x in extra if x] + ([lab_lessons[0][0]] if lab_lessons and not extra else [])
            for scheme in ('light', 'dark'):
                for name, vp, mobile in (('desktop', {'width': 1280, 'height': 900}, False), ('phone', {'width': 390, 'height': 844}, True)):
                    c = browser.new_context(viewport=vp, color_scheme=scheme, device_scale_factor=1 if not mobile else 2, is_mobile=mobile, has_touch=mobile)
                    sp = c.new_page()
                    sp.goto(url)
                    sp.wait_for_selector('#lesson h1')
                    for lid in ids:
                        sp.evaluate(f'location.hash = {lid!r}')
                        sp.wait_for_timeout(250)
                        sp.screenshot(path=str(SHOTS / f'{lid}-{scheme}-{name}.png'), full_page=False)
                        sp.screenshot(path=str(SHOTS / f'{lid}-{scheme}-{name}-full.png'), full_page=True)
                    c.close()
            print(f'  screenshots in {SHOTS.relative_to(ROOT)}/')
        browser.close()

    print()
    if problems:
        print(f'{len(problems)} problem(s)')
        sys.exit(1)
    print('ALL OK')


if __name__ == '__main__':
    main()
