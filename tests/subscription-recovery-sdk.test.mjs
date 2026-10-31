import test from 'node:test'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import * as api from '@earendil-works/pi-ai/api/openai-codex-responses'
import { recoverySdkContract } from './helpers/recovery-sdk-contract.mjs'
test('real SDK recovers WS after SSE cooldown, preserves continuation and does not replay accepted responses', async () => {
  await recoverySdkContract(openaiCodexProvider, api)
})
