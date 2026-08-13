import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const text = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('release is a prebuilt, documented, removable DSH bundle', () => {
  const pkg = JSON.parse(text('package.json'))
  const included = new Set(pkg.files)
  for (const path of [
    'lib/*.js',
    'cordis.patch.yml',
    'README.md',
    'README.zh-CN.md',
    'LICENSE',
    'SECURITY.md',
    'THIRD_PARTY_NOTICES.md',
    'docs/*.md',
  ]) assert.equal(included.has(path), true, `package files must include ${path}`)
  assert.equal('prepare' in pkg.scripts, false, 'GitHub installs use committed build output')
  assert.equal(pkg.dependencies?.['@earendil-works/pi-ai'], undefined)
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-llm-pi-ai'], '0.1.0-rc.6')
  assert.equal(pkg.peerDependencies['@earendil-works/pi-ai'], '0.82.1')
  assert.equal(pkg.packageManager, 'pnpm@11.19.0')
  assert.equal(existsSync(new URL('../lib/index.js', import.meta.url)), true)
  assert.equal(existsSync(new URL('../lib/client.js', import.meta.url)), true)
  assert.equal(existsSync(new URL('../.github/workflows/ci.yml', import.meta.url)), true)
})

test('public docs state the cache boundary and paid-fallback policy', () => {
  const docs = `${text('README.md')}\n${text('README.zh-CN.md')}\n${text('docs/CACHE.md')}`
  assert.match(docs, /prompt_cache_key/u)
  assert.match(docs, /previous_response_id/u)
  assert.match(docs, /store:\s*false/u)
  assert.match(docs, /no paid fallback|不.*付费.*回退/iu)
  assert.match(docs, /not.*98%|不.*98%/iu)
  assert.match(docs, /developer preview|开发者预览/iu)
})
