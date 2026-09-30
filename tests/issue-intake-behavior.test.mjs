import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const CR = String.fromCharCode(13)
const source = (await readFile(new URL('../.github/workflows/issue-intake.yml', import.meta.url), 'utf8')).split(CR).join('')
const script = source.slice(source.indexOf('script: |') + 'script: |'.length + 1).split('\n').map(line => line.slice(12)).join('\n')
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
const intake = new AsyncFunction('github', 'context', script)

const bugBody = (plugin, dsh) => [
  '### System', '', 'Windows', '', '### DSH setup', '', 'Official DSH installation', '',
  '### Plugin version', '', plugin, '', '### DSH version', '', dsh, '', '### Failing area', '', 'Install or update',
].join('\n')

const peers = (...versions) => ({ '@deepseek-ai/dsh-llm': versions.join(' || ') })
// What npm returns: each release declares the DSH versions it was verified against.
const registry = {
  '2.3.0': { version: '2.3.0', peerDependencies: peers('0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2') },
  '2.2.4': { version: '2.2.4', peerDependencies: peers('0.1.7-rc.1', '0.1.7-rc.2') },
}

async function run({ labels, body, action = 'opened' }) {
  const comments = []
  const added = []
  const github = {
    paginate: async () => [],
    rest: { issues: {
      listComments: {},
      createComment: async ({ body: text }) => { comments.push(text) },
      addLabels: async ({ labels: names }) => { added.push(...names) },
    } },
  }
  const previousFetch = globalThis.fetch
  globalThis.fetch = async url => {
    const tag = String(url).split('/').pop()
    const manifest = tag === 'latest' ? registry['2.3.0'] : registry[tag]
    return manifest ? Response.json(manifest) : new Response('not found', { status: 404 })
  }
  try {
    await intake(github, { repo: { owner: 'o', repo: 'r' }, issue: { number: 1 }, payload: { action, issue: { labels: labels.map(name => ({ name })), body } } })
  } finally {
    globalThis.fetch = previousFetch
  }
  return { comments, added }
}

test('a bug with a complete, current report only gets the acknowledgement', async () => {
  const { comments, added } = await run({ labels: ['bug'], body: bugBody('2.3.0', '0.2.0-rc.2') })
  assert.equal(comments.length, 1)
  assert.match(comments[0], /dsh-maintenance-ack/)
  assert.deepEqual(added, [])
})

test("an older plugin that does not declare the reporter's DSH gets the exact newest version from the registry", async () => {
  const { comments } = await run({ labels: ['bug'], body: bugBody('2.2.4', '0.2.0-rc.2') })
  assert.ok(comments.some(text => text.includes('dsh-version-check:plugin-predates-dsh') && text.includes('dsh-codex-subscription@2.3.0')))
  assert.ok(comments.some(text => text.includes('dsh-version-check:outdated:2.3.0')))
})

test('a DSH version the newest release does not declare is reported as untested, not blamed on the reporter', async () => {
  const { comments } = await run({ labels: ['bug'], body: bugBody('2.3.0', '0.3.0') })
  assert.ok(comments.some(text => text.includes('dsh-version-check:dsh-untested') && text.includes('0.2.0-rc.2')))
  assert.equal(comments.some(text => text.includes('plugin-predates-dsh')), false)
})

test("an older plugin that already declares the reporter's DSH only gets the outdated notice", async () => {
  const { comments } = await run({ labels: ['bug'], body: bugBody('2.2.4', '0.1.7-rc.2') })
  assert.equal(comments.some(text => text.includes('plugin-predates-dsh')), false)
  assert.ok(comments.some(text => text.includes('dsh-version-check:outdated:2.3.0')))
})

test('a bug without a DSH version asks for it and waits for the reporter', async () => {
  const { comments, added } = await run({ labels: ['bug'], body: bugBody('2.3.0', '_No response_') })
  assert.ok(comments.some(text => text.includes('dsh-version-check:dsh-missing')))
  assert.deepEqual(added, ['waiting-for-reporter'])
})

test('a bug without a plugin version asks for it and waits for the reporter', async () => {
  const { comments, added } = await run({ labels: ['bug'], body: bugBody('latest', '0.2.0-rc.2') })
  assert.ok(comments.some(text => text.includes('dsh-version-check:missing')))
  assert.deepEqual(added, ['waiting-for-reporter'])
})

test('a failure filed through the feature form is redirected to the bug form', async () => {
  const body = ['### Use case', '', '昨天发布 0.2.0 了, 插件装不上了', '', '### Expected behavior', '', '提示不兼容'].join('\n')
  const { comments, added } = await run({ labels: ['enhancement'], body })
  assert.ok(comments.some(text => text.includes('dsh-misfiled') && text.includes('template=install-problem.yml')))
  assert.deepEqual(added, ['waiting-for-reporter'])
})

test('a genuine feature request is not redirected', async () => {
  const body = ['### Use case', '', 'Let me pin favourite models to the top of the list', '', '### Expected behavior', '', 'A pin toggle per model'].join('\n')
  const { comments, added } = await run({ labels: ['enhancement'], body })
  assert.equal(comments.length, 1)
  assert.match(comments[0], /dsh-feature-ack/)
  assert.deepEqual(added, [])
})
