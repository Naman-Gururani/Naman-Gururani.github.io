# naman-gururani.github.io

The hub + blog for **Naman's World** — front page at the root, field notes under `/blog/`, and the playable portfolio living separately at [`/lineage/`](https://naman-gururani.github.io/lineage/). Design language inherited from Lineage Isle: its palette, pixel frames, and day/night cycle (☾ toggle).

## Stack
Astro 7 · content collections (markdown in `src/content/blog/`) · `@astrojs/rss` + sitemap · Fontsource (Press Start 2P, Pixelify Sans, Fredoka, Inter) · deployed to GitHub Pages by `.github/workflows/deploy.yml`.

## Local dev
```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # output in dist/
```

## Writing a post
1. Add `src/content/blog/my-post.md` with front-matter:
   ```yaml
   ---
   title: "Title"
   description: "One sentence for lists, RSS and search."
   pubDate: 2026-10-01
   tags: ["kafka"]
   ---
   ```
2. Files starting with `_` are outlines/drafts and never build (see `_exactly-once-correlation.md`).
3. `npm run build` locally, then push — the Action deploys.

## First-time publish (one-time setup)
1. Create a **public** GitHub repo named exactly `naman-gururani.github.io`.
2. ```bash
   git init && git add -A && git commit -m "feat: hub + blog (Naman's World)"
   git branch -M main
   git remote add origin https://github.com/naman-gururani/naman-gururani.github.io.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Source: GitHub Actions.** The push triggers the deploy; the site appears at https://naman-gururani.github.io/ (the game stays at `/lineage/` — a separate project page, untouched).
