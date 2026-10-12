# Coding patterns (DSA): addendum to COURSE_SPEC.md

Read `/home/claude/backend/COURSE_SPEC.md` first. Its lesson format, lab format/runner semantics, diagram rules, quiz format,
callouts and quality bar ALL apply. This addendum adds a new part teaching data structures & algorithms the way Arvind asked:

> "Teach me all the ways to approach and attack DSA problems ... there's only like 10–15 patterns to remember, like
> 'if you're looping through values then O(n) approaches' (I don't even know what those are), look for ways to make it
> into a hash map, and how to think about those kinds of things."

So: **recognition and approach first, code second.** He is a product/eng leader, a JS/TS + React developer, not a CS grad.
He has never learned Big-O. He learns from concrete traces with real values, not abstract lists. He is preparing for
full-stack interviews (LeetCode easy/medium) and wants to stop guessing.

## Part
`data-part="Part 5 · Coding patterns (DSA)"`, `data-order` 300–420 (see the table). Lesson ids start with `dsa-`.

| order | id | Lesson | Owner |
|---|---|---|---|
| 300 | `dsa-approach` | **How to attack any problem.** Big-O from zero by counting steps on real inputs (O(1), O(log n), O(n), O(n log n), O(n²), O(2ⁿ)) with a table of "n = 10 / 1,000 / 100,000 → how many steps"; space complexity; **reading the constraints to pick the target speed** (n ≤ 20 → exponential ok; n ≤ 10⁴ → n² ok; n ≤ 10⁵–10⁶ → n log n or n); the 6-step method (restate + examples → brute force out loud → find the bottleneck (the repeated work) → pick the pattern that removes it → code → test with edge cases); the **master trigger table** (problem words → pattern) that the rest of the part teaches; the top speed-up moves: "replace an inner loop with a hash map lookup", "sort first", "precompute", "two pointers instead of nested loops". | D1 |
| 310 | `dsa-hashing` | Hash maps & sets: the #1 pattern. Counting (frequency maps), "have I seen this before?", complement lookup (Two Sum), grouping by a key (anagrams), dedupe. JS `Map`/`Set`/object. | D1 |
| 320 | `dsa-prefix` | Prefix sums & precomputation: range sums, subarray sum equals k (prefix + hash map), running max/min. | D1 |
| 330 | `dsa-two-pointers` | Two pointers: sorted array pair sums, palindromes, removing duplicates in place, merging sorted arrays, container-with-most-water intuition. | D2 |
| 340 | `dsa-sliding-window` | Sliding window: fixed-size windows, variable windows (longest substring without repeats, min window), the expand/shrink loop template. | D2 |
| 350 | `dsa-stack` | Stacks: matching brackets, undo-like processing, monotonic stack (next greater element, daily temperatures). Queues briefly. | D2 |
| 360 | `dsa-binary-search` | Binary search: on a sorted array, the off-by-one-proof template, first/last position, search on the answer ("minimum capacity to ship in D days"). | D2 |
| 370 | `dsa-sorting-intervals` | Sorting as a tool + intervals + greedy: merge intervals, meeting rooms, "sort by end time" greedy, custom comparators, why sort is O(n log n). | D3 |
| 380 | `dsa-linked-lists` | Linked lists: what they are (vs arrays), reverse a list, fast/slow pointers (middle, cycle), dummy head trick, merge two lists. | D3 |
| 390 | `dsa-trees` | Recursion mental model (the "trust the function" leap, base case) + binary trees: DFS (pre/in/post), BFS level order with a queue, max depth, BST search/validate, path sums. | D3 |
| 395 | `dsa-heaps` | Heaps / priority queues and Top-K: what a heap guarantees, k largest, k most frequent, merge k sorted lists (concept), when sorting is fine instead. JS has no built-in heap: give a small MinHeap class he can reuse. | D3 |
| 400 | `dsa-graphs` | Graphs: representing (adjacency list), grids as graphs, DFS/BFS with a visited set, number of islands, shortest path in an unweighted graph (BFS), topological sort (course schedule). | D4 |
| 405 | `dsa-backtracking` | Backtracking: the choose → explore → un-choose template; subsets, permutations, combination sum; pruning. | D4 |
| 410 | `dsa-dp` | Dynamic programming, gently: from recursion → memoization → table; climbing stairs, house robber, coin change, longest common subsequence (concept). How to spot DP ("number of ways", "min/max cost", choices at each step that repeat). | D4 |
| 420 | `dsa-recognition` | **Pattern recognition drill + interview playbook**: 30+ short problem statements; for each, a quiz-style "which pattern?" with the trigger explained (use several data-quiz blocks), then a cheat-sheet table of all patterns with trigger words, template shape, time/space, and a classic example; plus how to talk through a coding interview (clarify, brute force first, state complexity, test). | D4 |

## Each pattern lesson must include
1. **The trigger**: the words/shapes in a problem statement that should make you think of this pattern
   ("contiguous subarray", "longest/shortest substring", "sorted array + pair", "k most", "number of ways"...).
2. **The intuition** from a real-world analogy, then a **step-by-step trace with concrete values** (a `<div class="trace">` or a
   table showing the variables at each step), plus an SVG diagram of the moving parts (pointers, window, stack, tree...).
3. **The template**: the reusable code shape in JS (with a comment that in TypeScript you'd just add types), written clearly
   with `const`/`let`, `for` loops, `Map`/`Set`. Avoid clever one-liners.
4. **2–3 worked problems**, each solved first by brute force (with its Big-O and *why* it's slow: name the repeated work),
   then with the pattern (with its Big-O and what removed the repeated work).
5. **Common mistakes** (off-by-one, forgetting to shrink the window, mutating while iterating, missing base case...).
6. **"Say it in the interview"**: the sentence to say when you recognize the pattern.
7. **Quiz** (4–6 questions; at least half are "which approach fits this problem statement?").
8. **2–3 labs** (classic LeetCode-style problems: easy → medium), each with a prompt that states the problem, input/output
   examples, and constraints. The starter is an empty function or a correct-but-slow brute force with a TODO; tests check
   correctness on normal + edge cases (empty input, single element, duplicates, negatives). **No timing tests** (a slow
   synchronous loop would freeze the page); keep test inputs small. Hints escalate: trigger → idea → code shape. `explain`
   states the final time/space complexity and how to say it.
Lab ids: `dsa-<short-name>` (e.g. `dsa-two-sum`, `dsa-longest-unique-substring`). Each lab's `title` is the problem name.
Labs are plain JavaScript (the runner is JS); use descriptive variable names.

## Files each author owns
Only your lessons (`src/lessons/dsa-*.html` from the table) and your labs (`src/labs/dsa-*.json`). Do not edit shell, build or
other authors' files. Verify with `node /home/claude/backend/test/check_labs.js` (all labs OK), parse every quiz attribute
as JSON, check HTML balance, then run `python3 /home/claude/backend/build.py` and confirm it lists your lessons with no
warnings for your files. Report a table of lessons (order, id, title) and labs (id, tests, starter fails N).
