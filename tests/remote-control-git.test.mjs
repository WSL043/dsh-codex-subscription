import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { gitArguments, runGit } from '../src/remote-control-git.js'

test('only read-only git subcommands are run', () => {
  for (const command of [['git', 'status', '--porcelain=v1'], ['git', 'diff', '--numstat', 'HEAD'], ['git', '--no-pager', 'diff', '--', 'a b.txt'], ['git', 'rev-parse', '--show-toplevel'], ['git', 'branch', '--show-current'], ['git', 'remote', '-v'], ['/usr/bin/git', 'log', '-1']]) {
    assert.ok(gitArguments(command).argv, command.join(' '))
  }
  for (const command of [['git', 'push'], ['git', 'checkout', 'x'], ['git', 'branch', 'new'], ['git', 'branch', '-D', 'x'], ['git', 'remote', 'add', 'x', 'y'], ['git', 'diff', '--output=x'], ['git', 'diff', '--ext-diff'], ['git', '-c', 'core.pager=sh', 'status'], ['git', 'show', '--exec=sh'], ['git', 'config', 'user.name', 'x'], ['rm', '-rf', '/'], ['bash', '-c', 'git status'], ['git'], [], 'git status', ['git', 'status\0']]) {
    assert.ok(gitArguments(command).error, JSON.stringify(command))
  }
  const { argv } = gitArguments(['git', 'diff', 'HEAD'])
  assert.ok(argv.includes('core.fsmonitor=false') && argv.includes('--no-ext-diff') && argv.at(-1) === 'HEAD')
})

test('git only runs in a conversation folder and never streams', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rc-git-'))
  try {
    const calls = []
    const run = (file, argv, options, done) => { calls.push([file, argv, options]); done(null, 'out', '') }
    assert.deepEqual(await runGit({ command: ['git', 'status'], cwd: root }, { folders: [root], run }), { exitCode: 0, stdout: 'out', stderr: '' })
    assert.equal(calls[0][2].env.GIT_OPTIONAL_LOCKS, '0')
    await mkdir(join(root, 'sub'))
    assert.equal((await runGit({ command: ['git', 'status'], cwd: join(root, 'sub') }, { folders: [root], run })).exitCode, 0, 'a subfolder of a conversation folder is fine')
    await assert.rejects(() => runGit({ command: ['git', 'status'], cwd: tmpdir() }, { folders: [root], run }), /conversation folder/u)
    await assert.rejects(() => runGit({ command: ['git', 'status'], cwd: '/Documents/made-up' }, { folders: [root], run }), /conversation folder/u)
    await assert.rejects(() => runGit({ command: ['git', 'status'], cwd: root, tty: true }, { folders: [root], run }), /streaming/u)
    await assert.rejects(() => runGit({ command: ['git', 'push'], cwd: root }, { folders: [root], run }), /not available/u)
    assert.equal(calls.length, 2)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('real git reports a change in a throwaway repository', async t => {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }) } catch { t.skip('git is not installed'); return }
  const root = await mkdtemp(join(tmpdir(), 'rc-git-'))
  try {
    const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: root, stdio: 'ignore' })
    git('init', '-q'); await writeFile(join(root, 'a.txt'), 'one\n'); git('add', '.'); git('commit', '-qm', 'one')
    await writeFile(join(root, 'a.txt'), 'two\n')
    const status = await runGit({ command: ['git', 'status', '--porcelain=v1'], cwd: root }, { folders: [root] })
    assert.deepEqual([status.exitCode, status.stdout.trim()], [0, 'M a.txt'])
    const diff = await runGit({ command: ['git', 'diff'], cwd: root }, { folders: [root] })
    assert.match(diff.stdout, /-one\n\+two/u)
  } finally { await rm(root, { recursive: true, force: true }) }
})
