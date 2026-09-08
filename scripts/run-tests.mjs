import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { testFiles } from './test-groups.mjs'

const group = process.argv[2]
if (!['behavior', 'delivery'].includes(group)) throw new Error('Expected test group: behavior or delivery')
const files = testFiles(group)
if (files.length === 0) throw new Error(`No ${group} tests found`)
const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  stdio: 'inherit',
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
