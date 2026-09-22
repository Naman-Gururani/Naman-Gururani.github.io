import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const base = readFileSync(new URL('../src/layouts/Base.astro', import.meta.url), 'utf8')

test('the old day/night values still resolve', () => {
  assert.match(base, /day'?\s*\)?\s*\?\s*'white'/, 'day must migrate to white')
  assert.match(base, /night'?\s*\)?\s*\?\s*'black'|night'\s*:\s*'black'/, 'night must migrate to black')
})

test('the toggle names the skin, not the time of day', () => {
  assert.match(base, /aria-label="Toggle black\/white skin"/)
})
