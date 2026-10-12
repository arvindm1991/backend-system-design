/* Backend & System Design: app shell.
   Expects two globals injected by build.py:
     LESSONS = [{ id, title, part, order, labs: [labId...] }, ...]  (sorted by order)
     LABS    = { labId: { id, title, minutes, prompt, starter, solution, tests, hints, explain } }
   Lesson bodies live in <template id="tpl-<id>"> elements in the page. */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ================= Storage (per browser, never required) ================= */
const Store = (() => {
  const P = 'bsd:';
  const mem = {};
  const get = (k, d = null) => {
    if (k in mem) return mem[k];
    try {
      const v = localStorage.getItem(P + k);
      return v == null ? d : JSON.parse(v);
    } catch (e) { return d; }
  };
  const set = (k, v) => {
    mem[k] = v;
    try { if (v === undefined || v === null) localStorage.removeItem(P + k); else localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) { /* memory only */ }
  };
  const clearAll = () => {
    Object.keys(mem).forEach((k) => delete mem[k]);
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(P) && k !== P + 'theme') keys.push(k); }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch (e) { /* ignore */ }
  };
  return { get, set, clearAll };
})();

let toastTimer = null;
function toast(html, ms = 2200) {
  const t = $('#toast');
  t.innerHTML = html;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
function copyText(text) {
  const ok = () => toast('Copied');
  const fail = () => toast('Copy failed. Select the text and copy it manually.');
  try { navigator.clipboard.writeText(text).then(ok, fail); } catch (e) { fail(); }
}

/* ================= Syntax highlighting (JS, SQL, HTTP, JSON, shell) ================= */
const JS_RE = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|(`(?:\\[\s\S]|[^`\\])*`?|'(?:\\.|[^'\\\n])*'?|"(?:\\.|[^"\\\n])*"?)|\b(import|from|export|default|function|return|const|let|var|if|else|for|of|in|while|do|new|async|await|try|catch|finally|throw|class|extends|typeof|instanceof|switch|case|break|continue|null|undefined|true|false|this|static|get|set|yield|delete|interface|type)\b|\b(\d[\d_]*(?:\.\d+)?(?:e\d+)?)\b|\b([A-Za-z_$][\w$]*)(?=\s*\()/g;
const SQL_KW = 'SELECT|FROM|WHERE|AND|OR|NOT|IN|IS|NULL|AS|ON|JOIN|INNER|LEFT|RIGHT|FULL|OUTER|CROSS|GROUP|BY|ORDER|ASC|DESC|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|UNIQUE|PRIMARY|KEY|FOREIGN|REFERENCES|CASCADE|ALTER|ADD|COLUMN|DROP|BEGIN|COMMIT|ROLLBACK|TRANSACTION|DEFAULT|CONSTRAINT|CHECK|HAVING|DISTINCT|COUNT|SUM|AVG|MIN|MAX|EXISTS|BETWEEN|LIKE|CASE|WHEN|THEN|ELSE|END|UNION|ALL|WITH|RETURNING|FOR|SHARE|EXPLAIN|ANALYZE|SERIAL|BIGSERIAL|INT|INTEGER|BIGINT|TEXT|VARCHAR|BOOLEAN|TIMESTAMPTZ|TIMESTAMP|UUID|JSONB|NOW|TRUE|FALSE|ISOLATION|LEVEL|READ|COMMITTED|REPEATABLE|SERIALIZABLE|USING|CONFLICT|DO|NOTHING|IF|ENABLE|ROW|SECURITY|POLICY|CURRENT_SETTING';
const SQL_RE = new RegExp(`(--[^\\n]*)|('(?:''|[^'])*'?)|\\b(${SQL_KW})\\b|\\b(\\d+(?:\\.\\d+)?)\\b|(\\$\\d+|:[a-z_]+)`, 'gi');
const HTTP_START = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|HTTP\/[\d.]+)\b/;

function hlJs(src) {
  let out = '', last = 0, m;
  JS_RE.lastIndex = 0;
  while ((m = JS_RE.exec(src))) {
    if (m[0] === '') { JS_RE.lastIndex++; continue; }
    out += esc(src.slice(last, m.index));
    const cls = m[1] ? 't-com' : m[2] ? 't-str' : m[3] ? 't-kw' : m[4] ? 't-num' : 't-fn';
    out += `<span class="${cls}">${esc(m[0])}</span>`;
    last = JS_RE.lastIndex;
  }
  return out + esc(src.slice(last));
}
function hlSql(src) {
  let out = '', last = 0, m;
  SQL_RE.lastIndex = 0;
  while ((m = SQL_RE.exec(src))) {
    if (m[0] === '') { SQL_RE.lastIndex++; continue; }
    out += esc(src.slice(last, m.index));
    const cls = m[1] ? 't-com' : m[2] ? 't-str' : m[3] ? 't-kw' : m[4] ? 't-num' : 't-prop';
    out += `<span class="${cls}">${esc(m[0])}</span>`;
    last = SQL_RE.lastIndex;
  }
  return out + esc(src.slice(last));
}
function hlHttp(src) {
  // request/status line, headers, blank line, then a body (JSON gets JS colors)
  const lines = src.split('\n');
  let inBody = false;
  const body = [];
  const head = [];
  lines.forEach((ln) => {
    if (inBody) { body.push(ln); return; }
    if (ln.trim() === '' && head.length) { inBody = true; head.push(''); return; }
    const st = ln.match(HTTP_START);
    if (st) { head.push(`<span class="t-kw">${esc(st[0])}</span>${esc(ln.slice(st[0].length)).replace(/\b([1-5]\d\d)\b/, '<span class="t-num">$1</span>')}`); return; }
    const h = ln.match(/^([A-Za-z][\w-]*)(:)(.*)$/);
    if (h) { head.push(`<span class="t-prop">${esc(h[1])}</span>${h[2]}<span class="t-str">${esc(h[3])}</span>`); return; }
    if (/^\s*(#|\/\/)/.test(ln)) { head.push(`<span class="t-com">${esc(ln)}</span>`); return; }
    head.push(esc(ln));
  });
  return head.join('\n') + (inBody ? '\n' + hlJs(body.join('\n')) : '');
}
function hlShell(src) {
  return src.split('\n').map((ln) => (/^\s*#/.test(ln) ? `<span class="t-com">${esc(ln)}</span>` : esc(ln).replace(/^(\$ )/, '<span class="t-com">$1</span>'))).join('\n');
}
const PY_RE = /(#[^\n]*)|([rRbBfFuU]{0,2}(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?))|(@[\w.]+)|\b(def|class|return|if|elif|else|for|while|in|not|and|or|is|None|True|False|import|from|as|with|try|except|finally|raise|pass|break|continue|lambda|yield|async|await|global|nonlocal|del|assert|match|case)\b|\b(\d[\d_]*(?:\.\d+)?(?:e\d+)?j?)\b|\b(self|cls|print|len|range|enumerate|zip|dict|list|set|tuple|str|int|float|bool|sorted|sum|min|max|any|all|isinstance|super)\b|\b([A-Za-z_]\w*)(?=\s*\()/g;
function hlPy(src) {
  let out = '', last = 0, m;
  PY_RE.lastIndex = 0;
  while ((m = PY_RE.exec(src))) {
    if (m[0] === '') { PY_RE.lastIndex++; continue; }
    out += esc(src.slice(last, m.index));
    const cls = m[1] ? 't-com' : m[2] ? 't-str' : m[3] ? 't-tag' : m[4] ? 't-kw' : m[5] ? 't-num' : m[6] ? 't-prop' : 't-fn';
    out += `<span class="${cls}">${esc(m[0])}</span>`;
    last = PY_RE.lastIndex;
  }
  return out + esc(src.slice(last));
}
function highlight(src, lang) {
  lang = (lang || '').toLowerCase();
  if (['py', 'python', 'python3', 'pycon'].includes(lang)) return hlPy(src);
  if (['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx', 'json'].includes(lang)) return hlJs(src);
  if (['sql', 'postgres', 'psql'].includes(lang)) return hlSql(src);
  if (lang === 'http') return hlHttp(src);
  if (['sh', 'bash', 'shell', 'console'].includes(lang)) return hlShell(src);
  return esc(src);
}
const LANG_LABEL = { py: 'Python', python: 'Python', js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript', sql: 'SQL', http: 'HTTP', json: 'JSON', sh: 'Shell', bash: 'Shell', text: 'Text', txt: 'Text', yaml: 'YAML', jsx: 'JSX', tsx: 'TSX' };

/* ================= Code editor (textarea + highlighted overlay) ================= */
const PAIRS = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = new Set([')', ']', '}']);
class CodeEditor {
  constructor(el, opts) {
    this.opts = opts || {};
    this.py = this.opts.lang === 'python';
    this.unit = this.py ? '    ' : '  ';
    this.n = 0;
    this.curLine = -1;
    el.innerHTML =
      '<div class="ce"><div class="ce-gutter" aria-hidden="true"><div class="ce-lines"></div></div>' +
      '<div class="ce-wrap"><pre class="ce-hl" aria-hidden="true"><code></code></pre>' +
      `<textarea class="ce-ta" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="${esc(this.opts.label || 'Code editor')}"></textarea></div></div>`;
    this.ta = el.querySelector('textarea');
    this.hl = el.querySelector('.ce-hl');
    this.code = el.querySelector('code');
    this.lines = el.querySelector('.ce-lines');
    this.ta.addEventListener('input', () => { this.render(); this.opts.onChange && this.opts.onChange(this.ta.value); });
    this.ta.addEventListener('scroll', () => this.sync());
    this.ta.addEventListener('keydown', (e) => this.key(e));
    ['keyup', 'click', 'focus'].forEach((ev) => this.ta.addEventListener(ev, () => this.cursor()));
  }
  get value() { return this.ta.value; }
  setValue(v) {
    this.ta.value = v;
    this.render();
    this.ta.scrollTop = 0;
    this.ta.scrollLeft = 0;
    this.sync();
  }
  render() {
    const v = this.ta.value;
    this.code.innerHTML = (this.py ? hlPy(v) : hlJs(v)) + '\n';
    const n = v.split('\n').length;
    if (n !== this.n) {
      this.n = n;
      let s = '';
      for (let i = 1; i <= n; i++) s += `<div>${i}</div>`;
      this.lines.innerHTML = s;
      this.curLine = -1;
    }
    this.cursor();
    this.sync();
  }
  sync() {
    this.hl.style.transform = `translate(${-this.ta.scrollLeft}px, ${-this.ta.scrollTop}px)`;
    this.lines.style.transform = `translateY(${-this.ta.scrollTop}px)`;
  }
  cursor() {
    const before = this.ta.value.slice(0, this.ta.selectionStart);
    const line = before.split('\n').length - 1;
    if (line !== this.curLine) {
      const prev = this.lines.children[this.curLine];
      if (prev) prev.classList.remove('is-cur');
      const cur = this.lines.children[line];
      if (cur) cur.classList.add('is-cur');
      this.curLine = line;
    }
  }
  insert(text) {
    const ta = this.ta;
    ta.focus();
    let ok = false;
    try { ok = text ? document.execCommand('insertText', false, text) : document.execCommand('delete', false); } catch (e) { ok = false; }
    if (!ok) {
      ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input'));
    }
  }
  lineRange() {
    const v = this.ta.value;
    const s = this.ta.selectionStart;
    let en = this.ta.selectionEnd;
    if (en > s && v[en - 1] === '\n') en--;
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    let le = v.indexOf('\n', en);
    if (le < 0) le = v.length;
    return [ls, le];
  }
  replaceLines(fn) {
    const [ls, le] = this.lineRange();
    const out = fn(this.ta.value.slice(ls, le).split('\n')).join('\n');
    this.ta.setSelectionRange(ls, le);
    this.insert(out);
    this.ta.setSelectionRange(ls, ls + out.length);
  }
  key(e) {
    const ta = this.ta, v = ta.value, s = ta.selectionStart, en = ta.selectionEnd;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === 'Enter' || e.key === 's')) { e.preventDefault(); this.opts.onRun && this.opts.onRun(); return; }
    if (e.key === 'Escape') { ta.blur(); return; } // lets keyboard users leave the editor (Tab is captured)
    if (mod && e.key === '/') {
      e.preventDefault();
      const mark = this.py ? '#' : '//';
      const re = this.py ? /^\s*#/ : /^\s*\/\//;
      const strip = this.py ? /#\s?/ : /\/\/\s?/;
      this.replaceLines((lines) => {
        const ne = lines.filter((l) => l.trim());
        const commented = ne.length > 0 && ne.every((l) => re.test(l));
        const ind = Math.min(...ne.map((l) => l.match(/^\s*/)[0].length));
        return lines.map((l) => (!l.trim() ? l : commented ? l.replace(strip, '') : l.slice(0, ind) + mark + ' ' + l.slice(ind)));
      });
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const dedent = this.py ? /^ {1,4}|^\t/ : /^ {1,2}|^\t/;
      if (e.shiftKey || (s !== en && v.slice(s, en).includes('\n'))) this.replaceLines((ls) => ls.map((l) => (e.shiftKey ? l.replace(dedent, '') : this.unit + l)));
      else this.insert(this.unit);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !mod) {
      e.preventDefault();
      const before = v.slice(0, s);
      const line = before.slice(before.lastIndexOf('\n') + 1);
      const indent = line.match(/^[ \t]*/)[0];
      const after = v.slice(en);
      const lt = line.replace(/\s+#.*$/, '').trimEnd();
      if (this.py && /:$/.test(lt)) this.insert('\n' + indent + this.unit);
      else if (this.py && /^\s*(return|pass|break|continue|raise)\b/.test(line) && indent.length >= 4) this.insert('\n' + indent.slice(4));
      else if (/[{(\[]$/.test(line.trimEnd())) {
        if (/^[ \t]*[}\])]/.test(after)) {
          this.insert('\n' + indent + this.unit + '\n' + indent);
          const pos = s + 1 + indent.length + this.unit.length;
          ta.setSelectionRange(pos, pos);
        } else this.insert('\n' + indent + this.unit);
      } else this.insert('\n' + indent);
      return;
    }
    if (mod || e.altKey) return;
    if (PAIRS[e.key] && s === en) {
      const next = v[s];
      if (!next || /[\s)\]},;]/.test(next)) {
        e.preventDefault();
        this.insert(e.key + PAIRS[e.key]);
        ta.setSelectionRange(s + 1, s + 1);
        return;
      }
    }
    if (CLOSERS.has(e.key) && s === en) {
      if (v[s] === e.key) { e.preventDefault(); ta.setSelectionRange(s + 1, s + 1); this.cursor(); return; }
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      const lead = v.slice(ls, s);
      const u = this.unit.length;
      if (lead.length >= u && /^ +$/.test(lead)) { e.preventDefault(); ta.setSelectionRange(s - u, s); this.insert(e.key); return; }
    }
    if (this.py && e.key === 'Backspace' && s === en) {
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      const lead = v.slice(ls, s);
      if (lead.length >= 4 && /^ +$/.test(lead)) { e.preventDefault(); ta.setSelectionRange(s - (lead.length % 4 || 4), s); this.insert(''); return; }
    }
    if (e.key === 'Backspace' && s === en && s > 0 && PAIRS[v[s - 1]] && PAIRS[v[s - 1]] === v[s]) {
      e.preventDefault();
      ta.setSelectionRange(s - 1, s + 1);
      this.insert('');
    }
  }
}

/* ================= Lab runner (semantics shared with test/check_labs.js) ================= */
const Runner = (() => {
  const TIMEOUT = 2000;
  function fmt(v) {
    try {
      if (v === undefined) return 'undefined';
      if (typeof v === 'function') return '[function]';
      if (Number.isNaN(v)) return 'NaN';
      return JSON.stringify(v, (k, x) => (x === undefined ? '__undefined__' : x instanceof Map ? { Map: [...x] } : x instanceof Set ? { Set: [...x] } : x)).replace(/"__undefined__"/g, 'undefined');
    } catch (e) { return String(v); }
  }
  function deepEqual(a, b) {
    if (Object.is(a, b)) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (a instanceof Map || b instanceof Map) {
      if (!(a instanceof Map && b instanceof Map) || a.size !== b.size) return false;
      for (const [k, v] of a) if (!b.has(k) || !deepEqual(v, b.get(k))) return false;
      return true;
    }
    if (a instanceof Set || b instanceof Set) {
      if (!(a instanceof Set && b instanceof Set) || a.size !== b.size) return false;
      for (const v of a) if (!b.has(v)) return false;
      return true;
    }
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEqual(a[k], b[k])) return false;
    return true;
  }
  const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
  const assertEqual = (actual, expected, msg) => {
    if (!deepEqual(actual, expected)) throw new Error((msg ? msg + ': ' : '') + 'expected ' + fmt(expected) + ', got ' + fmt(actual));
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function syntaxCheck(code) {
    try { new Function('assert', 'assertEqual', 'sleep', code + '\n;return 1;'); return null; } catch (e) { return e; }
  }

  async function runTest(code, test) {
    const logs = [];
    const orig = { log: console.log, info: console.info, warn: console.warn, error: console.error };
    const cap = (kind) => (...args) => { logs.push((kind === 'log' ? '' : kind + ': ') + args.map((a) => (typeof a === 'string' ? a : fmt(a))).join(' ')); };
    console.log = cap('log'); console.info = cap('info'); console.warn = cap('warn'); console.error = cap('error');
    let timer;
    try {
      const fn = new Function('assert', 'assertEqual', 'sleep', code + '\n;return (async () => {\n' + test.code + '\n})();');
      const p = Promise.resolve(fn(assert, assertEqual, sleep));
      const t = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('Timed out after 2s. Is something waiting forever?')), TIMEOUT); });
      await Promise.race([p, t]);
      return { ok: true, logs };
    } catch (e) {
      const msg = e && e.message ? (e.name && e.name !== 'Error' ? e.name + ': ' : '') + e.message : String(e);
      return { ok: false, msg, logs };
    } finally {
      clearTimeout(timer);
      Object.assign(console, orig);
    }
  }

  async function runAll(code, tests) {
    const out = [];
    for (const t of tests) out.push(await runTest(code, t));
    return out;
  }
  return { runAll, runTest, syntaxCheck };
})();

/* ================= Python lab runtime (Pyodide in a Web Worker) =================
   Pyodide (CPython compiled to WebAssembly) is loaded lazily from jsDelivr, only when a Python lab is
   opened or run. It runs inside a Web Worker so an infinite loop can't freeze the page: each test gets a
   timeout, and on timeout the worker is terminated and a fresh one is started for the next run (the
   browser cache makes restarts fast). If the page isn't allowed to create a worker, Pyodide runs on the
   main thread instead, which works but can't stop an infinite loop (the tab would hang).
   Semantics come from src/py_harness.py (PY_HARNESS), shared with test/check_py_labs.py. */
const PyRuntime = (() => {
  const VERSION = '0.27.2';
  const INDEX = (typeof window !== 'undefined' && window.BSD_PYODIDE_INDEX) || `https://cdn.jsdelivr.net/pyodide/v${VERSION}/full/`;
  const TEST_TIMEOUT = 5000;   // per test; Python in wasm is slower than JS
  const LOAD_TIMEOUT = 120000; // first download on a slow school network
  const WORKER_SRC = `
    let py = null;
    self.onmessage = async (e) => {
      const m = e.data;
      try {
        if (m.type === 'init') {
          importScripts(m.index + 'pyodide.js');
          py = await loadPyodide({ indexURL: m.index });
          py.runPython(m.harness);
          self.postMessage({ id: m.id, ok: true, version: py.version });
        } else if (m.type === 'prepare') {
          await py.loadPackagesFromImports(m.code);
          self.postMessage({ id: m.id, ok: true });
        } else if (m.type === 'call') {
          const fn = py.globals.get(m.fn);
          const out = fn(...m.args);
          if (fn.destroy) fn.destroy();
          self.postMessage({ id: m.id, ok: true, result: out });
        }
      } catch (err) {
        self.postMessage({ id: m.id, ok: false, error: String((err && err.message) || err) });
      }
    };`;
  let worker = null;
  let ready = null;      // Promise resolved when Pyodide + harness are loaded
  let mainPy = null;     // fallback: Pyodide on the main thread
  let mode = 'worker';
  let seq = 0;
  const pending = new Map();
  const listeners = new Set();
  let state = 'idle';    // idle | loading | ready | error
  let lastError = '';
  const setState = (s, err) => { state = s; lastError = err || ''; listeners.forEach((f) => { try { f(s, lastError); } catch (e) { /* ignore */ } }); };

  function spawn() {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    w.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      e.data.ok ? p.resolve(e.data) : p.reject(new Error(e.data.error));
    };
    w.onerror = (e) => {
      e.preventDefault && e.preventDefault();
      pending.forEach((p) => p.reject(new Error(e.message || 'Python worker crashed')));
      pending.clear();
    };
    return w;
  }
  function send(msg, timeout) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      let timer = null;
      pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
      if (timeout) timer = setTimeout(() => { if (pending.has(id)) { pending.delete(id); const err = new Error('timeout'); err.timeout = true; reject(err); } }, timeout);
      worker.postMessage({ ...msg, id });
    });
  }
  function kill() {
    if (worker) worker.terminate();
    worker = null;
    ready = null;
    pending.forEach((p) => p.reject(new Error('worker stopped')));
    pending.clear();
  }

  async function loadMainThread() {
    if (!window.loadPyodide) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = INDEX + 'pyodide.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Could not download Python (pyodide.js). Check your connection.'));
        document.head.appendChild(s);
      });
    }
    mainPy = await window.loadPyodide({ indexURL: INDEX });
    mainPy.runPython(PY_HARNESS);
  }

  function ensure() {
    if (ready) return ready;
    setState('loading');
    ready = (async () => {
      if (mode === 'worker') {
        try { worker = spawn(); } catch (e) { mode = 'main'; }
      }
      if (mode === 'worker') {
        try {
          await send({ type: 'init', index: INDEX, harness: PY_HARNESS }, LOAD_TIMEOUT);
        } catch (e) {
          kill();
          throw new Error(e.timeout ? 'Loading Python took too long. Check your connection and try again.' : 'Could not load Python: ' + e.message);
        }
      } else {
        await loadMainThread();
      }
    })();
    ready.then(() => setState('ready'), (e) => { ready = null; setState('error', e.message); });
    return ready;
  }

  async function call(fn, args, timeout) {
    if (mode === 'main') return mainPy.globals.get(fn)(...args);
    return (await send({ type: 'call', fn, args }, timeout)).result;
  }
  async function prepare(code) {
    if (mode === 'main') return mainPy.loadPackagesFromImports(code);
    return send({ type: 'prepare', code }, LOAD_TIMEOUT);
  }

  // Same result shape as the JS runner, plus tb (trimmed traceback).
  async function runAll(code, tests, onProgress) {
    await ensure();
    const syn = await call('_lab_syntax_check', [code], TEST_TIMEOUT);
    if (syn) return { syntax: syn };
    try { await prepare(code + '\n' + tests.map((t) => t.code).join('\n')); } catch (e) { /* unknown imports surface as test errors */ }
    const out = [];
    for (let i = 0; i < tests.length; i++) {
      if (onProgress) onProgress(i);
      try {
        await ensure();
        const r = JSON.parse(await call('_lab_run_test', [code, tests[i].code], TEST_TIMEOUT));
        out.push({ ok: r.ok, msg: r.msg, tb: r.tb, logs: r.out ? [r.out.replace(/\n$/, '')] : [] });
      } catch (e) {
        if (e.timeout) {
          kill(); // the only way to stop a runaway loop in a worker
          setState('loading');
          out.push({ ok: false, msg: `Timed out after ${TEST_TIMEOUT / 1000}s. Is there an infinite loop (a while that never ends)?`, tb: '', logs: [] });
        } else {
          out.push({ ok: false, msg: 'Python runtime error: ' + e.message, tb: '', logs: [] });
        }
      }
    }
    return { results: out };
  }

  return {
    ensure, runAll,
    get state() { return state; },
    get error() { return lastError; },
    get mode() { return mode; },
    onState(f) { listeners.add(f); return () => listeners.delete(f); },
  };
})();

/* ================= Course shell ================= */
const App = (() => {
  const byId = {};
  LESSONS.forEach((l, i) => { l.index = i; byId[l.id] = l; });
  let current = null;
  const read = () => Store.get('read', {}) || {};
  const passed = () => Store.get('labs', {}) || {};
  const allLabIds = () => LESSONS.flatMap((l) => l.labs).filter((id) => LABS[id]);
  const num = (l) => (l.id === 'start' ? '00' : String(l.index).padStart(2, '0'));

  /* ---- progress header + sidebar ---- */
  function renderProgress() {
    const r = read(), p = passed();
    const lessons = LESSONS.filter((l) => l.id !== 'start');
    const nRead = lessons.filter((l) => r[l.id]).length;
    const labIds = allLabIds();
    const nLab = labIds.filter((id) => p[id]).length;
    $('#progText').innerHTML = `${nRead}/${lessons.length}<span class="txt-long"> lessons</span> · ${nLab}/${labIds.length}<span class="txt-long"> labs</span>`;
    const total = lessons.length + labIds.length;
    $('#progFill').style.width = (total ? Math.round(((nRead + nLab) / total) * 100) : 0) + '%';
  }

  function renderSide() {
    const r = read(), p = passed();
    const parts = [];
    LESSONS.forEach((l) => {
      let g = parts.find((x) => x.name === l.part);
      if (!g) { g = { name: l.part, items: [] }; parts.push(g); }
      g.items.push(l);
    });
    let html = '';
    parts.forEach((g) => {
      const countable = g.items.filter((l) => l.id !== 'start');
      const done = countable.filter((l) => r[l.id]).length;
      html += `<p class="side-part"><span>${esc(g.name)}</span>${countable.length ? `<span>${done}/${countable.length}</span>` : ''}</p>`;
      g.items.forEach((l) => {
        const labs = l.labs.filter((id) => LABS[id]);
        const labsDone = labs.filter((id) => p[id]).length;
        const labMark = labs.length ? `<span class="side-lab ${labsDone === labs.length ? 'is-pass' : ''}" title="${labsDone}/${labs.length} labs passed">${labs.length > 1 ? labsDone + '/' + labs.length + ' ' : ''}lab</span>` : '';
        html += `<a class="side-link ${l.id === current ? 'is-current' : ''} ${r[l.id] ? 'is-read' : ''}" href="#${l.id}" ${l.id === current ? 'aria-current="page"' : ''}>
          <span class="side-num">${num(l)}</span><span>${esc(l.title)}</span><span class="side-marks">${labMark}<span class="side-dot" title="${r[l.id] ? 'Read' : 'Not read yet'}"></span></span></a>`;
      });
    });
    html += '<button class="side-reset" id="resetAll" type="button">Reset all progress</button>';
    const side = $('#side');
    const st = side.scrollTop;
    side.innerHTML = html;
    side.scrollTop = st;
    const cur = side.querySelector('.is-current');
    if (cur) {
      const r1 = cur.getBoundingClientRect(), r2 = side.getBoundingClientRect();
      if (r1.top < r2.top + 40 || r1.bottom > r2.bottom - 20) cur.scrollIntoView({ block: 'center' });
    }
  }

  function refreshChrome() { renderSide(); renderProgress(); }

  /* ---- content enhancers ---- */
  function enhanceCode(root) {
    $$('pre', root).forEach((pre) => {
      if (pre.closest('.code, .lab, .ce, .lab-hint')) return;
      const codeEl = pre.querySelector('code');
      const cls = ((codeEl && codeEl.className) || pre.className || '');
      const lm = cls.match(/(?:lang|language)-([\w-]+)/);
      const lang = lm ? lm[1].toLowerCase() : '';
      const src = (codeEl || pre).textContent.replace(/^\n/, '').replace(/\s+$/, '');
      const wrap = document.createElement('div');
      wrap.className = 'code';
      wrap.innerHTML = `<div class="code-bar"><span>${esc(LANG_LABEL[lang] || lang || 'Code')}</span><button type="button">Copy</button></div><pre><code>${highlight(src, lang)}</code></pre>`;
      wrap.querySelector('button').addEventListener('click', () => copyText(src));
      pre.replaceWith(wrap);
    });
  }

  function enhanceTables(root) {
    $$('table', root).forEach((t) => {
      if (t.parentElement.classList.contains('tbl-wrap')) return;
      t.classList.add('tbl');
      const w = document.createElement('div');
      w.className = 'tbl-wrap';
      t.replaceWith(w);
      w.appendChild(t);
    });
  }

  // Diagrams: keep SVG text legible on phones by giving wide diagrams a minimum width and letting them scroll sideways.
  function enhanceDiagrams(root) {
    $$('figure.diagram', root).forEach((fig) => {
      const svg = fig.querySelector('svg');
      if (!svg || svg.parentElement.classList.contains('diagram-scroll')) return;
      const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
      const vbw = vb.length === 4 && vb[2] > 0 ? vb[2] : 0;
      const wrap = document.createElement('div');
      wrap.className = 'diagram-scroll';
      svg.replaceWith(wrap);
      wrap.appendChild(svg);
      if (!svg.getAttribute('width')) svg.setAttribute('width', '100%');
      if (vbw) {
        const minW = Math.round(Math.min(vbw, 760) * 0.62);
        svg.style.minWidth = minW + 'px';
        svg.style.maxWidth = Math.max(vbw * 1.25, 320) + 'px';
        if (minW > 360) {
          const hint = document.createElement('p');
          hint.className = 'diagram-hint';
          hint.textContent = 'Scroll sideways to see the whole diagram →';
          hint.hidden = true;
          fig.insertBefore(hint, wrap);
          requestAnimationFrame(() => { hint.hidden = !(wrap.scrollWidth > wrap.clientWidth + 4); });
        }
      }
    });
  }

  /* ---- quizzes ---- */
  function parseQuiz(raw) {
    try { return JSON.parse(raw); } catch (e) {
      // Second chance: authors may have left HTML entities in the attribute value
      const t = document.createElement('textarea');
      t.innerHTML = raw;
      return JSON.parse(t.value);
    }
  }
  function quiz(el, lessonId, qi) {
    let qs;
    try { qs = parseQuiz(el.getAttribute('data-quiz')); } catch (e) {
      el.className = 'lab-missing';
      el.textContent = 'This quiz could not be loaded (its JSON is invalid).';
      console.warn('quiz JSON error in', lessonId, e);
      return;
    }
    if (!Array.isArray(qs)) qs = [qs];
    const key = `quiz:${lessonId}:${qi}`;
    const keys = 'ABCDEFGH';
    const score = () => {
      const s = Store.get(key, {}) || {};
      const answered = Object.keys(s).filter((k) => qs[k]).length;
      const right = Object.keys(s).filter((k) => qs[k] && s[k] === qs[k].a).length;
      return answered ? `${right}/${qs.length} correct${answered < qs.length ? ` · ${qs.length - answered} left` : ''}` : `${qs.length} questions`;
    };
    // Show options in a stable shuffled order (seeded by lesson, quiz and question) so the right answer
    // isn't always in the same slot. data-o keeps the author's original index.
    const order = (q, i) => {
      const idx = (q.o || []).map((_, j) => j);
      let h = 2166136261;
      for (const ch of `${lessonId}:${qi}:${i}:${q.q}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
      for (let k = idx.length - 1; k > 0; k--) { h = (Math.imul(h, 1103515245) + 12345) >>> 0; const r = h % (k + 1); [idx[k], idx[r]] = [idx[r], idx[k]]; }
      return idx;
    };
    el.className = 'quiz';
    el.removeAttribute('data-quiz');
    el.setAttribute('data-quiz-rendered', '');
    el.innerHTML = `<div class="quiz-head"><h3>Check yourself</h3><span class="quiz-score">${score()}</span></div>` +
      qs.map((q, i) => `<div class="q" data-q="${i}"><p class="q-text"><span class="q-n">Q${i + 1}</span>${q.q}</p><div class="q-opts">${order(q, i).map((j, k) => `<button type="button" class="q-opt" data-o="${j}"><span class="q-key">${keys[k]}</span><span>${q.o[j]}</span></button>`).join('')}</div><p class="q-why" hidden></p></div>`).join('') +
      '<button class="link-btn" type="button" data-reset>Reset answers</button>';
    const mark = (qEl, i, pick) => {
      const q = qs[i];
      $$('.q-opt', qEl).forEach((b) => {
        const j = Number(b.dataset.o);
        b.disabled = true;
        if (j === q.a) b.classList.add('is-right');
        else if (j === pick) b.classList.add('is-wrong');
        else b.classList.add('is-dim');
      });
      const why = $('.q-why', qEl);
      why.innerHTML = `<b class="${pick === q.a ? 'is-right' : 'is-wrong'}">${pick === q.a ? 'Correct.' : 'Not quite.'}</b> ${q.why || ''}`;
      why.hidden = false;
    };
    const saved = Store.get(key, {}) || {};
    $$('.q', el).forEach((qEl) => {
      const i = Number(qEl.dataset.q);
      if (saved[i] != null) mark(qEl, i, saved[i]);
      qEl.addEventListener('click', (e) => {
        const b = e.target.closest('.q-opt');
        if (!b || b.disabled) return;
        const pick = Number(b.dataset.o);
        const s = Store.get(key, {}) || {};
        s[i] = pick;
        Store.set(key, s);
        mark(qEl, i, pick);
        $('.quiz-score', el).textContent = score();
      });
    });
    $('[data-reset]', el).addEventListener('click', () => {
      Store.set(key, null);
      el.setAttribute('data-quiz', JSON.stringify(qs));
      quiz(el, lessonId, qi);
    });
  }

  /* ---- labs ---- */
  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5v14l12-7z"/></svg>';
  function lab(el) {
    const id = el.getAttribute('data-lab');
    const L = LABS[id];
    if (!L) {
      el.className = 'lab-missing';
      el.textContent = `Lab "${id}" is not available yet.`;
      return;
    }
    const draftKey = 'code:' + id;
    const hintKey = 'hints:' + id;
    const isPassed = () => !!passed()[id];
    const isPy = L.lang === 'python';
    el.className = 'lab' + (isPy ? ' lab-py' : '');
    el.id = 'lab-' + id;
    el.innerHTML = `
      <div class="lab-head"><span class="lab-badge">${isPy ? 'Python lab' : 'Lab'}</span><h3>${esc(L.title)}</h3>
        <span class="lab-mins">~${L.minutes || 20} min · ${L.tests.length} tests</span><span class="lab-status" ${isPassed() ? '' : 'hidden'}>Passed ✓</span></div>
      <div class="lab-prompt">${L.prompt}</div>
      <div class="lab-editor"></div>${isPy ? '<div class="lab-pystatus" aria-live="polite"></div>' : ''}
      <div class="lab-resize" title="Drag to resize the editor" aria-hidden="true"></div>
      <div class="lab-bar">
        <button class="btn primary" type="button" data-act="run">${ICON_PLAY}Run tests</button>
        <button class="btn" type="button" data-act="hint">Hint</button>
        <button class="btn" type="button" data-act="solution">Show solution</button>
        <button class="btn" type="button" data-act="reset">Reset</button>
        <span class="spacer"></span><span class="lab-kbd">Ctrl/⌘ + Enter runs · Esc leaves the editor</span>
      </div>
      <div class="lab-out">
        <div class="lab-hints"></div>
        <div class="lab-confirm" hidden></div>
        <div class="lab-solution" hidden></div>
        <div class="lab-results" aria-live="polite"></div>
        <div class="lab-explain" hidden><b>What you just built</b>${L.explain || ''}</div>
      </div>`;
    const edEl = $('.lab-editor', el);
    const editor = new CodeEditor(edEl, {
      label: L.title + ' code',
      lang: isPy ? 'python' : 'js',
      onRun: () => run(),
      onChange: (v) => { Store.set(draftKey, v === L.starter ? null : v); fit(); },
    });
    let userSized = false;
    const fit = () => {
      if (userSized) return;
      const lines = editor.value.split('\n').length;
      edEl.style.height = Math.max(180, Math.min(560, lines * 20 + 48)) + 'px';
    };
    editor.setValue(Store.get(draftKey, null) ?? L.starter);
    fit();

    // drag to resize
    const grip = $('.lab-resize', el);
    grip.addEventListener('pointerdown', (e) => {
      const y0 = e.clientY, h0 = edEl.offsetHeight;
      grip.setPointerCapture(e.pointerId);
      const mv = (ev) => { userSized = true; edEl.style.height = Math.max(120, h0 + ev.clientY - y0) + 'px'; };
      const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); };
      grip.addEventListener('pointermove', mv);
      grip.addEventListener('pointerup', up);
    });

    // hints
    const hints = L.hints || [];
    const hintBtn = $('[data-act="hint"]', el);
    const renderHints = () => {
      const n = Math.min(Store.get(hintKey, 0) || 0, hints.length);
      $('.lab-hints', el).innerHTML = hints.slice(0, n).map((h, i) => `<div class="lab-hint"><b>Hint ${i + 1} of ${hints.length}</b>${h}</div>`).join('');
      $('.lab-hints', el).style.display = n ? 'grid' : 'none';
      $('.lab-hints', el).style.gap = '8px';
      hintBtn.textContent = n >= hints.length ? 'No more hints' : `Hint ${n + 1} of ${hints.length}`;
      hintBtn.disabled = n >= hints.length;
    };
    renderHints();

    const confirmEl = $('.lab-confirm', el);
    const solEl = $('.lab-solution', el);
    const showSolution = () => {
      confirmEl.hidden = true;
      solEl.hidden = false;
      solEl.innerHTML = `<div class="code"><div class="code-bar"><span>Model solution</span><span><button type="button" data-act="load">Load into editor</button><button type="button" data-act="copy">Copy</button><button type="button" data-act="hide">Hide</button></span></div><pre><code>${isPy ? hlPy(L.solution) : hlJs(L.solution)}</code></pre></div>`;
    };

    const resultsEl = $('.lab-results', el);
    let running = false;
    async function run() {
      if (running) return;
      running = true;
      const runBtn = $('[data-act="run"]', el);
      runBtn.disabled = true;
      resultsEl.innerHTML = '<div class="lab-summary">Running…</div>';
      const code = editor.value;
      const done = () => { runBtn.disabled = false; running = false; };
      let res;
      if (isPy) {
        let out;
        try {
          if (PyRuntime.state !== 'ready') resultsEl.innerHTML = '<div class="lab-summary">Starting Python…</div>';
          out = await PyRuntime.runAll(code, L.tests, (i) => { resultsEl.innerHTML = `<div class="lab-summary">Running test ${i + 1} of ${L.tests.length}…</div>`; });
        } catch (e) {
          resultsEl.innerHTML = `<div class="lab-summary is-bad">Python couldn't start</div><div class="lab-err">${esc(e.message)}</div>`;
          done();
          return;
        }
        if (out.syntax) {
          resultsEl.innerHTML = `<div class="lab-summary is-bad">Your code doesn't parse</div><div class="lab-err">${esc(out.syntax)}</div>`;
          done();
          return;
        }
        res = out.results;
      } else {
        const syn = Runner.syntaxCheck(code);
        if (syn) {
          resultsEl.innerHTML = `<div class="lab-summary is-bad">Your code doesn't parse</div><div class="lab-err">${esc(syn.name + ': ' + syn.message)}</div>`;
          done();
          return;
        }
        res = await Runner.runAll(code, L.tests);
      }
      const nOk = res.filter((r) => r.ok).length;
      const all = nOk === res.length;
      resultsEl.innerHTML = `<div class="lab-summary ${all ? 'is-ok' : 'is-bad'}">${all ? '✓ All ' + res.length + ' tests pass' : `${nOk} of ${res.length} tests pass`}</div>
        <ul class="lab-tests">${res.map((r, i) => `<li class="${r.ok ? 'pass' : 'fail'}"><span class="ic">${r.ok ? '✓' : '✗'}</span><span>${esc(L.tests[i].name)}</span>${r.ok ? '' : `<span class="msg">${esc(r.msg)}</span>`}${!r.ok && r.tb ? `<pre class="tb">${esc(r.tb)}</pre>` : ''}${r.logs.length ? `<details ${!r.ok && isPy ? 'open' : ''}><summary>${isPy ? 'print output' : `console output (${r.logs.length})`}</summary><div class="logs">${esc(r.logs.join('\n'))}</div></details>` : ''}${r.ok ? '' : `<details><summary>test code</summary><div class="logs">${esc(L.tests[i].code)}</div></details>`}</li>`).join('')}</ul>`;
      if (all) {
        const p = passed();
        p[id] = true;
        Store.set('labs', p);
        $('.lab-status', el).hidden = false;
        $('.lab-explain', el).hidden = false;
        refreshChrome();
      }
      runBtn.disabled = false;
      running = false;
    }

    if (isPassed()) $('.lab-explain', el).hidden = false;

    if (isPy) {
      const st = $('.lab-pystatus', el);
      const paint = (state, err) => {
        if (!st.isConnected) return;
        st.className = 'lab-pystatus is-' + state;
        st.innerHTML = state === 'loading' ? '<span class="spin" aria-hidden="true"></span>Loading Python… first time only, about 10 MB'
          : state === 'ready' ? `Python ready · runs in your browser${PyRuntime.mode === 'main' ? ' (no infinite-loop protection here)' : ''}`
          : state === 'error' ? `Python couldn't load: ${esc(err)} <button class="link-btn" type="button" data-act="pyretry">Try again</button>`
          : 'Real Python (CPython via Pyodide) runs here in your browser. It loads when you start.';
      };
      paint(PyRuntime.state, PyRuntime.error);
      const off = PyRuntime.onState((s2, err) => { if (!st.isConnected) { off(); return; } paint(s2, err); });
      const warm = () => { PyRuntime.ensure().catch(() => {}); };
      editor.ta.addEventListener('focus', warm, { once: true });
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((ents) => { if (ents.some((x) => x.isIntersecting)) { io.disconnect(); warm(); } }, { rootMargin: '200px' });
        io.observe(el);
      }
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || !el.contains(b)) return;
      const act = b.dataset.act;
      if (act === 'run') run();
      if (act === 'pyretry') PyRuntime.ensure().catch(() => {});
      if (act === 'hint') { Store.set(hintKey, (Store.get(hintKey, 0) || 0) + 1); renderHints(); }
      if (act === 'solution') {
        if (!solEl.hidden) return;
        confirmEl.hidden = false;
        confirmEl.innerHTML = '<span>You learn more by struggling a bit first. Show the model solution anyway?</span><button class="btn danger" type="button" data-act="sol-yes">Yes, show it</button><button class="btn" type="button" data-act="sol-no">Keep trying</button>';
      }
      if (act === 'sol-yes') showSolution();
      if (act === 'sol-no') confirmEl.hidden = true;
      if (act === 'hide') solEl.hidden = true;
      if (act === 'copy') copyText(L.solution);
      if (act === 'load') { editor.setValue(L.solution); Store.set(draftKey, L.solution); userSized = false; fit(); toast('Solution loaded. Run the tests to see it pass.'); }
      if (act === 'reset') {
        if (b.dataset.armed) {
          editor.setValue(L.starter);
          Store.set(draftKey, null);
          Store.set(hintKey, null);
          renderHints();
          resultsEl.innerHTML = '';
          solEl.hidden = true;
          confirmEl.hidden = true;
          userSized = false;
          fit();
          b.textContent = 'Reset';
          delete b.dataset.armed;
        } else {
          b.dataset.armed = '1';
          b.textContent = 'Click again to reset';
          setTimeout(() => { if (b.isConnected) { b.textContent = 'Reset'; delete b.dataset.armed; } }, 3000);
        }
      }
    });
  }

  /* ---- routing ---- */
  function show(id, opts = {}) {
    const l = byId[id] || byId.start || LESSONS[0];
    if (!l) return;
    current = l.id;
    const tpl = document.getElementById('tpl-' + l.id);
    const art = $('#lesson');
    art.innerHTML = '';
    if (l.id !== 'start') {
      const eb = document.createElement('p');
      eb.className = 'eyebrow';
      eb.textContent = `${l.part} · ${num(l)}`;
      art.appendChild(eb);
    }
    if (tpl) art.appendChild(tpl.content.cloneNode(true));
    else art.innerHTML += `<h1>${esc(l.title)}</h1><p>This lesson is missing.</p>`;

    // meta chips under the lede
    const labs = l.labs.filter((x) => LABS[x]);
    const lede = $('.lede', art);
    if (l.id !== 'start' && lede) {
      const words = (art.textContent || '').split(/\s+/).length;
      const mins = Math.max(5, Math.round(words / 200 / 5) * 5);
      const chips = document.createElement('div');
      chips.className = 'meta-row';
      chips.innerHTML = `<span class="chip">~${mins} min read</span>` +
        labs.map((x) => `<a class="chip ${passed()[x] ? 'is-ok' : ''}" href="#${l.id}" data-jump="lab-${x}" style="text-decoration:none">${passed()[x] ? '✓ ' : ''}Lab: ${esc(LABS[x].title)}</a>`).join('');
      lede.after(chips);
    }

    enhanceCode(art);
    enhanceTables(art);
    enhanceDiagrams(art);
    $$('[data-quiz]', art).forEach((q, i) => quiz(q, l.id, i));
    $$('[data-lab]', art).forEach(lab);
    $$('[data-goto]', art).forEach((a) => { if (a.tagName === 'A' && !a.getAttribute('href')) a.setAttribute('href', '#' + a.dataset.goto); });
    if (l.id === 'start') startExtras(art);

    // pager
    const prev = LESSONS[l.index - 1], next = LESSONS[l.index + 1];
    const isRead = !!read()[l.id];
    const pager = document.createElement('nav');
    pager.className = 'pager';
    pager.setAttribute('aria-label', 'Lesson navigation');
    pager.innerHTML =
      (prev ? `<a class="prev" href="#${prev.id}"><small>← Previous</small><span class="pg-title">${esc(prev.title)}</span></a>` : '<span></span>') +
      (l.id === 'start' ? '<span></span>' : `<button type="button" class="mark-read ${isRead ? 'is-on' : ''}" data-mark="${l.id}">${isRead ? '✓ Read' : 'Mark as read'}</button>`) +
      (next ? `<a class="next ${isRead || l.id === 'start' ? '' : 'is-primary'}" href="#${next.id}" data-advance="${l.id}"><small>${l.id === 'start' ? 'Begin →' : isRead ? 'Next →' : 'Done · next →'}</small><span class="pg-title">${esc(next.title)}</span></a>` : '');
    art.appendChild(pager);

    document.title = (l.id === 'start' ? '' : l.title + ' · ') + 'Backend & System Design';
    Store.set('last', l.id);
    if (location.hash.slice(1) !== l.id) { try { history.replaceState(null, '', '#' + l.id); } catch (e) { /* sandboxed */ } }
    closeSide();
    refreshChrome();
    if (opts.scroll !== false) window.scrollTo(0, 0);
  }

  function startExtras(art) {
    $$('.days a[href^="#"]', art).forEach((a) => {
      const id = a.getAttribute('href').slice(1);
      if (!byId[id]) { const s = document.createElement('span'); s.textContent = a.textContent; s.style.opacity = '.55'; s.title = 'Coming soon'; a.replaceWith(s); }
      else if (read()[id]) a.textContent = '✓ ' + a.textContent;
    });
    const box = $('[data-continue]', art);
    if (!box) return;
    const r = read();
    const last = Store.get('last', null);
    const firstUnread = LESSONS.find((l) => l.id !== 'start' && !r[l.id]);
    const target = (last && last !== 'start' && byId[last] && !r[last]) ? byId[last] : firstUnread;
    const anyRead = LESSONS.some((l) => r[l.id]);
    box.className = 'continue';
    box.innerHTML = target
      ? `<a class="btn primary" href="#${target.id}" style="text-decoration:none">${anyRead ? 'Continue' : 'Start'}: ${esc(target.title)} →</a><span style="color:var(--muted);font-size:14px">${anyRead ? 'Picks up at your first unread lesson.' : 'About an hour a day.'}</span>`
      : '<span class="chip is-ok">You have read every lesson. Now do the case studies again without peeking.</span>';
  }

  /* ---- sidebar open/close ---- */
  const narrow = () => window.matchMedia('(max-width: 900px)').matches;
  function closeSide() { document.body.classList.remove('side-open'); syncToggle(); }
  function syncToggle() {
    const open = narrow() ? document.body.classList.contains('side-open') : !document.body.classList.contains('side-collapsed');
    $('#sideToggle').setAttribute('aria-expanded', String(open));
  }

  function setTheme(t) {
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    Store.set('theme', t || null);
  }
  function effectiveTheme() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function init() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('.side-link')) closeSide();
      const mk = e.target.closest('[data-mark]');
      if (mk) {
        const r = read();
        r[mk.dataset.mark] = !r[mk.dataset.mark];
        Store.set('read', r);
        show(current, { scroll: false });
        return;
      }
      const adv = e.target.closest('[data-advance]');
      if (adv && adv.dataset.advance !== 'start') {
        const r = read();
        if (!r[adv.dataset.advance]) { r[adv.dataset.advance] = true; Store.set('read', r); }
      }
      const jump = e.target.closest('[data-jump]');
      if (jump) {
        e.preventDefault();
        const t = document.getElementById(jump.dataset.jump);
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (e.target.closest('#resetAll')) {
        if (e.target.dataset.armed) {
          Store.clearAll();
          show(current, { scroll: false });
          toast('Progress reset');
        } else {
          e.target.dataset.armed = '1';
          e.target.textContent = 'Click again to erase all progress';
        }
      }
    });
    window.addEventListener('hashchange', () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (byId[id] && id !== current) show(id);
      else if (!byId[id]) {
        // in-page anchor inside the current lesson
        const t = id && document.getElementById(id);
        if (t) t.scrollIntoView({ block: 'start' });
      }
    });
    $('#sideToggle').addEventListener('click', () => {
      if (narrow()) document.body.classList.toggle('side-open');
      else {
        const c = !document.body.classList.contains('side-collapsed');
        document.body.classList.toggle('side-collapsed', c);
        Store.set('sideCollapsed', c);
      }
      syncToggle();
    });
    $('#scrim').addEventListener('click', closeSide);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('side-open')) closeSide(); });
    $('#themeBtn').addEventListener('click', () => {
      const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
      const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      setTheme(next === sys ? null : next);
    });
    if (Store.get('sideCollapsed', false)) document.body.classList.add('side-collapsed');
    syncToggle();
    const h = decodeURIComponent(location.hash.slice(1));
    show(byId[h] ? h : 'start', { scroll: false });
  }
  return { init, show, lessons: LESSONS };
})();

App.init();
