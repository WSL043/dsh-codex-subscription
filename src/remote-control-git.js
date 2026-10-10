// Read-only git for the phone's changes view. The phone asks the host to run git commands in a
// conversation's folder; only a short list of read-only subcommands is run, with a fixed prefix
// that turns off every way git could run something from the repository's own configuration.

import { execFile } from 'node:child_process'
import { basename, relative, resolve, sep } from 'node:path'
import { localFolder } from './remote-control-dsh.js'

const DEFAULT_TIMEOUT_MS = 15_000
const MAX_TIMEOUT_MS = 30_000
const DEFAULT_OUTPUT_BYTES = 1024 * 1024
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024

// Subcommands whose every form only reads. `branch`, `remote` and `symbolic-ref` can write, so they are matched exactly below.
const READ_ONLY = new Set(['status', 'diff', 'rev-parse', 'ls-files', 'show', 'log', 'rev-list', 'merge-base', 'diff-tree', 'ls-tree', 'cat-file', 'describe', 'shortlog', 'blame', 'diff-files', 'diff-index', 'for-each-ref', 'count-objects'])
const EXACT = [['branch', '--show-current'], ['remote'], ['remote', '-v'], ['symbolic-ref', 'HEAD'], ['symbolic-ref', '--short', 'HEAD'], ['symbolic-ref', '-q', 'HEAD']]
// Options that write a file, run a program or reach out, whatever the subcommand.
const FORBIDDEN = /^(?:-o$|--output(?:=|$)|--ext-diff|--textconv|--exec|--upload-pack|--receive-pack|--git-dir|--work-tree|--namespace|--super-prefix|--open-files-in-pager|-O|--paginate|-c$|-C$|--config)/u
const TEXTUAL = new Set(['diff', 'show', 'log', 'blame', 'diff-tree', 'diff-files', 'diff-index'])

/** The argv to run for a phone request, or a reason it is refused. */
export function gitArguments(command) {
  if (!Array.isArray(command) || command.length < 2 || command.some(part => typeof part !== 'string' || part.length > 4096 || part.includes('\0'))) return { error: 'not a git command' }
  if (!/^git(?:\.exe)?$/iu.test(basename(command[0]))) return { error: 'only git is available' }
  let rest = command.slice(1)
  if (rest[0] === '--no-pager') rest = rest.slice(1)
  const [subcommand, ...args] = rest
  if (subcommand === undefined) return { error: 'no git subcommand' }
  if (args.some(arg => FORBIDDEN.test(arg))) return { error: `option not allowed with git ${subcommand}` }
  const exact = EXACT.some(form => form.length === rest.length && form.every((part, index) => part === rest[index]))
  if (!READ_ONLY.has(subcommand) && !exact) return { error: `git ${subcommand} is not available` }
  const safe = TEXTUAL.has(subcommand) ? ['--no-ext-diff', '--no-textconv'] : []
  return { argv: ['-c', 'core.fsmonitor=false', '-c', 'core.pager=cat', '-c', 'diff.external=', '--no-pager', subcommand, ...safe, ...args] }
}

const inside = (folder, root) => {
  const path = relative(resolve(root), resolve(folder))
  return path === '' || (!path.startsWith('..') && !path.startsWith(`..${sep}`) && !/^[A-Za-z]:/u.test(path))
}

/**
 * @param {{ command: string[], cwd?: string, timeoutMs?: number, outputBytesCap?: number, tty?: boolean, streamStdin?: boolean, streamStdoutStderr?: boolean }} params
 * @param {{ folders: string[], run?: typeof execFile }} options folders: the conversation folders git may run in
 */
export function runGit(params, { folders, run = execFile }) {
  const parsed = gitArguments(params?.command)
  if (parsed.error) return Promise.reject(Object.assign(new Error(parsed.error), { code: 'not-allowed' }))
  if (params.tty || params.streamStdin || params.streamStdoutStderr) return Promise.reject(Object.assign(new Error('streaming is not available'), { code: 'not-allowed' }))
  const cwd = localFolder(params.cwd)
  if (!cwd || !folders.some(root => inside(cwd, root))) return Promise.reject(Object.assign(new Error('git only runs in a DSH conversation folder'), { code: 'not-allowed' }))
  const timeout = Math.min(Number.isFinite(params.timeoutMs) && params.timeoutMs > 0 ? params.timeoutMs : DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS)
  const cap = Math.min(Number.isInteger(params.outputBytesCap) && params.outputBytesCap > 0 ? params.outputBytesCap : DEFAULT_OUTPUT_BYTES, MAX_OUTPUT_BYTES)
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', GIT_EXTERNAL_DIFF: '', GIT_ASKPASS: '', GCM_INTERACTIVE: 'never' }
  return new Promise(resolvePromise => {
    run('git', parsed.argv, { cwd, env, timeout, maxBuffer: cap, windowsHide: true, encoding: 'utf8' }, (error, stdout, stderr) => {
      const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0
      resolvePromise({ exitCode, stdout: String(stdout ?? '').slice(0, cap), stderr: error && typeof error.code !== 'number' ? String(error.message).slice(0, 500) : String(stderr ?? '').slice(0, cap) })
    })
  })
}
