# Backend, distributed systems & system design: course spec

## Who it's for
Arvind is a Director of Product & Engineering (AI edtech), an ex-founder, and a "full-stack builder, not a SWE". He knows
frontend and React and builds with AI daily. He wants a **real course** that makes him strong at backend, distributed
systems and system design **as a full-stack builder**: designing and reasoning about real systems, not LeetCode.
He learns best from **concrete examples and traces**, not dense lists. Explain from scratch, build intuition with a
running example, then generalize. Short paragraphs. Plain words. Define every term the first time it appears.
Each lesson should leave him able to *say out loud in a design discussion* what he'd do and why.

## Product
A single self-contained HTML page (one file, published as an artifact), modeled on the existing prep kit at
`/home/claude/prep` (look at `src/head.html` for the visual language and light/dark tokens, `src/guide.js` for nav and progress,
`src/katas.js` for an in-browser code exercise with Run/Hint/Show answer). Left sidebar of modules grouped into parts;
main pane shows one lesson; progress (lessons read, labs passed) saved to localStorage wrapped in try/catch;
collapsible sidebar; works at phone width; light + dark mode.

## Directory layout (each author owns only their files)
```
/home/claude/backend/
  build.py                 (owner: A) assembles dist/index.html
  src/head.html            (owner: A) <head>, all CSS
  src/body.html            (owner: A) shell markup (sidebar, main, top bar)
  src/shell.js             (owner: A) nav, routing (#hash), progress, quiz renderer, lab runner, diagram helpers
  src/lessons/<id>.html    (owners: per module) one <template> per file
  src/labs/<id>.json       (owners: per module) runnable code labs
  test/check_labs.js       (owner: A) node script: every lab's solution passes all tests; every starter fails ≥1 test
  test/run.py              (owner: A) Playwright smoke test: every lesson renders, quizzes work, labs run in the page
```

## Lesson file format (STRICT so the shell can load any author's lessons)
`src/lessons/<id>.html` contains exactly one template:
```html
<template id="tpl-<id>" data-title="Caching" data-part="Part 2 · Scaling building blocks" data-order="50">
  <h1>Caching</h1>
  <p class="lede">One-paragraph promise of what you'll be able to do after this lesson.</p>
  <h2>1. ...</h2>
  <p>...</p>
  <pre><code class="lang-js">...</code></pre>            (code samples: JS/TS, SQL, HTTP; escape < > & as entities)
  <div class="callout"><span class="callout-label">Say it in the interview</span><p>...</p></div>
  <div class="callout warn"><span class="callout-label">Common mistake</span><p>...</p></div>
  <figure class="diagram"> inline <svg> ... </svg><figcaption>...</figcaption></figure>
  <div class="trace"> ... step-by-step walkthrough (ol of steps) ... </div>
  <table class="tbl"> ... comparison tables ... </table>
  <div data-quiz='[{"q":"...","o":["a","b","c","d"],"a":1,"why":"..."}]'></div>   (JSON in single-quoted attr: avoid ' in text, use &#39;)
  <div data-lab="lab-id"></div>                                                (renders the lab from src/labs/lab-id.json)
  <h2>Recap</h2> <ul> 4-6 bullets </ul>
</template>
```
- `data-order`: integer that sorts lessons globally (Part 1: 10–49, Part 2: 50–99, Part 3: 100–149, Part 4: 150–220).
- `data-part`: exact part name string from the outline below (the sidebar groups by it).
- SVG diagrams: use `currentColor` and CSS variables (`var(--accent)`, `var(--line)`, `var(--muted)`, `var(--surface)`)
  so they work in light AND dark mode; `viewBox` + `width="100%"`; keep text ≥ 12px; boxes + arrows showing the real flow.
- Each lesson: ~1,500–3,000 words, at least one diagram, at least one worked trace with concrete numbers/values,
  a "Say it in the interview" callout, a "Common mistake" callout, a 4–6 question quiz, and a recap.
  Use ONE running example per lesson (e.g. "a reading app for schools", "a Claude-like chat app", "a ticket booking site").

## Lab file format (JSON)
```json
{
  "id": "lru-cache",
  "title": "Build an LRU cache",
  "minutes": 20,
  "prompt": "<p>HTML: what to build, the exact API, an example.</p>",
  "starter": "class LRUCache {\n  constructor(capacity) {\n    // TODO\n  }\n  get(key) {}\n  set(key, value) {}\n}",
  "solution": "class LRUCache { ... }",
  "tests": [
    { "name": "evicts the least recently used key", "code": "const c = new LRUCache(2); c.set('a',1); c.set('b',2); c.get('a'); c.set('c',3); assertEqual(c.get('b'), undefined); assertEqual(c.get('a'), 1);" }
  ],
  "hints": ["<p>HTML nudge</p>", "<p>more specific</p>", "<p>the key code shape</p>"],
  "explain": "<p>Shown after passing: how this maps to real systems (Redis, CDNs...) and what to say in an interview.</p>"
}
```
Runner semantics (A implements, everyone relies on it):
- Labs are **plain JavaScript** (no TypeScript, no imports). The user's code and each test run in the browser as
  `new Function('assert','assertEqual','sleep', userCode + '\n;return (async () => {\n' + test.code + '\n})();')`.
  So top-level `function`/`class`/`const` in the user's code are visible to tests. Tests may `await`.
- Helpers: `assert(cond, msg)`, `assertEqual(actual, expected, msg)` (deep equality, prints both on failure),
  `sleep(ms)`.
- **Deterministic**: anything time-based takes an injected clock (`now` parameter or a `clock` object), never real time.
  Anything random takes an injected function. Each test runs with a 2-second timeout.
- 4–8 tests per lab covering normal cases and edge cases. The starter must fail at least one test.
- Labs are "build the mechanism" exercises that make distributed-systems ideas concrete: rate limiters,
  caches, retries with backoff, idempotency keys, a queue with acks/redelivery, consistent hashing, a circuit breaker,
  an outbox relay, vector clocks... **not** algorithm puzzles.

## Outline (owner in brackets)
**Part 1 · Foundations** [A]
- 10 `web` How a request travels: DNS, TCP/TLS (intuition only), HTTP methods/status codes/headers, what a server does
  with a request, cookies. Trace one request from a browser to a DB and back.
- 20 `api` API design: resources and REST, request/response shapes, pagination (offset vs cursor), filtering, errors,
  versioning, idempotency keys, webhooks vs polling, REST vs GraphQL vs RPC trade-offs. Lab: `cursor-pagination`.
- 30 `sql` Data modeling and SQL: tables, keys, relationships (1–N, N–N), normalization vs denormalization, joins, indexes
  (why a B-tree makes lookups fast, intuition), transactions & isolation (lost update example), N+1 queries, migrations.
  Lab: `query-planner-lite` or similar (e.g. implement an index lookup vs a scan and count rows touched).
- 40 `auth` AuthN vs AuthZ: password hashing, sessions vs JWTs, OAuth/SSO (sign in with Google) flow, roles and
  permissions, multi-tenant data isolation (district → school → class is a great example), common security mistakes
  (IDOR, CSRF, XSS intuition). Lab: `rbac-check`.

**Part 2 · Scaling building blocks** [B]
- 50 `scaling` How systems grow: vertical vs horizontal, stateless app servers, load balancers, the read/write path,
  back-of-envelope estimation (QPS, storage, bandwidth) with worked numbers.
- 60 `caching` Caching: where caches live (browser, CDN, app, DB), cache-aside vs write-through, TTLs, invalidation,
  stampedes, hot keys. Lab: `lru-cache` (with TTL via injected clock).
- 70 `queues` Queues and background jobs: why async, producers/consumers, at-least-once delivery, acks and visibility
  timeouts, retries with exponential backoff + jitter, dead-letter queues, idempotent consumers.
  Labs: `retry-backoff`, `idempotent-consumer`.
- 80 `ratelimit` Rate limiting and backpressure: fixed window, sliding window, token bucket, where to enforce, 429 +
  Retry-After, per-user vs per-tenant (LLM APIs as the example). Lab: `token-bucket`.
- 90 `realtime` Realtime: polling, long polling, SSE, WebSockets, fan-out, presence, streaming LLM tokens with SSE.
- 95 `storage` Storage choices: SQL vs document vs key-value vs wide-column vs search index vs object storage vs vector DB;
  replication and read replicas, replication lag; partitioning/sharding; consistent hashing. Lab: `consistent-hashing`.

**Part 3 · Distributed systems** [C1]
- 100 `distributed` What makes distributed systems hard: partial failure, the network is unreliable, no shared clock;
  CAP and PACELC explained with a concrete partition story; consistency models (strong, read-your-writes, eventual).
- 110 `consensus` Ordering, time and agreement: why clocks drift, logical clocks / vector clocks (intuition), leader election
  and consensus (Raft at intuition level: leader, terms, majority), quorums (R + W > N). Lab: `vector-clock` or `quorum`.
- 120 `reliability` Reliability: timeouts, retries (and retry storms), circuit breakers, bulkheads, graceful degradation,
  SLIs/SLOs/error budgets, observability (logs, metrics, traces) with a debugging story. Lab: `circuit-breaker`.
- 130 `events` Event-driven architecture: events vs commands, pub/sub, the dual-write problem and the transactional outbox,
  sagas for multi-step workflows (booking example), exactly-once is effectively-once via idempotency, event sourcing (intro).
  Lab: `outbox-relay`.
- 140 `ai-backend` Backends for AI products: calling LLM APIs server-side, streaming to the client, prompt caching,
  queues for long jobs/agents, rate limits and cost control per tenant, storing conversations, evals and logging,
  safety layers. Concrete running example: a Claude-powered tutoring feature for schools.

**Part 4 · System design** [C2]
- 150 `sd-framework` The system design interview: the 6 steps (clarify requirements → estimates → API → data model →
  high-level design → deep dives & trade-offs), how to drive the conversation, how to talk trade-offs, a 45-minute
  timeline, what interviewers score, how a product/eng leader should play to strengths.
- 160+ case studies, each a full worked design following the 6 steps, with diagrams, numbers, the trade-offs a strong
  candidate names, follow-up questions the interviewer will ask with good answers, and a "your turn" prompt (a variation
  to design yourself with a reveal-able model answer in <details>):
  - 160 `sd-shortener` URL shortener
  - 165 `sd-feed` News feed / timeline (fan-out on write vs read)
  - 170 `sd-chat` Chat app (Slack/WhatsApp): delivery, ordering, presence, offline
  - 175 `sd-notifications` Notification system (email/push/SMS, preferences, retries, dedupe)
  - 180 `sd-ratelimiter` Distributed rate limiter service
  - 185 `sd-upload` File upload & storage (presigned URLs, chunking, processing pipeline)
  - 190 `sd-autocomplete` Search autocomplete / typeahead
  - 195 `sd-llm-chat` A Claude.ai-style LLM chat product (streaming, conversation storage, rate limits, cost, context)
  - 200 `sd-booking` Ticket/seat booking (double booking, holds, payments, idempotency)
  - 205 `sd-classroom` A K-12 learning platform at district scale (rostering/SSO, multi-tenancy, privacy, assignments,
    reports, back-to-school traffic spikes)
  - 210 `sd-collab` Collaborative document editing (OT vs CRDT at intuition level)
- C2 also writes 220 `sd-cheatsheet`: one-page reference of numbers to know (latency numbers, rough QPS per box,
  storage sizes), building blocks and when to use each, and a trade-off phrasebook.

## Quality bar
- Teach, don't list. Start each concept with a concrete scenario and numbers, then name the idea.
  E.g. "Your reading app has 200,000 students. At 8:05am, 40,000 of them open the app in the same minute..."
- Every trade-off presented as "X gives you A at the cost of B; choose it when C".
- Correctness matters: no hand-wavy or wrong claims about real systems. When unsure of a specific number, give ranges
  and say they're rough.
- No LeetCode. No heavy math. Intuition first.
- Make the writing scannable: short paragraphs, h2 sections numbered, diagrams, traces, tables where comparing.

## Testing (every author)
- Labs: `node /home/claude/backend/test/check_labs.js` must report all labs OK (A writes this first, within its first
  steps, so others can use it; if it doesn't exist yet, write a tiny local equivalent in your scratchpad to verify your
  labs the same way: solution passes all tests, starter fails at least one).
- Lessons: valid HTML (balanced tags), the quiz JSON parses (`JSON.parse` on the attribute value after HTML-unescaping),
  every `data-lab` refers to an existing lab file.
- A additionally runs the full Playwright smoke test (Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`)
  over ALL lessons once the others are done or at the end, and screenshots a few lessons in light and dark mode and
  looks at them.
```
