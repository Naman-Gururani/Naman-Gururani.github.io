import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const base = readFileSync(new URL('../src/layouts/Base.astro', import.meta.url), 'utf8')
const post = readFileSync(new URL('../src/pages/blog/[...id].astro', import.meta.url), 'utf8')

test('a post is shared as an article, with its date', () => {
  assert.match(post, /ogType="article"/)
  assert.match(post, /publishedTime=\{post\.data\.pubDate\}/)
  assert.match(base, /property="og:type" content=\{ogType\}/)
  assert.match(base, /property="article:published_time"/)
  assert.match(base, /name="twitter:card"/)
})

test('every post ends with the author and the way to the résumé', () => {
  assert.match(post, /Data and Backend Engineer · payments and streaming/)
  assert.match(post, /href="\/portfolio\/"/)
  assert.match(post, /href="https:\/\/github\.com\/Naman-Gururani"/)
})

test('long posts get contents; posts link to their neighbours', () => {
  assert.match(post, /depth === 2/)
  assert.match(post, />= 3/)
  assert.match(post, /rel="prev"/)
  assert.match(post, /rel="next"/)
})
