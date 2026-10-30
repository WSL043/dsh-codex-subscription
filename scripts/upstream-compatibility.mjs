import { appendFile, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compareVersions } from './prepare-compat-release.mjs'

const exact = value => typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value)
const preview = version => /-(?:alpha|beta|dev|nightly|canary)(?:\.|$)/iu.test(version)
const declared = manifest => new Set(String(manifest.peerDependencies?.['@deepseek-ai/dsh-llm'] ?? '').split('||').map(x => x.trim()).filter(exact))

export function selectChannelCandidate(tags, published, compatibility, { requested, dryRun = false } = {}) {
  const entries = ['latest', 'next', 'alpha'].flatMap(channel => exact(tags[channel]) ? [{ channel, version: tags[channel] }] : [])
  if (requested) {
    if (!exact(requested)) throw new Error('Invalid requested DSH version')
    const entry = entries.find(x => x.version === requested)
    if (!entry) throw new Error('Requested DSH version is not on an official npm channel')
    if (!dryRun && declared(published).has(entry.version)) return undefined
    return { ...entry, stable: !preview(entry.version), recheck: dryRun }
  }
  const supported = declared(published)
  const floors = [...supported].filter(v => !preview(v)).sort(compareVersions)
  const candidates = entries.filter(({ version }) => !supported.has(version)
    && (preview(version) ? !(compatibility.previews ?? []).includes(version)
      : floors.length === 0 || compareVersions(version, floors.at(-1)) > 0))
  candidates.sort((a, b) => Number(preview(a.version)) - Number(preview(b.version)) || compareVersions(b.version, a.version))
  const entry = candidates[0]
  return entry && { ...entry, stable: !preview(entry.version), recheck: false }
}

// These files are excluded from the npm package. Runtime, install instructions,
// dependency metadata and unknown paths must still wait for a manual release.
const automationOnly = new Set([
  '.github/workflows/upstream-compatibility.yml', // retired workflow path
  '.github/workflows/compatibility-autopilot.yml',
  'scripts/upstream-compatibility.mjs',
  'tests/upstream-compatibility.test.mjs',
  'tests/release-contract.test.mjs',
])

export function baselineHold(published, current, changedFiles) {
  if (published.version !== current.version) return 'A manually prepared plugin release is not yet on npm'
  if (changedFiles.some(file => !automationOnly.has(file))) return 'Main contains unreleased changes; automatic compatibility publication would include them'
}

export async function registryJson(url, fetcher = fetch, pause = ms => new Promise(done => setTimeout(done, ms))) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(30000) })
      if (!response.ok) {
        const error = new Error(`Registry HTTP ${response.status}`)
        error.retryable = response.status === 429 || response.status >= 500
        throw error
      }
      return await response.json()
    } catch (error) {
      if (error.retryable === false || attempt === 2) throw error
      await pause(1000 * 2 ** attempt)
    }
  }
}

async function github(path, init = {}) {
  if (!/^[\w.-]+\/[\w.-]+$/u.test(process.env.GITHUB_REPOSITORY ?? '')) throw new Error('Invalid repository')
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${path}`, {
    ...init, headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${process.env.GH_TOKEN}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}) }, signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`)
  return response.status === 204 ? undefined : response.json()
}
const marker = version => `<!-- dsh-compatibility:${version} -->`
async function openReports() {
  const issues = []
  for (let page = 1; ; page++) {
    const batch = await github(`issues?state=open&per_page=100&page=${page}`)
    issues.push(...batch.filter(x => !x.pull_request))
    if (batch.length < 100) return issues
  }
}
async function output(values) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT,
    Object.entries(values).map(([key, value]) => `${key}=${String(value).replace(/[\r\n]/gu, ' ')}\n`).join(''))
  console.log(JSON.stringify(values))
}

async function detect() {
  const [tags, published, compatibility, current] = await Promise.all([
    registryJson('https://registry.npmjs.org/-/package/@deepseek-ai%2Fdsh/dist-tags'),
    registryJson('https://registry.npmjs.org/dsh-codex-subscription/latest'),
    readFile('compatibility.json', 'utf8').then(JSON.parse), readFile('package.json', 'utf8').then(JSON.parse),
  ])
  if (published.name !== current.name || !exact(published.version)) throw new Error('Invalid published plugin identity')
  const dryRun = process.env.DRY_RUN === 'true'
  const candidate = selectChannelCandidate(tags, published, compatibility, { requested: process.env.REQUESTED_VERSION, dryRun })
  if (!candidate) return output({ changed: false, blocked: false })
  const manifest = await registryJson(`https://registry.npmjs.org/@deepseek-ai%2Fdsh/${candidate.version}`)
  if (manifest.name !== '@deepseek-ai/dsh' || manifest.version !== candidate.version
    || !manifest.dist?.integrity || !manifest.dist?.tarball?.startsWith('https://registry.npmjs.org/')) {
    throw new Error('Official npm package identity or integrity is missing')
  }
  let hold
  if (!dryRun) {
    if (published.version !== current.version) return output({ changed: false, blocked: false, reason: 'Waiting for prepared manual release' })
    execFileSync('git', ['fetch', '--no-tags', 'origin', `refs/tags/v${published.version}:refs/tags/v${published.version}`], { stdio: 'pipe' })
    const files = execFileSync('git', ['diff', '--name-only', `v${published.version}`, 'HEAD'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    hold = baselineHold(published, current, files)
    if ((await openReports()).some(issue => issue.body?.includes(marker(candidate.version)))) {
      return output({ changed: false, blocked: false, reason: 'An open compatibility report already tracks this version' })
    }
  }
  await output({ changed: !hold, blocked: Boolean(hold), reason: hold ?? '', dsh_version: candidate.version,
    stable: candidate.stable, recheck: candidate.recheck, published_version: published.version })
}

async function report() {
  const version = process.env.DSH_VERSION
  if (!exact(version)) throw new Error('Missing failed DSH version')
  if ((await openReports()).some(issue => issue.body?.includes(marker(version)))) return
  const run = `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  await github('issues', { method: 'POST', body: JSON.stringify({
    title: `DSH ${version} 自动兼容检查需要处理`,
    body: `${marker(version)}\n\n自动兼容流程尚未发布插件。\n\n原因：${process.env.BLOCK_REASON || '候选生成、验收或发布门禁失败，请查看运行日志。'}\n\n[查看完整检查记录](${run})\n\n本条记录打开期间，定时检查不会反复构建该版本。处理后关闭本条记录即可恢复重试；也可以手动启动流程进行验证。`,
  }) })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv[2]
  if (mode === 'detect') await detect()
  else if (mode === 'report') await report()
  else throw new Error('Expected detect or report')
}
