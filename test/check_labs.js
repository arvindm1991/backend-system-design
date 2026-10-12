#!/usr/bin/env node
// Verifies every src/labs/*.json: the solution passes all tests, the starter fails at least one.
// Uses exactly the in-page runner semantics from COURSE_SPEC.md:
//   new Function('assert','assertEqual','sleep', userCode + '\n;return (async () => {\n' + test.code + '\n})();')
// Each test has a 2 second timeout. Usage: node test/check_labs.js [lab-id ...]
'use strict';
const fs = require('fs');
const path = require('path');

const LAB_DIR = path.join(__dirname, '..', 'src', 'labs');
const TIMEOUT_MS = 2000;

// ---- helpers (keep in sync with src/shell.js) ----
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
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEqual(actual, expected, msg) {
  if (!deepEqual(actual, expected)) {
    throw new Error((msg ? msg + ': ' : '') + 'expected ' + fmt(expected) + ', got ' + fmt(actual));
  }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function runOne(userCode, test) {
  let timer;
  try {
    const fn = new Function('assert', 'assertEqual', 'sleep', userCode + '\n;return (async () => {\n' + test.code + '\n})();');
    const p = Promise.resolve(fn(assert, assertEqual, sleep));
    const t = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timed out after 2s')), TIMEOUT_MS); });
    await Promise.race([p, t]);
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: (e && e.message) || String(e) };
  } finally { clearTimeout(timer); }
}

function validateShape(lab, file) {
  const errs = [];
  const id = path.basename(file, '.json');
  if (lab.id !== id) errs.push(`id "${lab.id}" does not match filename "${id}"`);
  for (const k of ['title', 'prompt', 'starter', 'solution', 'explain']) if (typeof lab[k] !== 'string' || !lab[k].trim()) errs.push(`missing string field "${k}"`);
  if (typeof lab.minutes !== 'number') errs.push('missing number field "minutes"');
  if (!Array.isArray(lab.tests) || lab.tests.length === 0) errs.push('tests must be a non-empty array');
  else {
    if (lab.tests.length < 4 || lab.tests.length > 8) errs.push(`has ${lab.tests.length} tests (spec: 4-8)`);
    lab.tests.forEach((t, i) => { if (!t || typeof t.name !== 'string' || typeof t.code !== 'string') errs.push(`test #${i + 1} needs string name and code`); });
  }
  if (!Array.isArray(lab.hints) || lab.hints.length === 0) errs.push('hints must be a non-empty array');
  return errs;
}

async function main() {
  const only = process.argv.slice(2);
  let files = [];
  try { files = fs.readdirSync(LAB_DIR).filter((f) => f.endsWith('.json')).sort(); } catch (e) { console.log('no lab dir: ' + LAB_DIR); }
  if (only.length) files = files.filter((f) => only.includes(path.basename(f, '.json')));
  let bad = 0;
  let pyCount = 0;
  // Silence console output from user code during runs.
  const realLog = console.log;
  for (const f of files) {
    const full = path.join(LAB_DIR, f);
    let lab;
    try { lab = JSON.parse(fs.readFileSync(full, 'utf8')); } catch (e) {
      if (f.startsWith('py-')) { pyCount++; continue; } // reported by check_py_labs.py
      bad++; realLog(`FAIL ${f}: invalid JSON (${e.message})`); continue;
    }
    if (lab && (lab.lang === 'python' || f.startsWith('py-'))) { pyCount++; continue; }
    const shapeErrs = validateShape(lab, f);
    if (!Array.isArray(lab.tests)) { bad++; realLog(`FAIL ${f}: ${shapeErrs.join('; ')}`); continue; }
    const problems = [...shapeErrs];
    console.log = () => {};
    const solRes = [], startRes = [];
    for (const t of lab.tests) solRes.push(await runOne(lab.solution || '', t));
    for (const t of lab.tests) startRes.push(await runOne(lab.starter || '', t));
    console.log = realLog;
    solRes.forEach((r, i) => { if (!r.ok) problems.push(`solution fails "${lab.tests[i].name}": ${r.msg}`); });
    const starterFails = startRes.filter((r) => !r.ok).length;
    if (starterFails === 0) problems.push('starter passes every test (must fail at least one)');
    if (problems.length) {
      bad++;
      realLog(`FAIL ${f}`);
      problems.forEach((p) => realLog('     - ' + p));
    } else {
      realLog(`OK   ${f}  (${lab.tests.length} tests; starter fails ${starterFails})`);
    }
  }
  const jsTotal = files.length - pyCount;
  realLog(`\n${jsTotal - bad}/${jsTotal} JavaScript labs OK`);
  let pyBad = false;
  if (pyCount && !process.env.BSD_SKIP_PY) {
    // Python labs are checked with CPython using the same harness the page uses.
    realLog(`\nPython labs (${pyCount}) via test/check_py_labs.py:`);
    const { spawnSync } = require('child_process');
    const pyIds = files.filter((f) => f.startsWith('py-') || (() => { try { return JSON.parse(fs.readFileSync(path.join(LAB_DIR, f), 'utf8')).lang === 'python'; } catch (e) { return false; } })()).map((f) => path.basename(f, '.json'));
    const r = spawnSync('python3', [path.join(__dirname, 'check_py_labs.py'), ...(only.length ? pyIds : [])], { stdio: 'inherit' });
    pyBad = r.status !== 0;
  }
  process.exit(bad || pyBad ? 1 : 0);
}

process.on('unhandledRejection', () => {});
main().catch((e) => { console.error('checker crashed: ' + e.stack); process.exit(1); });
