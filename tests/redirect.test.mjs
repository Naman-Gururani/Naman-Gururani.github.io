import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const html = readFileSync(new URL('../public/lineage/index.html', import.meta.url), 'utf8')

/** Every .astro file under src — `fs.globSync` is too new to rely on here. */
function astroFiles(dir = 'src', out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) astroFiles(p, out)
    else if (e.name.endsWith('.astro')) out.push(p)
  }
  return out
}

test('the redirect keeps the query and the hash', () => {
  assert.match(html, /location\.search/)
  assert.match(html, /location\.hash/)
})

test('old /lineage/ links land on the game at /portfolio/play/', () => {
  // /portfolio/ is the résumé now; the game the old links meant is one level down.
  assert.match(html, /location\.replace\('\/portfolio\/play\/' \+ location\.search \+ location\.hash\)/)
  assert.match(html, /http-equiv="refresh" content="0; url=\/portfolio\/play\/"/)
  assert.match(html, /rel="canonical" href="https:\/\/naman-gururani\.github\.io\/portfolio\/play\/"/)
})

test('no page still links to /lineage/', () => {
  for (const f of astroFiles()) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /href="\/lineage\//, `${f} still points at /lineage/`)
  }
})
