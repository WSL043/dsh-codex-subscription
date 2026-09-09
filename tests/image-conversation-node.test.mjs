import test from 'node:test'
import assert from 'node:assert/strict'
import { imageConversationNode as definition } from '../src/image-conversation-node.js'

const result = (error = false) => ({ type: 'tool/result', seq: 10, data: {
  turn: 1, meta: { kind: 'codex-subscription-image' },
  message: { content: [{ type: 'tool-result', isError: error, content: [{ type: 'image', attachment: { id: 'a' } }] }] },
} })
const context = events => ({ key: 'images:1', id: '1', matches: events.map(event => ({ event,
  location: { turn: { steps: [{ data: new Map([['assistant-step', { finalNode: { seq: 12 } }]]) }] } },
})) })
test('completed images project after final answer, outside process fold, without mutating history', () => {
  const events = [result(), { type: 'turn/end', seq: 14, data: { turn: 1 } }]
  const before = structuredClone(events)
  const node = definition.buildViewNode(context(events))
  assert.equal(node.anchorSeq, 12.025)
  assert.equal(node.data.blocks[0].kind, 'tool-result')
  assert.equal(node.data.blocks[0].meta.kind, 'codex-subscription-image')
  assert.deepEqual(events, before)
  assert.deepEqual(definition.buildViewNode(context(events)), node)
})
test('unfinished, failed and unrelated tools do not create image nodes', () => {
  assert.equal(definition.buildViewNode(context([result()])), null)
  assert.equal(definition.match(result(true)), null)
  assert.equal(definition.match({ type: 'tool/result', data: { meta: { kind: 'other' } } }), null)
  assert.equal(definition.buildViewNode(context([{ type: 'turn/end', seq: 14, data: { turn: 1 } }])), null)
})
