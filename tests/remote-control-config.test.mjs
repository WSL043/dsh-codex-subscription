import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createPhoneConfig } from '../src/remote-control-dsh.js'

test('the phone\'s saved defaults are kept nested, survive a restart and ignore unsafe keys', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rc-config-'))
  try {
    const file = join(dir, 'state', 'config.json')
    const config = createPhoneConfig(file)
    config.write([
      { keyPath: 'model', value: 'openai-codex/gpt-6-sol', mergeStrategy: 'replace' },
      { keyPath: 'model_reasoning_effort', value: 'high', mergeStrategy: 'replace' },
      { keyPath: 'sandbox_workspace_write.network_access', value: false, mergeStrategy: 'replace' },
      { keyPath: '__proto__.polluted', value: true },
    ])
    assert.equal(({}).polluted, undefined)
    const again = createPhoneConfig(file)
    assert.deepEqual(again.read(), { model: 'openai-codex/gpt-6-sol', model_reasoning_effort: 'high', sandbox_workspace_write: { network_access: false } })
    again.write([{ keyPath: 'model_reasoning_effort', value: null }])
    assert.equal(createPhoneConfig(file).read().model_reasoning_effort, undefined)
    assert.deepEqual(createPhoneConfig().read(), {})
  } finally { await rm(dir, { recursive: true, force: true }) }
})
