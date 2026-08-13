import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PI_AI_RUNTIME_VERSION,
  createModels,
  getOpenAICodexWebSocketDebugStats,
  openaiCodexProvider,
} from '../src/pi-ai-runtime.js'

test('Codex transport is resolved from the DSH pi-ai adapter at the audited version', () => {
  assert.equal(PI_AI_RUNTIME_VERSION, '0.82.1')
  assert.equal(typeof createModels, 'function')
  assert.equal(typeof openaiCodexProvider, 'function')
  assert.equal(typeof getOpenAICodexWebSocketDebugStats, 'function')
})
