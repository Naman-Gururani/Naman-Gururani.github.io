---
title: "Searching in Hinglish: hybrid keyword and semantic search on Postgres"
description: "How Enlacey turns queries like plamber, nal theek karne wala and बिजली into the right trade, using full-text, trigram and vector search inside one Postgres database."
pubDate: 2026-11-20
tags: ["postgres", "search", "pgvector", "enlacey"]
draft: true
---

<!-- DRAFT for Naman: read, edit into your own words, then rename without the leading "_" and set pubDate to publish. Every claim is from docs/case-study.md in the Enlacey repo. -->

[Enlacey](https://enlacey.com) is a local-services marketplace: post what you need, and verified providers nearby accept it. It has been live on Google Play since October 2026, launching in Haldwani, with iPhone coming soon. It is early and small. Most of the code is written by an AI engineering partner (Claude Code), while I design the system and make the calls.

This post is about the search box.

## Why Hinglish breaks plain full-text search

The hard query in Haldwani is not "plumber". It is `plamber`, `nal theek karne wala`, `बिजली`, `mistri`, `plmuber`. People type Hinglish, in two scripts, often unsure the app will understand them at all.

Plain full-text search matches tokens. None of those queries contains the token "plumber". `plamber` is a misspelling, `nal theek karne wala` ("the one who fixes taps") is a description in Romanised Hindi, `बिजली` ("electricity") is in Devanagari, and `mistri` can mean a plumber or an electrician. A `tsvector` over provider names and bios returns nothing for most of them.

I also did not want a second system to keep in sync. A search cluster is on the project's written list of things to defer, so the rule was to solve this inside Postgres with no separate search infrastructure.

## The Postgres layer

The schema side is hand-written SQL in migrations, because Prisma, the ORM, cannot express generated `tsvector` columns, GIN or HNSW indexes. One idempotent migration enables four extensions: `unaccent`, `pg_trgm`, `vector` and `postgis`.

**Keyword.** Providers and jobs each get a generated `search_doc` column. It uses the `'simple'` configuration, which lowercases and does no language-specific stemming, and weights the name or title (A) above the bio or description (B):

```sql
ALTER TABLE "provider_profiles"
  ADD COLUMN "search_doc" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', public.enlacey_immutable_unaccent(coalesce("display_name", ''))), 'A') ||
    setweight(to_tsvector('simple', public.enlacey_immutable_unaccent(coalesce("bio", ''))), 'B')
  ) STORED;

CREATE INDEX "provider_profiles_search_doc_idx" ON "provider_profiles" USING gin ("search_doc");
```

That needed one piece of Postgres arcana. `unaccent()` ships as `STABLE`, and a generated column requires an `IMMUTABLE` expression. So the migration defines a small wrapper that pins the dictionary explicitly, which also makes it safe whatever the `search_path` is:

```sql
CREATE OR REPLACE FUNCTION public.enlacey_immutable_unaccent(text)
  RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
```

**Trigram.** `pg_trgm` GIN indexes sit on category names and synonym terms. The fuzzy matching lives on the catalog's vocabulary, a few dozen trades and their synonyms, rather than on people's names.

**Synonyms.** A synonyms table maps terms to categories, and its locale enum is `en | hi | hinglish`. Hinglish is a first-class locale in the schema, not a special case in code.

**Semantic.** Providers and jobs have a `vector(1024)` embedding column with an HNSW cosine index (`m = 16`, `ef_construction = 64`).

## The first design, and how a real phone broke it

The original plan was a flat fusion of three retrievers: keyword, trigram and vector, each a ranked CTE, combined by reciprocal rank fusion. Each item scores the sum of `1 / (k + rank)` over the lists it appears in, with `k = 60`:

```ts
for (const hit of hits) {
  scores.set(hit.id, (scores.get(hit.id) ?? 0) + 1 / (k + hit.rank));
}
```

Rank fusion was the right call for combining scores. `ts_rank`, trigram similarity and cosine distance live on different scales, and a weighted sum of them mis-ranks. Ranks are comparable across lists; raw scores are not.

Then someone typed `plamber` on a real device, and the app returned providers in seed insertion order. Every keyword leg was empty. The vector leg, running a local mock embedder, put every provider at a cosine distance of exactly 1.0 and contributed fifty rows of noise at equal weight. That noise was the search result. Separately, a search for `repair` lost to a plumber whose *name* contained the word.

No amount of fusion over people's names can know that `plamber` means a plumber. The catalog can.

## Category first, then fusion

The fix was a stage that runs before fusion: resolve the query to a **category**, in four layers.

1. **Synonym expansion.** Deterministic token matching with no threshold to tune. An exact match scores 3, a contiguous phrase contained either way scores 2, and token overlap must reach 50% to count. Normalisation keeps combining marks, because Devanagari matras are Unicode marks (`\p{M}`), and stripping them destroys the word.

2. **A trigram pass** over category names, their translated names and the synonyms, scored as `GREATEST(word_similarity, similarity)`, leaf categories only. `word_similarity` finds a query inside a longer term; `similarity` catches a whole-word typo. The threshold is **0.45**, and it carries its measurements: `plamber → Plumber` scores 0.4545 and must pass, `repar → AC & Fridge Repair` scores 0.6667, and trades we do not carry, like `doctor` and `painter`, score nothing at all. The query skips the `%` operator on purpose, because its session-wide default of 0.3 would drop exactly the row that matters.

3. **An edit-distance fallback** that runs only when the first two resolve nothing. Trigrams are good at "a letter is wrong" and bad at "two letters are swapped". `plmuber` breaks two trigrams at once and scores 0.3333, so `plumber` worked while `plmuber` returned "No matches". Damerau–Levenshtein distance fixes that class. It counts **code points**, so Devanagari measures correctly. It will not guess below 4 characters for Latin or 5 for other scripts (`नल`, "tap", is two code points), allows one edit up to eight and two from nine, and scores 0.6, "because this is a rescue, not a discovery".

4. **A short-query gate.** Below five code points, a query resolves only on an exact known name or synonym. `mad` used to resolve to Cook or Maid depending on how many providers each had, so a three-letter query's answer changed as the marketplace grew. The short words people really type (`ac`, `fan`, `mad`, `kuk`, `cok`) are seeded as synonyms instead: a claim made deliberately, not a number that happened to clear a threshold.

Only then does fusion run, with the resolved category's providers first. A genuine ambiguity like `mistri` keeps both plumbers and electricians in the results instead of letting one win silently.

The app never shows a score. There is no "92% match", only an order, plus three honest helpers: one conservative "Did you mean …?", a short list of related services drawn only from matched categories that have listable providers, and recommended categories when nothing matched, so a nonsense search never dead-ends.

## The honest part: semantic search is off in production

At launch the search is entirely heuristic. Every threshold above is a hand-tuned constant with a written reason and a regression corpus pinning it. The typo test file calls that corpus "the point of this file": every row is a query somebody actually typed, or a guard against one that must not match.

The only learned signal would be the embedding, and **embeddings are off in production**. `SEARCH_EMBEDDINGS` defaults to `off`. One function decides whether text may leave the server, and a placeholder API key still counts as off:

```ts
const hasKey = Boolean(key) && !isPlaceholder(key ?? '');
return env.SEARCH_EMBEDDINGS === 'on' && hasKey ? 'cohere' : 'local';
```

In `local` mode the semantic leg is skipped entirely, which is the lesson from the `plamber` noise. Production refuses to boot with a key but no switch, or a switch but no key, so no job text or provider bio reaches a third party by accident. The vector column, HNSW indexes, embedding queue and backfill sweep are built and dormant. The seam exists; the switch is off.

## What I would change at scale

Some decisions are sized for today's catalog, and the code says so.

- **The trigram pass scans everything.** That is fine for a few dozen rows. The GIN indexes are there for when it is not, and at that point the query needs a prefilter with an explicit threshold rather than the session default.
- **The typo fallback runs in memory** over about eighty terms. A bigger vocabulary would push it into the database, and the length floors would need re-measuring, because a larger catalog is less distinctive.
- **Code points are a rough measure for Hindi.** Whether graphemes or syllables are the right unit is deliberately left open rather than settled by a typo fix.
- **Turning embeddings on** means rebuilding the HNSW indexes on full tables with more `maintenance_work_mem`, and deciding, in writing, that query text may leave the server.

Until then, the catalog does the understanding, and Postgres does the rest.
