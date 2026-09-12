/** Read-only capability probe. No credentials, network calls, or dependency edits.
 * node scripts/audit-compaction-runtime.mjs [path/to/pi-ai/package]
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.dirname(fileURLToPath(import.meta.resolve('@earendil-works/pi-ai')))
const packageRoot = process.argv[2] ? root : path.resolve(root, '..')
const { version } = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
const { processResponsesStream } = await import(pathToFileURL(path.join(packageRoot, 'dist/api/openai-responses-shared.js')))
const checkpoint = { type: 'compaction', id: 'cmp_fixture', encrypted_content: 'synthetic-checkpoint-not-a-secret' }
const message = { type: 'message', id: 'msg_fixture', role: 'assistant', content: [{ type: 'output_text', text: 'AFTER_CHECKPOINT' }] }
const events = [
  { type: 'response.created', response: { id: 'resp_fixture' } },
  ...[checkpoint, message].flatMap((item, output_index) => [
    { type: 'response.output_item.added', output_index, item },
    { type: 'response.output_item.done', output_index, item },
  ]),
  { type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', output: [checkpoint, message] } },
]
const output = {
  role: 'assistant', content: [], stopReason: 'stop',
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
}
const emitted = []
await processResponsesStream((async function* () { yield* events })(), output, { push: event => emitted.push(event.type) }, {
  id: 'gpt-5.6-luna', provider: 'openai-codex', cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
})
const preserved = JSON.stringify(output).includes(checkpoint.encrypted_content)
const textPreserved = output.content.some(block => block.type === 'text' && block.text === 'AFTER_CHECKPOINT')
if (!textPreserved) throw new Error('Control text did not survive; this probe cannot assess compaction support')
console.log(JSON.stringify({ version, controlTextPreserved: textPreserved, compactionPreserved: preserved, contentTypes: output.content.map(block => block.type), emitted }, null, 2))
