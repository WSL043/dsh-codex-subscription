import { execFileSync } from 'node:child_process'
import { planCompatibilityUpdate, planCompatibilityRecheck, rewriteSubagentRuntime } from './prepare-compat-release.mjs'

const exact = value => typeof value === 'string' && /^\d+\.\d+\.\d+$/u.test(value)
const sha = value => typeof value === 'string' && /^[0-9a-f]{40}$/u.test(value)
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

/** Resolve only the immutable published tag. Main is never a release payload. */
export function publishedBaseline(published, run = git) {
  if (published.name !== 'dsh-codex-subscription' || !exact(published.version)) throw Error('Invalid published plugin identity')
  const tag = `v${published.version}`
  run('fetch', '--no-tags', 'origin', `refs/tags/${tag}:refs/tags/${tag}`)
  const commit = run('rev-parse', `${tag}^{commit}`)
  const manifest = JSON.parse(run('show', `${commit}:package.json`))
  if (!sha(commit) || manifest.name !== published.name || manifest.version !== published.version
    || published.gitHead && published.gitHead !== commit) throw Error('Published npm identity does not match its release tag')
  return { tag, sha: commit, version: published.version }
}

const paths = new Set(['package.json', 'compatibility.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
  'README.md', 'README.en.md', 'dsh-codex.ps1', '.github/scripts/accept-official-release.ps1',
  'src/subagent-runtime.js', 'lib/index.js', 'lib/client.js', 'lib/client.js.map',
  'lib/client.image-viewer.js', 'lib/client.image-viewer.js.map', 'lib/client.sketch.js', 'lib/client.sketch.js.map'])

/** Check the commit actually handed to the publisher, independently of main. */
export function verifyCompatibilitySource({ source, baseline, dshVersion, host, recheck = false }, run = git) {
  if (!sha(source) || !baseline || !sha(baseline.sha) || !exact(baseline.version)
    || (!/^\d+\.\d+\.\d+-rc\.\d+$/u.test(dshVersion) && !exact(dshVersion))) throw Error('Invalid compatibility source')
  if (run('rev-list', '--parents', '-n', '1', source) !== `${source} ${baseline.sha}`) throw Error('Compatibility source must be a direct child of the published tag')
  const changed = run('diff', '--name-only', baseline.sha, source).split(/\r?\n/u).filter(Boolean)
  if (!changed.length || changed.some(path => !paths.has(path) && !/^README\.(?:zh-CN|ja|es|fr|de|ru|pt)\.md$/u.test(path))) throw Error('Compatibility source contains changes outside the bounded compatibility patch')
  const manifest = JSON.parse(run('show', `${baseline.sha}:package.json`))
  const compatibility = JSON.parse(run('show', `${baseline.sha}:compatibility.json`))
  const known = [...compatibility.supported, ...(compatibility.previews ?? [])].includes(dshVersion)
  const update = recheck && known
    ? { manifest: { ...manifest, version: planCompatibilityRecheck({ manifest, compatibility }, dshVersion).pluginVersion }, compatibility, recheck: true }
    : planCompatibilityUpdate({ manifest, compatibility, host, documentedVersion: baseline.version }, dshVersion)
  if (!update || JSON.stringify(JSON.parse(run('show', `${source}:package.json`))) !== JSON.stringify(update.manifest)
    || JSON.stringify(JSON.parse(run('show', `${source}:compatibility.json`))) !== JSON.stringify(update.compatibility)) throw Error('Compatibility metadata differs from the generated patch')
  const before = run('show', `${baseline.sha}:src/subagent-runtime.js`)
  const after = run('show', `${source}:src/subagent-runtime.js`)
  if ((update.recheck ? before : rewriteSubagentRuntime(before, update)) !== after) throw Error('Compatibility source contains an unrelated runtime change')
  return { source, baseline: baseline.sha, changed }
}
