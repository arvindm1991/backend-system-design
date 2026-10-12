# Python track: addendum to COURSE_SPEC.md

Read `/home/claude/backend/COURSE_SPEC.md` first. Everything there still applies (reader profile, lesson format,
quality bar, diagrams, callouts, quizzes). This addendum adds **Python as a core skill**.

## Why and for whom
Arvind knows JavaScript/TypeScript and React. He builds with AI daily but wants to be able to read, write and reason about
Python backends himself: most AI/LLM backends, data work and many APIs are Python. Teach Python **through the lens of a JS
developer** ("in JS you'd write X; in Python it's Y, and here's the difference that will bite you"), then use it for real
backend work. Hands-on: every lesson has runnable Python labs.

## New part
`data-part="Part 0 · Python for backend builders"`, `data-order` 1–9 (the start page is 0, Part 1 starts at 10).
The sidebar groups by part and sorts by order, so this part appears first.

| order | id | Lesson | Owner |
|---|---|---|---|
| 1 | `py-basics` | Python for JavaScript developers: syntax mapping, indentation, truthiness, None vs null/undefined, f-strings, == vs is, integer division, mutability and the default-mutable-argument trap | P1 |
| 2 | `py-data` | Lists, dicts, sets, tuples; slicing; comprehensions; sorting with key=; enumerate/zip; collections (Counter, defaultdict); JSON in/out. Mirror the JS data-pipeline ideas (filter/map/group/reduce) in Python. | P1 |
| 3 | `py-functions` | Functions (args, kwargs, defaults, *args/**kwargs), closures, lambdas, decorators (built step by step), classes vs dataclasses, type hints, Protocols at concept level, exceptions and try/except/finally, context managers (`with`) | P1 |
| 4 | `py-project` | How a real Python project is laid out: modules and packages, imports, virtual environments, pip/uv, pyproject.toml, `if __name__ == "__main__"`, env vars and config, logging. (Concept lesson; labs optional.) | P1 |
| 5 | `py-async` | Concurrency in Python: the GIL in plain words, threads vs processes vs asyncio, async/await compared with JS promises, `asyncio.gather`, timeouts, semaphores to limit concurrency (e.g. calling an LLM API for 30 students at most 5 at a time) | P2 |
| 6 | `py-fastapi` | Building an API with FastAPI: routes, path/query params, request bodies with Pydantic models and validation, status codes and errors, dependencies (auth, db session), background tasks, streaming responses (SSE for LLM tokens), OpenAPI docs. Labs test the pure handler/model logic. | P2 |
| 7 | `py-db` | Talking to a database from Python: sqlite3 (runs in the browser!), parameterized queries (SQL injection), transactions, an ORM (SQLAlchemy) at concept level, migrations (Alembic) at concept level, N+1 in ORM form | P2 |
| 8 | `py-testing` | Testing Python backends: pytest basics, fixtures, parametrize, mocking external calls, testing a FastAPI app with a test client (concept + code), what to test | P2 |
| 9 | `py-llm` | Calling LLM APIs from Python: the Anthropic Python SDK shape (messages, system prompt, streaming, tool use) at concept level with code, retries/timeouts, structured outputs with Pydantic, cost/token tracking, a small agent loop. Labs use a fake client so they're deterministic. Be accurate; if unsure of exact SDK details, describe the concept and say "check the SDK docs". | P2 |

## Python labs (runnable in the browser via Pyodide)
Same JSON file format as JS labs in `src/labs/<id>.json`, plus `"lang": "python"`. Ids must start with `py-`.
```json
{
  "id": "py-group-by", "lang": "python", "title": "...", "minutes": 15,
  "prompt": "<p>HTML</p>",
  "starter": "def group_by_grade(students):\n    # TODO\n    pass\n",
  "solution": "def group_by_grade(students):\n    ...",
  "tests": [ { "name": "groups two grades", "code": "assert_equal(group_by_grade([...]), {...})" } ],
  "hints": ["<p>...</p>"],
  "explain": "<p>...</p>"
}
```
Runner semantics (the shell author implements; content authors rely on them):
- A fresh namespace dict per test. The user's code runs with `exec(user_code, ns)`, then the test code runs in the same `ns`.
- Helpers pre-injected into `ns`: `assert_equal(actual, expected, msg=None)` (deep ==, shows both values on failure),
  `assert_raises(exc_type, fn, *args, **kwargs)`, and `run(coro)` which runs a coroutine to completion and returns its result
  (for async labs). Test code may also use plain `assert`.
- Only the Python standard library is available (plus nothing else: no pip installs). sqlite3, json, dataclasses, asyncio,
  collections, itertools, functools, re, datetime, typing are fine. FastAPI/Pydantic/pytest are NOT available, so labs for those
  lessons test the plain-Python logic (e.g. a validation function, a handler function taking a dict, a tiny router you build,
  a fake LLM client) and the lesson shows the real framework code in snippets.
- Deterministic: inject clocks/randomness. Async labs must not depend on real wall-clock timing beyond tiny `asyncio.sleep(0)`
  style yields; use an injected fake clock or count concurrency with counters.
- 4–8 tests per lab; the starter must fail at least one test; the solution must pass all.
- Each lesson 1–3 and 5–9 has at least 1 lab (aim for 2 in lessons 1–3). Lesson 4 may have none.
- Verify your labs locally with plain CPython: `python3 /home/claude/backend/test/check_py_labs.py` (written by the shell author;
  if it does not exist yet, write an equivalent checker in your scratchpad that implements the semantics above).

## Files each author owns
- P1: `src/lessons/py-basics.html`, `py-data.html`, `py-functions.html`, `py-project.html` and their `src/labs/py-*.json`.
- P2: `src/lessons/py-async.html`, `py-fastapi.html`, `py-db.html`, `py-testing.html`, `py-llm.html` and their labs.
- Shell (A): `src/shell.js`, `src/head.html`, `build.py`, `test/*`, `src/lessons/start.html` (update the start page and the
  6-week plan to include Part 0, e.g. as a parallel Python track in weeks 1–3, and mention the Python labs).
Code snippets in lessons: use `<pre><code class="lang-py">` (the shell author adds Python highlighting).
