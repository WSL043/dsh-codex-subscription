import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { testFiles } from '../../scripts/test-groups.mjs'

const source = fileURLToPath(new URL('../../', import.meta.url))
const runner = resolve(process.argv[2])
const dependencies = join(runner, 'node_modules', '.pnpm', 'node_modules')
if (!existsSync(dependencies)) throw new Error('Official pnpm runtime dependencies are missing')
// Keep resolution beside pnpm's real hoisted directory. Aliasing that directory
// through a junction can break its relative package links on Windows runners.
const probe = mkdtempSync(join(runner, 'node_modules', '.pnpm', 'subscription-tests-'))
try {
  for (const name of ['src', 'tests', 'scripts', 'package.json', 'cordis.patch.yml']) {
    cpSync(join(source, name), join(probe, name), { recursive: true })
  }
  const result = spawnSync(process.execPath, ['--test', ...testFiles('behavior')], { cwd: probe, stdio: 'inherit' })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  rmSync(probe, { recursive: true, force: true })
}
