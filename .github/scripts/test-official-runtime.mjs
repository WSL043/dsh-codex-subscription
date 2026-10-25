import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { testFiles } from '../../scripts/test-groups.mjs'

const source = fileURLToPath(new URL('../../', import.meta.url))
const runner = resolve(process.argv[2])
if (!process.argv[3]) throw new Error('Explicit locked test dependency directory is required')
const testDependencies = resolve(process.argv[3])
const dependencies = join(runner, 'node_modules', '.pnpm', 'node_modules')
if (!existsSync(dependencies)) throw new Error('Official pnpm runtime dependencies are missing')
// Keep resolution beside pnpm's real hoisted directory. Aliasing that directory
// through a junction can break its relative package links on Windows runners.
const probe = mkdtempSync(join(runner, 'node_modules', '.pnpm', 'subscription-tests-'))
try {
  for (const name of ['src', 'tests', 'scripts', 'package.json', 'cordis.patch.yml']) {
    cpSync(join(source, name), join(probe, name), { recursive: true })
  }
  // Release checkouts intentionally have no node_modules. Only these test-owned
  // packages come from the separately materialized, frozen checkout lockfile.
  // DSH packages still resolve from the official runner's own cohort.
  mkdirSync(join(probe, 'node_modules'), { recursive: true })
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'))
  for (const name of ['fake-indexeddb', 'react']) {
    const dependency = realpathSync(join(testDependencies, 'node_modules', name))
    const expected = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name]
    const installed = JSON.parse(readFileSync(join(dependency, 'package.json'), 'utf8'))
    if (installed.name !== name || installed.version !== expected) throw new Error(`Locked test dependency mismatch: ${name}`)
    // Keep transitive resolution adjacent to the actual pnpm package directory.
    symlinkSync(dependency, join(probe, 'node_modules', name), process.platform === 'win32' ? 'junction' : 'dir')
  }
  const result = spawnSync(process.execPath, ['--test', ...testFiles('behavior')], { cwd: probe, stdio: 'inherit' })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  rmSync(probe, { recursive: true, force: true })
}
