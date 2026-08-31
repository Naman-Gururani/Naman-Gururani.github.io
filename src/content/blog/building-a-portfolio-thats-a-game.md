---
title: "Building a portfolio you can walk around"
description: "Why my portfolio is a pixel-art open world built with Phaser — and what one palette, a day/night cycle, and a Skip button taught me about shipping."
pubDate: 2026-09-01
tags: ["phaser", "typescript", "design"]
---

Most engineer portfolios are a hero section, three project cards, and a contact form. Mine is an island.

[Lineage Isle](/lineage/) is a small pixel-art open world built with [Phaser 3](https://phaser.io/) and TypeScript. You walk a little character around, wander into landmarks, and each one opens a part of my story — a cottage for the About page, a tower for my work experience, a workshop for skills, and a few buildings for projects. There's a day/night cycle, villagers, quests, and collectibles, because once you have a game engine running it is very hard to stop.

This post is about the three decisions that mattered.

## One palette to rule everything

Every sprite and tile on the island is drawn procedurally from a single named palette — one TypeScript object with colours like `grass`, `sandWet`, `roofRed`, and `windowNight`. No image files for the world; the art is code.

That constraint did more for the game's look than any artistic skill I have. When every building, tree, and villager pulls from the same forty-odd colours, the world can't help but feel coherent. It also made iteration absurdly fast: change `waterDeep` once and every wave, shallow, and reflection on the island updates.

If you're an engineer who "can't do design," this is the cheat code: don't pick colours per element. Pick a palette, name the entries by what they mean, and force everything through it. (The blog you're reading inherits the same palette — cream and ink by day, the island's night colours after dark. Try the ☾ button in the corner.)

## The Skip button is the most important feature

A playable portfolio has an obvious failure mode: the person deciding whether to interview you does not have time to play a game.

So the island has a **Map · Skip** menu that opens any section's content directly — no walking, no controls, no lore. Every piece of information in the game is reachable in two clicks as plain readable text. That's also what makes it accessible to people who can't or won't use WASD.

Designing that honestly changed how I think about every system I build: the delightful path and the fast path are both real requirements. The game is the differentiator; the Skip button is the product.

## Scope is the boss fight

The first version had grand plans — mini-games per building, an inventory, dialogue trees. What shipped is smaller: walk, interact, collect, read. It ships, it's fast, and it works on a phone with a joystick overlay.

The pattern I keep relearning: the version that exists beats the version that's impressive. I build data pipelines at work, where the same rule applies with worse consequences — but it took a hobby game to make it feel obvious.

## What's next here

This blog is the island's Library. The next few field notes get more technical: one on **exactly-once event correlation across many Kafka topics with Redis** (the pattern behind a payment-correlation service I've built), and one on **Hinglish semantic search** — making a marketplace understand "*bijli wala chahiye*" — from [Enlacey](https://enlacey.com), the services app I'm building for my hometown.

If any of that is your kind of thing, there's an [RSS feed](/rss.xml). And if you'd rather just poke the island — [it's right here](/lineage/).
