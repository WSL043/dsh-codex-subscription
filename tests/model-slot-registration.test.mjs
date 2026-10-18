import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('the model picker does not re-declare the label slot that DSH\'s own picker declares (DSH refuses the registration and the picker, with its speed choice, disappears)', async () => {
  const source = await readFile(new URL('../src/client.jsx', import.meta.url), 'utf8')
  const start = source.indexOf("scope.slots.inject('conversation.input.model'")
  assert.ok(start > 0)
  const registration = source.slice(start, source.indexOf('CodexModelSelect))', start))
  assert.doesNotMatch(registration, /children:\s*\{\s*'conversation\.input\.model\.label'/u)
})
