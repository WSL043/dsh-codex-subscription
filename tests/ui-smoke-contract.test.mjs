import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { registeredSlotNames } from '../scripts/support/slot-catalog.mjs'

const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1')
const fixtures = new URL('./fixtures/', import.meta.url)
const versionOf = file => /^dsh-slots-(.+)\.json$/u.exec(file)?.[1]
const compare = (left, right) => left.localeCompare(right, undefined, { numeric: true })
const snapshots = readdirSync(fixtures).filter(file => versionOf(file) !== undefined).sort((a, b) => compare(versionOf(a), versionOf(b)))
const newest = snapshots.at(-1)
const snapshot = JSON.parse(readFileSync(new URL(newest, fixtures), 'utf8'))
const declared = new Map(snapshot.slots.map(slot => [slot.name, slot]))

test('every slot name this plugin registers is declared by the host catalog', () => {
  const ours = registeredSlotNames(root)
  // The extractor must really see the registrations, or this test would pass on nothing.
  for (const expected of ['settings.section', 'conversation.input.right', 'conversation.input.model', 'conversation.chat.message.images', 'shell.overlay']) {
    assert.ok(ours.includes(expected), `extractor missed ${expected}`)
  }
  const undeclared = ours.filter(name => !declared.has(name))
  assert.deepEqual(undeclared, [], `slot names not declared by DSH ${snapshot.dshVersion} (renamed by the host?): ${undeclared.join(', ')}`)
})
