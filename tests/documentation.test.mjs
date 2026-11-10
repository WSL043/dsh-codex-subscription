import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { createServer } from 'node:net'
import { freePort } from '../scripts/support/dsh-host.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.split('\0').filter(Boolean)
}
function publicMarkdownFiles() {
  return git('ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*.md')
    .filter(name => !name.includes('/') || name.startsWith('docs/'))
    .map(name => join(root, name)).filter(existsSync)
}
const privateDestination = value => /^(?:\.local|audit-notes|\.artifacts)(?:\/|$)/u.test(value)
  || /(?:^|\/)[^/]*\.local(?:\.[^/]*)?\.md$/u.test(value) || value === 'AGENTS.md'

test('maintained and archived documentation has no dangling local Markdown file links', () => {
  const files = publicMarkdownFiles()
  const missing = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8').replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gmu, '')
    for (const match of text.matchAll(/\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/gu)) {
      const link = match[1] ?? match[2]
      assert.ok(!/^(?:[a-z]:[\\/]|file:)/iu.test(link), `Public document links to a private machine path: ${relative(root, file)}`)
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/iu.test(link)) continue
      const destination = decodeURIComponent(link.split('#')[0])
      const target = relative(root, resolve(dirname(file), destination)).replaceAll('\\', '/')
      assert.ok(!privateDestination(target), `Public document links to local-only evidence: ${relative(root, file)} -> ${link}`)
      if (!destination || existsSync(resolve(dirname(file), destination))) continue
      missing.push(`${relative(root, file)} -> ${link}`)
    }
  }
  assert.deepEqual(missing, [], `Broken local links:\n${missing.join('\n')}`)
})

test('local-only documentation is ignored and absent from the Git index', () => {
  const tracked = git('ls-files', '-z', '--', '.local', 'audit-notes', '*.local.md', '*.local.*.md')
  assert.deepEqual(tracked, [], 'Private development records must not be tracked')
  const samples = ['.local/maintenance/example.md', 'audit-notes/example.md', 'MAINTENANCE.local.ja.md']
  const ignored = spawnSync('git', ['check-ignore', '--no-index', '--stdin', '-z'], {
    cwd: root, encoding: 'utf8', input: samples.join('\0') + '\0',
  })
  assert.ifError(ignored.error)
  assert.equal(ignored.status, 0, ignored.stderr)
  assert.deepEqual(ignored.stdout.split('\0').filter(Boolean).sort(), [...samples].sort())
})

test('the retained CDP port probe releases its listener before returning', async () => {
  const port = await freePort()
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535)
  const server = createServer()
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', resolve)
    })
  } finally {
    if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('retired UI smoke commands stop with migration guidance before touching the supplied home or output', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'dsh-retired-smoke-test-'))
  assert.ok(temporary.startsWith(join(tmpdir(), 'dsh-retired-smoke-test-')))
  try {
    const sentinel = join(temporary, '.credentials.yaml')
    const contents = 'synthetic-sentinel: not-a-real-credential\n'
    writeFileSync(sentinel, contents)
    const before = readdirSync(temporary).sort()
    for (const args of [[], ['--url', 'http://127.0.0.1:1', '--credentials', temporary, '--shots', join(temporary, 'shots'), '--keep'], ['--dsh-version', '0.2.2-rc.1', '--credentials', temporary]]) {
      const result = spawnSync(process.execPath, [join(root, 'scripts', 'ui-smoke.mjs'), ...args], {
        cwd: temporary, env: { ...process.env, DSH_HOME: temporary }, encoding: 'utf8', timeout: 5000,
      })
      assert.ifError(result.error)
      assert.equal(result.status, 2)
      assert.match(result.stderr, /RETIRED/u)
      assert.match(result.stderr, /docs\/ui-smoke\.md/u)
      assert.equal(readFileSync(sentinel, 'utf8'), contents)
      assert.deepEqual(readdirSync(temporary).sort(), before)
    }
  } finally {
    // Only remove the unique directory created by this test, never a caller's home.
    assert.equal(dirname(temporary), resolve(tmpdir()))
    assert.ok(!relative(tmpdir(), temporary).includes(sep))
    rmSync(temporary, { recursive: true, force: true })
  }
})
