import test from 'node:test'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import * as api from '@earendil-works/pi-ai/api/openai-codex-responses'
import { recoverySdkContract } from './helpers/recovery-sdk-contract.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
test('real SDK recovers WS after SSE cooldown, preserves continuation and does not replay accepted responses', async () => {
  const modelId = process.env.DSH_TRANSPORT_TEST_MODEL
  if (modelId && modelId !== 'gpt-6.2-sol') throw new Error('Unsupported transport test model')
  const report = await recoverySdkContract(openaiCodexProvider, api, { modelId })
  if (process.env.DSH_TRANSPORT_REPORT_DIR) {
    await mkdir(process.env.DSH_TRANSPORT_REPORT_DIR, { recursive: true })
    await writeFile(join(process.env.DSH_TRANSPORT_REPORT_DIR, 'sdk-recovery.json'), JSON.stringify(report, null, 2))
  }
})
