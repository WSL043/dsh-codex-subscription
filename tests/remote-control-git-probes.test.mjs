import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, mkdtemp, writeFile, rm, mkdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { phoneGitProbe, runPhoneGitProbe } from '../src/remote-control-git-probes.js'

// Unmodified script/argv captured from the iPhone, with private request metadata removed.
const branches = JSON.parse(await readFile(new URL('./fixtures/phone-git/branches.json', import.meta.url)))
const diff = JSON.parse(await readFile(new URL('./fixtures/phone-git/diff.json', import.meta.url)))
const request = (source = 'unstaged', contents = 'true', ref = '', required = 'false') => ({ command: [...diff.command.slice(0, 11), ref, source, required, 'false', contents, '1500', '9000'] })
const fields = result => result.stdout.split('\0')
const decode = (result, label) => { const parts = fields(result), index = parts.indexOf(label); return index < 0 ? '' : Buffer.from(parts[index + 1], 'base64').toString() }

test('only the captured phone scripts and validated arguments are recognized', () => {
  assert.equal(phoneGitProbe(branches.command).kind, 'branches')
  assert.equal(phoneGitProbe(diff.command).kind, 'diff')
  for (const command of [
    [...branches.command.slice(0, 2), branches.command[2] + '\ncalc'],
    diff.command.map((part, index) => index === 9 ? part.replace('git diff', 'git push') : part),
    diff.command.map((part, index) => index === 5 ? 'exec "$@"' : part),
    request('unstaged', 'true', '--output=oops').command,
    request('unknown').command,
    request('staged', 'yes').command,
    undefined, ['bash', '-c', 'git status'],
  ]) assert.equal(phoneGitProbe(command), undefined)
})

test('captured probes report branches and all diff views without changing the repository', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rc-phone-git-'))
  const git = (...args) => execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', ...args], { cwd: root, encoding: 'utf8', windowsHide: true })
  const run = params => runPhoneGitProbe({ ...params, cwd: root }, { folders: [root] })
  try {
    git('init', '-q', '-b', 'main')
    await writeFile(join(root, 'tracked.txt'), 'base\n'); git('add', '.'); git('commit', '-qm', 'base')
    git('checkout', '-qb', 'feature')
    await writeFile(join(root, 'committed.txt'), 'committed\n'); git('add', '.'); git('commit', '-qm', 'feature')
    await writeFile(join(root, 'staged.txt'), 'staged\n'); git('add', '.')
    await writeFile(join(root, 'tracked.txt'), 'working\n')
    await writeFile(join(root, '新 file.txt'), 'new\n')
    const before = git('status', '--porcelain=v1', '-z')
    const index = await readFile(join(root, '.git', 'index'))
    const branch = await run(branches)
    assert.match(branch.stdout, /^CURRENT\tfeature\nDEFAULT\tmain\nBRANCH\tmain\nBRANCH\tfeature\n$/u)
    const unstaged = await run(request())
    assert.match(decode(unstaged, 'trackedNumstat'), /1\t1\ttracked.txt\0/u)
    assert.match(decode(unstaged, 'trackedNumstat'), /1\t0\t新 file.txt\0/u)
    assert.match(decode(unstaged, 'trackedDiff'), /-base\n\+working/u)
    assert.match(decode(unstaged, 'trackedDiff'), /\+new/u)
    assert.doesNotMatch(decode(unstaged, 'trackedNumstat'), /staged.txt/u)
    const staged = await run(request('staged'))
    assert.match(decode(staged, 'trackedDiff'), /\+staged/u)
    assert.doesNotMatch(decode(staged, 'trackedDiff'), /working|新 file/u)
    const branchDiff = await run(request('branch', 'true', 'main', 'true'))
    assert.ok(fields(branchDiff).includes('main'))
    assert.match(decode(branchDiff, 'trackedDiff'), /\+committed/u)
    assert.match(decode(branchDiff, 'trackedDiff'), /\+staged/u)
    assert.match(decode(branchDiff, 'trackedDiff'), /\+new/u)
    assert.equal(decode(await run(request('branch', 'true', 'missing', 'true')), 'commandFailed'), 'comparisonBranchUnavailable')
    const streamed = []
    const response = await runPhoneGitProbe({ ...request(), cwd: root, streamStdoutStderr: true, processId: 'ios-probe' }, { folders: [root], notify: async (method, params) => streamed.push([method, params]) })
    assert.deepEqual(response, { exitCode: 0, stdout: '', stderr: '' })
    assert.equal(streamed[0][0], 'command/exec/outputDelta')
    assert.equal(streamed[0][1].processId, 'ios-probe')
    assert.equal(Buffer.from(streamed[0][1].deltaBase64, 'base64').toString(), unstaged.stdout)
    assert.equal(git('status', '--porcelain=v1', '-z'), before)
    assert.deepEqual(await readFile(join(root, '.git', 'index')), index)
    await assert.rejects(() => runPhoneGitProbe({ ...request(), cwd: tmpdir() }, { folders: [root] }), /conversation folder/u)
    await assert.rejects(() => run({ ...request(), tty: true }), /unsupported/u)
    await assert.rejects(() => run({ ...request(), outputBytesCap: 1 }), /limit|failed|buffer/iu)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('an ordinary folder returns the phone notGitRepository marker', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rc-phone-plain-'))
  try {
    assert.equal((await runPhoneGitProbe({ ...request(), cwd: root }, { folders: [root] })).stdout, '\0notGitRepository\0')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('physical and alias conversation paths agree, while junction escapes and parent repositories are denied', async () => {
  const base = await mkdtemp(join(tmpdir(), 'rc-phone-alias-'))
  const root = join(base, 'repository'), alias = join(base, 'alias'), outside = join(base, 'outside')
  try {
    await mkdir(root); await mkdir(outside); await mkdir(join(root, 'sub'))
    await symlink(root, alias, process.platform === 'win32' ? 'junction' : 'dir')
    await symlink(outside, join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root, windowsHide: true })
    await writeFile(join(root, 'new.txt'), 'new\n')
    for (const [cwd, allowed] of [[alias, alias], [root, alias], [alias, root]]) {
      const result = await runPhoneGitProbe({ ...request(), cwd }, { folders: [allowed] })
      assert.match(decode(result, 'trackedDiff'), /\+new/u)
    }
    for (const cwd of [outside, join(root, 'escape')]) {
      await assert.rejects(runPhoneGitProbe({ ...request(), cwd }, { folders: [root] }), /conversation folder/u)
    }
    await assert.rejects(runPhoneGitProbe({ ...request(), cwd: join(root, 'sub') }, { folders: [join(root, 'sub')] }), /conversation folder/u)
    await assert.rejects(runPhoneGitProbe({ ...request(), cwd: root }, { folders: [join(base, 'missing')] }), /conversation folder/u)
  } finally { await rm(base, { recursive: true, force: true }) }
})
