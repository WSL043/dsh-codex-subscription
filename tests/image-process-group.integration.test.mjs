import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { imageConversationNode } from '../src/image-conversation-node.js'

// Use the locked official fixture by default; optionally inspect another supported installation.
const bundlePath = process.env.DSH_CHAT_BUNDLE
  ? resolve(process.env.DSH_CHAT_BUNDLE)
  : fileURLToPath(new URL('./lib/client.js', import.meta.resolve('@deepseek-ai/dsh-client-ui-chat/package.json')))
const plain = value => JSON.parse(JSON.stringify(value))

function loadChatAlgorithms() {
  const source = readFileSync(bundlePath, 'utf8')
  const marker = 'return module.exports;'
  assert.equal(source.split(marker).length, 2, 'expected one ModuleLoader factory export return')
  // Instrument the loaded string only; leave the installed bundle unchanged.
  const instrumented = source.replace(marker,
    'module.exports.__imageGroupTest = { ChatSnapshotBuilder, processGroupDefinition }; return module.exports;')
  let descriptor
  vm.runInNewContext(instrumented, {
    window: { __ModuleLoader__: { load(value) { descriptor = value } } },
    console, setTimeout, clearTimeout, Intl,
  }, { filename: bundlePath })
  assert.equal(descriptor?.id, '@deepseek-ai/dsh-client-ui-chat')
  const jsx = (type, props) => ({ type, props })
  // Stub render-only modules. The real Builder and Group Definition run unchanged;
  // plugin apply() and React rendering are not invoked by this data test.
  const modules = {
    react: { memo: component => component, forwardRef: component => component },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-dom': {},
    '@deepseek-ai/dsh-client-ui-primitives': {},
    '@deepseek-ai/dsh-client-store': {},
  }
  const exports = descriptor.factory(id => {
    assert.ok(Object.hasOwn(modules, id), `unexpected browser dependency: ${id}`)
    return modules[id]
  })
  return exports.__imageGroupTest
}

function fixture() {
  const end = { type: 'turn/end', seq: 20, time: 20, data: { turn: 1, reason: { kind: 'completed' } } }
  const turn = {
    turn: 1, status: 'closed',
    start: { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } },
    end,
    data: { get: () => undefined },
    steps: [{ step: 2, data: { get: kind => kind === 'assistant-step'
      ? { finalNode: { seq: 12 } } : undefined } }],
  }
  const location = { kind: 'turn', turn }
  const node = (key, kind, anchorSeq, data) => ({
    key, id: key, kind, target: 'chat', anchorSeq, location, visibility: 'visible', data,
  })
  const base = [
    node('control', 'turn-process', 1, {
      turn: 1, controlAnchorSeq: 1, processStartSeq: 2, answerAnchorSeq: 12,
      answerStep: 2, inlineReasoning: false, messageCount: 0, toolCallCount: 2, subagentCount: 0,
    }),
    ...['codex_image_generate', 'bash'].map((name, index) => node(`tool:${index}`, 'tool-call', 8 + index, {
      root: { kind: 'tool-result', callId: `call:${index}`, name, args: {},
        call: { name, argsRaw: '{}' }, content: [], isError: false, subCalls: [] },
    })),
    node('answer', 'assistant-step', 12, {
      turn: 1, step: 2, status: 'done', time: 12, blocks: [{ kind: 'text', text: 'done' }],
    }),
  ]
  const result = { type: 'tool/result', seq: 10, time: 10, data: {
    turn: 1, step: 1, meta: { kind: 'codex-subscription-image' },
    message: { isError: false, source: { callId: 'call:0' }, content: [
      { type: 'text', text: 'Generated an image.' },
      { type: 'image', attachment: { id: `sha256:${'a'.repeat(64)}`, mediaType: 'image/png' } },
    ] },
  } }
  const context = {
    key: 'image-output:1', id: '1', state: undefined, start: undefined,
    matches: [result, end].map(event => ({ event, location, ...imageConversationNode.match(event) })),
  }
  assert.ok(context.matches.every(match => match.role === 'update'), 'retain the update-only projection')
  const image = imageConversationNode.buildViewNode(context)
  assert.ok(image)
  assert.equal(image.anchorSeq, 12.025)
  assert.equal(image.data.blocks[0].content[1].attachment.id, result.data.message.content[1].attachment.id)
  return { base, image, location, timeline: { turnOrder: [1], turns: new Map([[1, turn]]) } }
}

function createHarness(algorithms, nodes, timeline) {
  const builder = new algorithms.ChatSnapshotBuilder()
  const context = { state: algorithms.processGroupDefinition.create() }
  const group = () => {
    context.state = algorithms.processGroupDefinition.update(context, builder.groupInput())
    return algorithms.processGroupDefinition.buildGroups(context)
  }
  const snapshot = builder.replace({ nodes, timeline })
  return { builder, snapshot, group }
}

function assertIndependentImage(snapshot, grouping, image) {
  assert.deepEqual(plain(grouping.entries.filter(entry => entry.key === image.key)), [{ kind: 'node', key: image.key }])
  assert.deepEqual(plain(grouping.groups.snapshots.flatMap(group => group.members.map(member => member.key))), ['tool:0', 'tool:1'])
  assert.ok(grouping.groups.snapshots.every(group => group.data.closed))
  assert.equal(snapshot.nodes.process(image.key), undefined)
  const toolProcess = snapshot.nodes.process('tool:1')
  assert.equal(toolProcess.turnClosed, true)
  assert.equal(toolProcess.hasInterleavedInput, false)
  assert.equal(toolProcess.hasExternalProcess, true)
  assert.equal(toolProcess.compactAnswer, true)
}

test('historical image projection is a root while closed Turn process groups remain tool-only', () => {
  const algorithms = loadChatAlgorithms()
  const { base, image, location, timeline } = fixture()
  const baseline = createHarness(algorithms, base, timeline)
  baseline.group()
  const current = createHarness(algorithms, [...base, image], timeline)
  assertIndependentImage(current.snapshot, current.group(), image)
  assert.deepEqual(plain(current.snapshot.navigation.items()), plain(baseline.snapshot.navigation.items()))
  assert.deepEqual(plain(current.snapshot.nodes.process('tool:1')), plain(baseline.snapshot.nodes.process('tool:1')))

  // The former Turn location puts even a post-answer image into a closed group,
  // whose ChatGroupSeat remains subject to both process disclosures.
  const former = createHarness(algorithms, [...base, { ...image, location }], timeline)
  const oldGrouping = former.group()
  assert.equal(oldGrouping.entries.some(entry => entry.kind === 'node' && entry.key === image.key), false)
  const imageGroup = oldGrouping.groups.snapshots.find(group => group.members.some(member => member.key === image.key))
  assert.ok(imageGroup)
  assert.equal(imageGroup.data.closed, true)
  assert.ok(oldGrouping.entries.some(entry => entry.kind === 'group' && entry.key === imageGroup.key))
  assert.equal(former.snapshot.nodes.process(image.key).turnClosed, true)
})

test('incremental image insertion preserves other tools folding and Turn navigation', () => {
  const algorithms = loadChatAlgorithms()
  const { base, image, timeline } = fixture()
  const current = createHarness(algorithms, base, timeline)
  const groupingBefore = current.group()
  const toolGroupsBefore = plain(groupingBefore.entries.filter(entry => entry.kind === 'group'))
  const navigationBefore = plain(current.snapshot.navigation.items())
  const toolProcessBefore = plain(current.snapshot.nodes.process('tool:1'))
  const snapshot = current.builder.apply({ upserts: [image], timeline })
  const grouping = current.group()
  assert.equal(grouping.groups.kind, 'apply')
  assert.deepEqual(plain(grouping.entries.filter(entry => entry.kind === 'group')), toolGroupsBefore)
  assert.ok(grouping.entries.some(entry => entry.kind === 'node' && entry.key === image.key))
  assert.equal(snapshot.nodes.process(image.key), undefined)
  assert.deepEqual(plain(snapshot.nodes.process('tool:1')), toolProcessBefore)
  assert.deepEqual(plain(snapshot.navigation.items()), navigationBefore)
  assert.ok(grouping.groups.upserts.every(group => group.members.every(member => member.key !== image.key)))
})
