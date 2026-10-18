import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('the quota readout and the voice button register on the root context, not only on a session scope', async () => {
  const source = await readFile(new URL('../src/client.jsx', import.meta.url), 'utf8')
  assert.match(source, /ctx\.slots\.inject\('conversation\.input\.right'/u)
  assert.doesNotMatch(source, /scope\.slots\.inject\('conversation\.input\.right'/u)
})
