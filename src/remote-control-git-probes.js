// The phone sends these two fixed scripts even to Windows hosts. Recognize their exact
// contents, then answer with read-only Git calls; never execute the supplied shell or env.
import { createHash } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { runGit } from './remote-control-git.js'

const BRANCHES = '14c4c9e1481287733dd399473326c75c648339069226c3cfecdbabe7d7d87934'
const DIFF = 'ae570abfe66a30a882028df76ef000b1ed543cbf5e4c9d24e49a4d434a58cbe6'
const WRAPPER = ['/bin/bash', '--noprofile', '--norc', '-p', '-c', 'printf \'\\0\'; exec "$@"', 'codex-workspace-diff', '/bin/bash', '-lc']
const probeDigest = value => typeof value === 'string' ? createHash('sha256').update(value).digest('hex') : ''
const denied = message => Object.assign(new Error(message), { code: 'not-allowed' })
const lines = value => value.trim().split('\n').filter(Boolean)
const encoded = (label, value) => `${label}\0${Buffer.from(value).toString('base64')}\0`

/** Returns undefined for every command other than the two captured phone probes. */
export function phoneGitProbe(command) {
  if (!Array.isArray(command)) return undefined
  if (command.length === 3 && command[0] === '/bin/sh' && command[1] === '-lc' && probeDigest(command[2]) === BRANCHES) return { kind: 'branches' }
  if (command.length !== 18 || !WRAPPER.every((part, index) => command[index] === part) || probeDigest(command[9]) !== DIFF || command[10] !== 'codex-workspace-diff') return undefined
  const [ref, source, required, remote, contents, perFile, total] = command.slice(11)
  if (typeof ref !== 'string' || ref.length > 1024 || ref.startsWith('-') || /[\0\r\n]/u.test(ref) || !['branch', 'staged', 'unstaged'].includes(source)) return undefined
  if (![required, remote, contents].every(value => value === 'true' || value === 'false') || ![perFile, total].every(value => typeof value === 'string' && /^\d{1,7}$/u.test(value))) return undefined
  return { kind: 'diff', ref, source, required: required === 'true', contents: contents === 'true', perFile: Number(perFile), total: Number(total) }
}

export async function runPhoneGitProbe(params, { folders, notify, signal } = {}) {
  const probe = phoneGitProbe(params?.command)
  if (!probe) throw denied('unknown phone git probe')
  if (params.tty || params.streamStdin || (params.streamStdoutStderr && (typeof params.processId !== 'string' || !params.processId))) throw denied('unsupported phone git stream')
  const deadline = Date.now() + Math.min(params.timeoutMs > 0 ? params.timeoutMs : 15_000, 30_000)
  const cap = Math.min(Number.isInteger(params.outputBytesCap) && params.outputBytesCap > 0 ? params.outputBytesCap : 1024 * 1024, 4 * 1024 * 1024)
  const git = async (...args) => {
    signal?.throwIfAborted()
    if (Date.now() >= deadline) throw new Error('phone git query timed out')
    return runGit({ command: ['git', ...args], cwd: params.cwd, timeoutMs: deadline - Date.now(), outputBytesCap: cap }, { folders })
  }
  const read = async (...args) => { const result = await git(...args); if (result.exitCode !== 0) throw new Error(result.stderr || 'git query failed'); return result.stdout }
  const exists = async ref => (await git('rev-parse', '--verify', '--quiet', ref)).exitCode === 0
  const localDefault = async () => {
    if (await exists('refs/heads/main')) return 'main'
    if (await exists('refs/heads/master')) return 'master'
    return ''
  }
  let stdout
  if (probe.kind === 'branches') {
    const current = (await read('branch', '--show-current')).trim()
    const remote = await git('symbolic-ref', '--short', 'refs/remotes/origin/HEAD')
    const ref = remote.exitCode === 0 ? remote.stdout.trim() : await localDefault()
    const preferred = ref.replace(/^origin\//u, '')
    const first = preferred && await exists(`refs/heads/${preferred}`) ? preferred : await localDefault()
    const recent = lines(await read('for-each-ref', '--sort=-committerdate', '--format=%(refname:short)', 'refs/heads'))
    const label = name => {
      const value = params.env?.[`CODEX_DRAFT_OUTPUT_${name}`]
      if (typeof value !== 'string' || value.length > 100 || /[\0\r\n\t]/u.test(value)) throw denied('invalid branch output label')
      return value
    }
    stdout = `${label('CURRENT')}\t${current}\n${label('DEFAULT')}\t${ref}\n` + [first, ...recent.filter(branch => branch !== first)].filter(Boolean).slice(0, 8).map(branch => `${label('BRANCH')}\t${branch}\n`).join('')
  } else {
    const root = await git('rev-parse', '--show-toplevel')
    if (root.exitCode !== 0) stdout = '\0notGitRepository\0'
    else {
      const cwd = root.stdout.trim()
      // All diff paths are relative to the repository root, just as in the phone script.
      params = { ...params, cwd }
      // The root may be above an allowed conversation subfolder. Validate before reading it.
      await git('rev-parse', '--show-toplevel')
      let base = [], comparison = '', failure = ''
      stdout = `\0git\0${cwd}\0`
      if (probe.source === 'branch') {
        if (await exists('HEAD')) {
          const remotes = lines(await read('remote')).sort((a, b) => Number(b === 'origin') - Number(a === 'origin'))
          if (probe.required) comparison = probe.ref && await exists(`${probe.ref}^{commit}`) ? probe.ref : ''
          else {
            for (const remote of remotes) {
              const symbolic = await git('symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`)
              const candidates = [symbolic.exitCode === 0 ? symbolic.stdout.trim() : '', probe.ref.startsWith(`${remote}/`) ? probe.ref : '', `${remote}/main`, `${remote}/master`]
              for (const ref of candidates.filter(Boolean)) if (await exists(`refs/remotes/${ref}`)) { comparison = ref; break }
              if (comparison) break
            }
            if (!comparison && probe.ref && await exists(`${probe.ref}^{commit}`)) comparison = probe.ref
          }
          const merge = comparison ? await git('merge-base', 'HEAD', comparison) : undefined
          if (probe.required && !comparison) failure = 'comparisonBranchUnavailable'
          else if (probe.required && merge?.exitCode !== 0) failure = 'comparisonBranchDoesNotShareHistory'
          base = [merge?.exitCode === 0 ? merge.stdout.trim() : 'HEAD']
        } else base = ['4b825dc642cb6eb9a060e54bf8d69288fbee4904']
        stdout += `currentBranch\0${(await git('symbolic-ref', '--short', 'HEAD')).stdout.trim()}\0` + lines(await read('for-each-ref', '--count=8', '--sort=-committerdate', '--format=%(refname:short)', 'refs/heads')).map(branch => `recentBranch\0${branch}\0`).join('')
        if (comparison) stdout += `comparisonRef\0${comparison}\0`
      } else if (probe.source === 'staged') base = ['--cached']
      if (failure) stdout = '\0' + encoded('commandFailed', failure)
      else {
        const numstat = await read('diff', '--find-renames', '--numstat', '-z', ...base, '--')
        const parts = [{ stats: numstat, base }]
        if (probe.source !== 'staged') {
          for (const file of (await read('ls-files', '--others', '--exclude-standard', '-z')).split('\0').filter(Boolean)) {
            if (!(await lstat(join(cwd, file))).isFile()) continue
            const result = await git('diff', '--no-index', '--numstat', '-z', '--', '/dev/null', file)
            if (result.exitCode > 1) throw new Error(result.stderr || 'git query failed')
            parts.push({ stats: result.stdout.replace(/\t\0\/dev\/null\0/u, '\t'), file })
          }
        }
        stdout += encoded('trackedNumstat', parts.map(part => part.stats).join(''))
        if (probe.contents) {
          let changed = 0
          const selected = parts.map(part => {
            const paths = [], entries = part.stats.split('\0')
            for (let index = 0; index < entries.length; index++) {
              const match = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/u.exec(entries[index])
              if (!match) continue
              const names = match[3] ? [match[3]] : [entries[++index], entries[++index]]
              const count = (Number(match[1]) || 0) + (Number(match[2]) || 0)
              if (count > 0 && count <= probe.perFile) { changed += count; paths.push(...names) }
            }
            return { ...part, paths }
          })
          if (changed <= probe.total) {
            let diff = ''
            for (const part of selected.filter(part => part.paths.length)) {
              const args = ['diff', '--find-renames', '--src-prefix=a/', '--dst-prefix=b/', '--unified=2', ...(part.file ? ['--no-index', '--', '/dev/null', part.file] : [...part.base, '--', ...part.paths])]
              const result = await git(...args)
              if (result.exitCode > (part.file ? 1 : 0)) throw new Error(result.stderr || 'git query failed')
              diff += result.stdout
            }
            if (diff) stdout += encoded('trackedDiff', diff)
          }
        }
      }
    }
  }
  const bytes = Buffer.from(stdout)
  if (bytes.length > cap) throw new Error('phone git output exceeds the requested limit')
  if (params.streamStdoutStderr) {
    await notify('command/exec/outputDelta', { processId: params.processId, stream: 'stdout', deltaBase64: bytes.toString('base64'), capReached: false })
    return { exitCode: 0, stdout: '', stderr: '' }
  }
  return { exitCode: 0, stdout, stderr: '' }
}
