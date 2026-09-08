import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { testFiles } from '../../scripts/test-groups.mjs'

const source = fileURLToPath(new URL('../../', import.meta.url))
const runner = resolve(process.argv[2])
const dependencies = join(runner, 'node_modules', '.pnpm', 'node_modules')
if (!existsSync(dependencies)) throw new Error('Official pnpm runtime dependencies are missing')
const probe = mkdtempSync(join(runner, 'subscription-tests-'))
const link = join(probe, 'node_modules')
try {
  for (const name of ['src', 'tests', 'scripts', 'package.json', 'cordis.patch.yml']) {
    cpSync(join(source, name), join(probe, name), { recursive: true })
  }
  symlinkSync(dependencies, link, process.platform === 'win32' ? 'junction' : 'dir')
  const result = spawnSync(process.execPath, ['--test', ...testFiles('behavior')], { cwd: probe, stdio: 'inherit' })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  if (existsSync(link)) unlinkSync(link)
  rmSync(probe, { recursive: true, force: true })
}
