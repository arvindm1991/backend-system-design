# "Watch first" videos: research spec

The course's reader (Arvind, a product/eng leader learning backend, system design and DSA) finds many lessons too dense.
Each lesson will get a **"Watch first"** box at the top with 1–3 YouTube videos that explain its core idea visually,
before he reads. Your job: find and **verify** those videos and write them as JSON.

## What makes a good pick
- **Explains the concept clearly and visually**, for someone new to it. Short beats long: prefer 4–20 minutes. One longer
  deep-dive (up to ~60 min) is OK as the optional third pick.
- **Widely watched, reputable channels** known for clear explanations, e.g. ByteByteGo, Hussein Nasser, Gaurav Sen,
  Fireship, Hello Interview, NeetCode / NeetCodeIO, Martin Kleppmann, Computerphile, freeCodeCamp.org, Arpit Bhayani,
  Jordan has no life, Tech Dummies, Branch Education, CS Dojo, Abdul Bari, WilliamFiset, Back To Back SWE, Reducible,
  Spanning Tree. Avoid small unknown channels, AI-voiceover slop, Shorts (`/shorts/`), and clickbait.
- **Matches the lesson's actual topic** (read the lesson file's headings to see what it covers). For DSA lessons, prefer
  one concept video (the pattern explained) plus one or two walkthroughs of a problem the lesson's labs use (e.g.
  NeetCode's "Two Sum", "Longest Substring Without Repeating Characters", "Number of Islands", "Coin Change").
- Order them: the quickest, most intuitive one first.

## Verification (MANDATORY for every video)
For each candidate, fetch `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<ID>&format=json` with the
WebFetch tool and ask it for the exact `title` and `author_name`. Only include videos whose oembed succeeds AND whose
title/channel match what you intended. Search results often mis-attribute channels; the oembed is the truth. Use the
WebSearch tool (allowed_domains ["youtube.com"]) to find candidates. If you can't find a verified good video for a lesson,
give fewer (even zero) rather than a weak or unverified one.

Already verified (reuse freely where they fit):
AlkDbnbv7dk ByteByteGo "What happens when you type a URL into your browser?" · 4vLxWqE94l4 ByteByteGo "Top 6 Most Popular API
Architecture Styles" · -qNSXK7s7_w Hussein Nasser "Database Indexing Explained (with PostgreSQL)" · fyTxwIa-1U0 ByteByteGo
"Session Vs JWT: The Differences You May Not Know!" · ZV5yTm4pT8g ByteByteGo "OAuth 2 Explained In Simple Terms" ·
xpDnVSmNFX0 Gaurav Sen "System Design BASICS: Horizontal vs. Vertical Scaling" · K0Ta65OqQkY Gaurav Sen "What is LOAD
BALANCING?" · dGAgxozNWFE ByteByteGo "Cache Systems Every Developer Should Know" · G1rOthIU-uo Fireship "Redis in 100 Seconds"
· uvb00oaa3k8 Fireship "Kafka in 100 Seconds" · UNUz1-msbOM ByteByteGo "System Design: Why is Kafka fast?" · 1BfCnjr_Vjg
Fireship "WebSockets in 100 Seconds & Beyond with Socket.io" · 4HlNv1qpZFY Hussein Nasser "Server-Sent Events Crash Course" ·
UF9Iqmg94tk ByteByteGo "Consistent Hashing | Algorithms You Should Know #1" · zaRkONvyGr8 Gaurav Sen "What is CONSISTENT
HASHING and Where is it used?" · UEAMfLPZZhE Martin Kleppmann "Distributed Systems 1.1: Introduction" · BHqjEjzAicA ByteByteGo
"CAP Theorem Simplified" · OKHIdpOAxto Martin Kleppmann "Distributed Systems 3.3: Causality and happens-before" · uNxl3BFcKSA
Martin Kleppmann "Distributed Systems 5.2: Quorums" · uXEYuDwm7e4 Martin Kleppmann "Distributed Systems 6.2: Raft" ·
ADHcBxEXvFA Defog Tech "Circuit Breaker Pattern - Fault Tolerant Microservices" · nH4qjmP2KEE ByteByteGo "Top 7 Most-Used
Distributed System Patterns" · i7twT3x5yv8 ByteByteGo "System Design Interview: A Step-By-Step Guide" · qSJAvd5Mgio NeetCodeIO
"Design a URL Shortener (Bitly) - System Design Interview" · Qj4-GruzyDU Hello Interview "Design FB News Feed System Design
Interview w/ ex: Meta Senior Manager" · vvhC64hQZMk Gaurav Sen "WHATSAPP System Design: Chat Messaging Systems for Interviews" ·
fhdPyoO6aXI Hello Interview "System Design Interview: Design Ticketmaster w/ a Ex-Meta Staff Engineer" · mhUQe4BKZXs Tech
Dummies "Rate Limiting system design | TOKEN BUCKET, Leaky Bucket, Sliding Logs".

## Output
Write a JSON object (valid JSON, written atomically: temp file then rename) to the file named in your task, mapping lesson id
to an array of videos:
```json
{
  "caching": [
    { "id": "dGAgxozNWFE", "title": "Cache Systems Every Developer Should Know", "channel": "ByteByteGo",
      "why": "Where caches live, from the browser to the database, in 5 animated minutes." }
  ]
}
```
- `title` and `channel` exactly as oembed returned them. `why`: one short plain sentence (≤ 120 chars) saying what it will
  make click, written for him ("Shows…", "Explains…"). No hype.
- 1–3 videos per lesson (2 is typical). Report a table of lesson → videos, and list any lesson with no good video.
