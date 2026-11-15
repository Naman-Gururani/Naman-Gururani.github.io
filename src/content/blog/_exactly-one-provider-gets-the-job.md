---
title: "Exactly one provider gets the job: first-accept-wins in Postgres"
description: "How Enlacey makes sure that when a job goes out to ten providers at once, exactly one of them ends up with the booking, using four layers in plain Postgres."
pubDate: 2026-11-20
tags: ["postgres", "concurrency", "typescript", "enlacey"]
draft: true
---

<!-- DRAFT for Naman: read, edit into your own words, then rename without the leading "_" and set pubDate to publish. Every claim is from docs/case-study.md in the Enlacey repo. -->

[Enlacey](https://enlacey.com) is the local-services marketplace I am building for my hometown. You post what you need, a cook, a plumber, an electrician, and verified providers nearby accept it. It has been live on Google Play since October 2026, launching in Haldwani, with iPhone coming soon. It is early and small. Most of the code is written by an AI engineering partner (Claude Code); I design the system, make the decisions and click every merge.

This post is about one property of it that has to be right every single time.

## The problem: ten phones, one booking

When a customer posts a job, it goes to the ten nearest providers who can actually take it at once. Each of them sees an offer card with an Accept button. Two of them can press it in the same second. So can eight.

Exactly one of them must end up with the booking. Not zero, which would be a lost job. Not two, which is two people turning up at the same door and one of them not getting paid.

The tempting version is a read and a write: load the offer, check it is still open, mark it accepted, create the booking. Under concurrency each step can interleave with another request doing the same thing, and each obvious fix still leaves a gap:

- **Check the status, then update by id.** Two requests both read "open", both pass the check, both write.
- **Guard the update with the status.** That stops two writes to the *same* offer, but two providers accept two *different* offers on the same job. Each guard passes on its own row.
- **Add a unique constraint.** The database now refuses a second accepted offer, but the winner also has to close every sibling offer while the losers try to accept theirs. Row locks and the unique index wait on each other, and the transactions deadlock.

So there are four layers, because each one alone can still be raced. It all runs at READ COMMITTED, with no advisory lock and no raised isolation level.

## Layer 1: lock the job row first

Every transaction that can touch a job's offers opens with the same statement: fan-out, a targeted offer, accept, decline, quote, cancel, withdrawal.

```ts
async lockJob(db: Prisma.TransactionClient, jobId: string): Promise<void> {
  await db.$executeRaw`SELECT id FROM jobs WHERE id = ${jobId}::uuid FOR UPDATE`;
}
```

That makes accepts on one job queue up on a single row, the job, instead of on the several offer rows they arrived through. The first accept takes the lock and does its work. The others wait. When they get the lock, they read their offer again and see what the winner wrote.

The order matters: find which job the offer belongs to, lock that job, and only then read the offer fresh.

```ts
const stub = await tx.offer.findUnique({ where: { id: offerId }, select: { jobId: true } });
await this.repo.lockJob(tx, stub.jobId);

const offer = await this.repo.getOfferWithJob(tx, offerId);
// The winner superseded us while we waited.
if (offer.status === 'superseded') throw new ConflictException('offer_lost');
```

## Layer 2: a guarded compare-and-swap, never read-then-write

Every status change is an `updateMany` whose `where` repeats the status that was read in this transaction, followed by a zero-count check.

```ts
const updated = await tx.offer.updateMany({
  where: { id: offerId, status: { in: [...decision.acceptableFrom] } },
  data: { status: 'accepted', respondedAt: now },
});
if (updated.count === 0) throw new ConflictException('offer_lost');
```

If the row is no longer in a status we can accept from, nothing is written and the request fails before any domain event, audit row, push or payment call. The loser has nothing to undo.

This pattern was not everywhere at first. A code review in August found that some later booking transitions were doing read, assert, update-by-id. That let two requests save `completed → cancelled`, or let a `complete` overwrite a `disputed` freeze and release the escrow. One change applied the swap accept already used to every one of those transitions.

## Layer 3: a partial unique index

The database itself refuses a second accepted offer on a job:

```sql
-- Hand-added (Prisma can't express these)
CREATE UNIQUE INDEX "offers_one_accepted_per_job"
  ON "offers" ("job_id") WHERE "status" = 'accepted';
```

Prisma is the ORM, but it cannot model a partial unique index, so migrations like this are written by hand. If two accepts ever got past the first two layers, the second would fail here.

The error mapping is deliberately narrow. Only Prisma's `P2002`, a unique violation, counts as "someone got there first":

```ts
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
```

The comment on that function says why: the guarded-swap pattern races two writers on purpose and lets the loser find out this way, so it must never widen to "any error with a code". A wider check would turn a real failure into a polite 409.

## Layer 4: the winner supersedes its siblings

Inside the same transaction that creates the booking, the winner moves every other open offer on the job to `superseded`.

A loser that hit the unique index has its transaction rolled back completely, so it gets marked `superseded` afterwards, in a transaction of its own, with the reason `lost_first_accept_race`.

So a loser finds out in one of three places: the fresh read under the lock, the zero-row swap, or the unique violation. All three return the same `409 offer_lost`.

The background sweeps use the same idea. Offer expiry, job expiry and auto-confirm are each an `UPDATE … RETURNING` with the status repeated in the predicate:

```sql
UPDATE offers SET status = 'expired', updated_at = now()
WHERE status IN ('pending', 'seen') AND expires_at IS NOT NULL AND expires_at <= $1
RETURNING id, job_id AS "jobId", provider_id AS "providerId";
```

The rows a sweep emits events for are exactly the rows it moved. An offer accepted a millisecond earlier no longer matches, so a sweep cannot overwrite a win.

## How it is proven

I do not trust a concurrency design I have only reasoned about. The integration suite runs against real Postgres and Redis, and the race tests fire real HTTP requests in parallel.

The main one creates eight providers, dispatches one job to all of them, and has all eight press Accept at the same time:

```ts
const results = await Promise.all(
  racers.map((racer, i) =>
    request(app.getHttpServer())
      .post(`/offers/${offerIds[i]}/accept`)
      .set('authorization', `Bearer ${racer.bearer}`),
  ),
);
expect(results.filter((r) => r.status === 201)).toHaveLength(1);
expect(results.filter((r) => r.status === 409)).toHaveLength(7);
```

It then checks the database: one booking, one accepted offer, every other offer `superseded`.

Other suites cover the cases around it. One booking-race file holds ten parallel races, each asserting a single winner, including "complete and report in parallel: one wins, and a recorded dispute is never overwritten". Six accept-quote calls race to one booking at the winning quote. Cancel racing accept has exactly one winner, and the loser changes nothing.

There was one gap. The CI drift check could not see partial indexes or CHECK constraints, so a migration that dropped this index would have passed every gate. That is now closed: a test against a migrated database asserts `offers_one_accepted_per_job` by name and definition.

Later, accept's decision logic moved into pure modules, pinned byte-identical: the same integration results before and after, and 105 new unit tests. It was deliberately not folded into one function, because two pure refusals sit between I/O checks that can also refuse, and merging them would have silently reordered them. The order is part of the design.

## What it costs, and when I would not do this

**Discipline.** The lock only works if every transaction that touches a job's offers takes it first. One new code path that forgets is enough to bring back the deadlock. The rule is written next to the lock, and it still depends on people (and agents) reading it.

**Serialisation per job.** All offer work on one job happens one transaction at a time. For a job with ten offers, that is the point. It is also why slow work, such as widening the search after the last decline, runs after the commit and never inside the lock.

**Hand-written migrations.** The index, and every other object Prisma cannot express, lives in SQL I maintain myself, with a test that asserts it is still there.

When would I not do this? If the contended thing were a single hot row with thousands of writers instead of ten, a row lock would turn into a queue and I would look at something else. If I could not use partial indexes, I would lose the backstop that makes the rest safe to reason about. For a marketplace where each job has a handful of providers racing for it, four plain layers in Postgres have been enough, and every layer has a test that would fail if it went missing.
