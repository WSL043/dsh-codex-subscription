import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createSubagentCli, SUBAGENT_CLI_ALIAS, SUBAGENT_CLI_SPEC, SUBAGENT_CODEX_VERSION } from '../src/subagent-cli.js'

test('the optional CLI is profile-owned, exact-versioned and installed by native package operations without touching the host CLI', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'subtask-cli-'))
  const manifestPath = join(dir, 'package.json'), packageDir = join(dir, 'node_modules', SUBAGENT_CLI_ALIAS)
  const hostCli = '@openai/codex'
  let version = SUBAGENT_CODEX_VERSION, calls = 0
  try {
    await writeFile(manifestPath, JSON.stringify({ dependencies: { [hostCli]: '0.153.4' } }))
    const profile = { name: 'test', dir, installAnchor: manifestPath, cwd: dir, home: dir, packageManager: { command: process.execPath, args: ['bundled-pnpm.cjs'], env: { OWNER: 'DSH' } } }
    const cli = createSubagentCli({ profile: () => profile, loadOperations: async () => ({ async runPluginCommand(context, args, options) {
      calls++; assert.equal(context.profile, 'test'); assert.equal(context.dir, dir)
      assert.equal(options.command, process.execPath); assert.equal(options.execution, 'service'); assert.equal(options.activateNewBundles, false)
      assert.deepEqual(options.args, ['bundled-pnpm.cjs']); assert.equal(options.env.OWNER, 'DSH')
      const manifest = JSON.parse(await readFile(manifestPath))
      if (args[0] === 'add') {
        assert.deepEqual(args, ['add', '--save-exact', '--ignore-scripts', SUBAGENT_CLI_SPEC])
        manifest.dependencies[SUBAGENT_CLI_ALIAS] = `npm:@openai/codex@${SUBAGENT_CODEX_VERSION}`
        await mkdir(packageDir, { recursive: true })
        await writeFile(join(packageDir, 'package.json'), JSON.stringify({ name: hostCli, version, bin: { codex: 'bin/codex.js' } }))
      } else { assert.deepEqual(args, ['remove', SUBAGENT_CLI_ALIAS]); delete manifest.dependencies[SUBAGENT_CLI_ALIAS] }
      await writeFile(manifestPath, JSON.stringify(manifest))
      return { exitCode: 0 }
    } }) })
    assert.deepEqual(cli.inspect(), { available: true, installed: false, owned: false })
    await cli.change('install', new AbortController().signal)
    assert.equal(cli.inspect().installed, true)
    assert.equal(cli.inspect().wrapper, join(packageDir, 'bin', 'codex.js'))
    assert.equal(JSON.parse(await readFile(manifestPath)).dependencies[hostCli], '0.153.4')
    version = '0.153.4'
    await assert.rejects(cli.change('install', new AbortController().signal), /operation-error/)
    assert.equal(cli.inspect().installed, false, 'an old CLI cannot masquerade as the prepared component')
    await cli.change('remove', new AbortController().signal)
    await cli.change('remove', new AbortController().signal)
    assert.equal(calls, 3, 'removal does not touch an unrelated package')
    assert.equal(JSON.parse(await readFile(manifestPath)).dependencies[hostCli], '0.153.4')
    await assert.rejects(cli.change('arbitrary', new AbortController().signal), /invalid-action/)
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      await writeFile(manifestPath, JSON.stringify({ [field]: { [SUBAGENT_CLI_ALIAS]: 'someone-else@1.0.0' } }))
      assert.equal(cli.inspect().available, false, 'do not overwrite another dependency sharing this name')
      await assert.rejects(cli.change('install', new AbortController().signal), /unavailable/)
    }
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('no profile means no optional installer, and an aborted operation never starts pnpm', async () => {
  const cli = createSubagentCli({ profile: () => undefined, loadOperations: () => assert.fail() })
  assert.equal(cli.inspect().available, false)
  await assert.rejects(cli.change('install', new AbortController().signal), /unavailable/)
  const stopped = new AbortController(); stopped.abort()
  const another = createSubagentCli({ profile: () => ({ dir: tmpdir(), installAnchor: import.meta.filename }), loadOperations: async () => ({ runPluginCommand: () => assert.fail() }) })
  await assert.rejects(another.change('install', stopped.signal), /abort/iu)
})
