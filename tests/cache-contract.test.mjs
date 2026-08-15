import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Codex profile keeps prompt caching but avoids credential-unsafe cached WebSockets', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
  assert.match(source, /cacheRetention:\s*['"]short['"]/)
  assert.match(source, /transport:\s*['"]sse['"]/)
  assert.match(source, /prompt_cache_key|pi-ai owns prompt_cache_key/)
  assert.doesNotMatch(source, /providerRetryPolicy\s*\(/, 'inherit DSH/pi-ai retry policy instead of adding a no-op override')
})

test('bundle is additive and never changes the default model or installs paid fallback', async () => {
  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const rows = patch.split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n')
  assert.doesNotMatch(rows, /agent-default-model|fallback|api\.openai\.com/i)
  assert.doesNotMatch(rows, /boundary/)
  assert.deepEqual(
    [...rows.matchAll(/^\s+name:\s+'([^']+)'$/gmu)].map(match => match[1]),
    ['dsh-codex-subscription'],
  )
})
