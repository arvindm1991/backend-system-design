# Backend, System Design & Coding Patterns

A hands-on course for full-stack builders: backend fundamentals, distributed systems, system design interviews, and the
coding patterns behind most LeetCode-style problems. It runs entirely in the browser as one HTML file, and the code labs run
right in the page.

**Open it:** download [`dist/index.html`](dist/index.html) and double-click it.

## What's inside
| Part | Lessons |
|---|---|
| 1 · Foundations | How a request travels · API design · Data modeling & SQL · Auth, permissions and tenants |
| 2 · Scaling building blocks | How systems grow · Caching · Queues & background jobs · Rate limiting · Realtime · Storage choices |
| 3 · Distributed systems | Why it's hard (CAP/PACELC) · Clocks, consensus & quorums · Reliability · Event-driven architecture · Backends for AI products |
| 4 · System design | The interview framework · 11 worked case studies (URL shortener, news feed, chat, notifications, rate limiter, file upload, autocomplete, LLM chat product, ticket booking, K-12 platform, collaborative editing) · Cheat sheet |
| 5 · Coding patterns (DSA) | How to attack any problem (Big-O from zero) · Hashing · Prefix sums · Two pointers · Sliding window · Stacks · Binary search · Intervals & greedy · Linked lists · Trees & recursion · Heaps · Graphs · Backtracking · Dynamic programming · Recognition drill |

Every lesson uses concrete running examples with real numbers, diagrams that work in light and dark mode, "say it in the
interview" callouts, common mistakes, and a quiz. **52 code labs** (rate limiters, LRU cache, retries with backoff,
idempotent consumers, consistent hashing, circuit breaker, outbox relay, vector clocks, and 40 classic LeetCode-style problems)
run in the browser with tests, escalating hints and reference solutions.

Progress is saved in your browser's localStorage. A suggested 6-week plan is on the start page.

## Project layout
```
src/lessons/    one <template> per lesson (data-part / data-order decide the sidebar)
src/labs/       one JSON file per lab: prompt, starter, solution, tests, hints, explanation
src/shell.js    navigation, progress, quizzes, lab runner, editor
build.py        assembles everything into dist/index.html (--strict fails on any warning)
test/           check_labs.js (every solution passes, every starter fails), run.py (Playwright smoke test)
```

## Build and test
```bash
python3 build.py --strict
node test/check_labs.js
python3 test/run.py          # needs Python Playwright + Chromium
```
`COURSE_SPEC.md` and `DSA_SPEC.md` describe the lesson and lab formats used to write the course. The shell also contains a
dormant Python (Pyodide) lab runner described in `PYTHON_SPEC.md`; no Python labs ship yet.
