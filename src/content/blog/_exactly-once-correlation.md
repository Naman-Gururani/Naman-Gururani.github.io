---
title: "Exactly-once across 40 topics: correlating payments with Kafka and Redis"
description: "How to assign one consistent surrogate key across dozens of independent payment systems — the state, the failure modes, and where 'exactly-once' is really idempotency."
pubDate: 2026-10-01
tags: ["kafka", "redis", "data-engineering"]
draft: true
---

<!-- OUTLINE — file starts with "_" so it never builds. Rename to publish.
     Fill from Naman's answers to the 10 questions + the public PLE repo ONLY.
     Genericization rules: no real system/team/vendor names, no exact volumes
     (orders of magnitude only), no "at Barclays" attribution of architecture,
     all code from the public payment-correlation-service repo.

1. The problem — why ~40 independent systems need one consistent surrogate key,
   and what breaks without it (Q1)
2. What made it hard — the 2–3 things that actually bit (Q2)
3. The alternatives considered and why Redis-state + exactly-once consumers won (Q3)
4. Anatomy of the design — topics × partitions, correlation state, TTL, output
   topics (diagram; code from PLE repo)
5. The nastiest failure mode, told as a story (Q4)
6. What "exactly-once" really means here — and where it's honestly
   at-least-once + idempotency (Q5)
7. What the 7-day TTL trades away (Q6)
8. What I'd do differently now (Q7) + one number-free performance lesson (Q8)
9. Who should copy this pattern, who shouldn't (Q9)
10. One-sentence close (Q10)
-->
