import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/
const RELEASE_AGE_START = '# dsh-compat-release-age-start'
const RELEASE_AGE_END = '# dsh-compat-release-age-end'

function parseVersion(version) {
  const match = VERSION_RE.exec(version)
  if (match === null) throw new Error(`invalid semantic version: ${version}`)
  return {
    core: match.slice(1, 4).map(Number),
    prerelease: match[4]?.split('.').map(value => /^\d+$/.test(value) ? Number(value) : value) ?? [],
  }
}

export function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index]
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length === 0 ? 1 : -1
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const av = a.prerelease[index]
    const bv = b.prerelease[index]
    if (av === undefined || bv === undefined) return av === bv ? 0 : av === undefined ? -1 : 1
    if (av === bv) continue
    if (typeof av === 'number' && typeof bv === 'number') return av - bv
    if (typeof av === 'number') return -1
    if (typeof bv === 'number') return 1
    return av.localeCompare(bv)
  }
  return 0
}

export function selectNextUntestedVersion(versions, current) {
  parseVersion(current)
  return [...new Set(versions)]
    .filter(version => typeof version === 'string' && compareVersions(version, current) > 0)
    .sort(compareVersions)[0] ?? null
}

function bumpPatch(version) {
  const parsed = parseVersion(version)
  if (parsed.prerelease.length > 0) throw new Error(`automatic compatibility releases require a stable plugin version: ${version}`)
  return `${parsed.core[0]}.${parsed.core[1]}.${parsed.core[2] + 1}`
}

export function planCompatibilityUpdate(state, candidate) {
  parseVersion(candidate)
  const previousDshVersion = state.compatibility.latestTested
  const order = compareVersions(candidate, previousDshVersion)
  if (order === 0) return null
  if (order < 0) throw new Error(`DSH candidate ${candidate} is older than latest tested ${previousDshVersion}`)

  const compatibility = structuredClone(state.compatibility)
  compatibility.latestTested = candidate
  compatibility.supported = [...new Set([...compatibility.supported, candidate])].sort(compareVersions)

  const manifest = structuredClone(state.manifest)
  const previousPluginVersion = manifest.version
  manifest.version = bumpPatch(previousPluginVersion)
  for (const name of Object.keys(manifest.devDependencies ?? {})) {
    if (name.startsWith('@deepseek-ai/dsh-')) manifest.devDependencies[name] = candidate
  }
  const supportedRange = compatibility.supported.join(' || ')
  for (const name of Object.keys(manifest.peerDependencies ?? {})) {
    if (name.startsWith('@deepseek-ai/dsh-')) manifest.peerDependencies[name] = supportedRange
  }

  return {
    previousDshVersion,
    dshVersion: candidate,
    previousPluginVersion,
    pluginVersion: manifest.version,
    compatibility,
    manifest,
  }
}

export function rewriteBoundedVersions(source, update, label) {
  let rewritten = source
    .replaceAll(update.previousPluginVersion, update.pluginVersion)
    .replaceAll(update.previousDshVersion, update.dshVersion)
  if (rewritten === source) throw new Error(`no bounded version reference changed in ${label}`)
  if (rewritten.includes(update.previousPluginVersion)) throw new Error(`stale plugin version remains in ${label}`)
  return rewritten
}

export function extractDeepSeekReleaseAgeSelectors(lockfile) {
  const packagesStart = lockfile.indexOf('\npackages:\n')
  const snapshotsStart = lockfile.indexOf('\nsnapshots:\n')
  if (packagesStart === -1 || snapshotsStart === -1 || snapshotsStart <= packagesStart) {
    throw new Error('pnpm lockfile does not contain packages and snapshots sections')
  }
  const packages = lockfile.slice(packagesStart, snapshotsStart)
  const selectors = [...packages.matchAll(/^  '(@deepseek-ai\/[^']+@[^']+)':$/gmu)].map(match => match[1])
  if (selectors.length === 0) throw new Error('pnpm lockfile contains no @deepseek-ai package selectors')
  return [...new Set(selectors)].sort()
}

export function rewriteReleaseAgeCohort(workspace, selectors) {
  const start = workspace.indexOf(RELEASE_AGE_START)
  const end = workspace.indexOf(RELEASE_AGE_END)
  if (start === -1 || end === -1 || end <= start) throw new Error('missing bounded DSH release-age markers')
  const block = [
    RELEASE_AGE_START,
    'minimumReleaseAgeExclude:',
    ...selectors.map(selector => `  - '${selector}'`),
    RELEASE_AGE_END,
  ].join('\n')
  return `${workspace.slice(0, start)}${block}${workspace.slice(end + RELEASE_AGE_END.length)}`
}

async function prepare(root, candidate) {
  const compatibilityPath = resolve(root, 'compatibility.json')
  const manifestPath = resolve(root, 'package.json')
  const [compatibility, manifest] = await Promise.all([
    readFile(compatibilityPath, 'utf8').then(JSON.parse),
    readFile(manifestPath, 'utf8').then(JSON.parse),
  ])
  const update = planCompatibilityUpdate({ compatibility, manifest }, candidate)
  if (update === null) return { changed: false, dshVersion: candidate, pluginVersion: manifest.version }

  const boundedPaths = [
    'README.md',
    'README.en.md',
    'AGENTS.md',
    'dsh-codex.ps1',
    'dsh-codex-setup.ps1',
    '.github/scripts/accept-official-release.ps1',
    '.github/workflows/publish.yml',
  ]
  const sources = await Promise.all(boundedPaths.map(path => readFile(resolve(root, path), 'utf8')))
  const rewritten = sources.map((source, index) => rewriteBoundedVersions(source, update, boundedPaths[index]))

  const workspacePath = resolve(root, 'pnpm-workspace.yaml')
  const workspace = await readFile(workspacePath, 'utf8')
  const nextWorkspace = workspace
    .replaceAll(update.previousDshVersion, update.dshVersion)
  if (nextWorkspace === workspace) throw new Error(`DSH release cohort ${update.previousDshVersion} was not found`)

  await Promise.all([
    writeFile(compatibilityPath, `${JSON.stringify(update.compatibility, null, 2)}\n`),
    writeFile(manifestPath, `${JSON.stringify(update.manifest, null, 2)}\n`),
    writeFile(workspacePath, nextWorkspace),
    ...boundedPaths.map((path, index) => writeFile(resolve(root, path), rewritten[index])),
  ])
  return { changed: true, ...update }
}

async function refreshReleaseAge(root) {
  const [workspace, lockfile, compatibility] = await Promise.all([
    readFile(resolve(root, 'pnpm-workspace.yaml'), 'utf8'),
    readFile(resolve(root, 'pnpm-lock.yaml'), 'utf8'),
    readFile(resolve(root, 'compatibility.json'), 'utf8').then(JSON.parse),
  ])
  const selectors = [...new Set([
    ...extractDeepSeekReleaseAgeSelectors(lockfile),
    `@deepseek-ai/dsh@${compatibility.latestTested}`,
  ])].sort()
  await writeFile(resolve(root, 'pnpm-workspace.yaml'), rewriteReleaseAgeCohort(workspace, selectors))
  return { changed: true, selectors: selectors.length }
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  if (process.argv.includes('--refresh-release-age')) return refreshReleaseAge(root)
  const versionIndex = process.argv.indexOf('--dsh-version')
  const candidate = versionIndex === -1 ? undefined : process.argv[versionIndex + 1]
  if (candidate === undefined) throw new Error('--dsh-version is required')
  return prepare(root, candidate)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(
    result => process.stdout.write(`${JSON.stringify(result)}\n`),
    error => {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
      process.exitCode = 1
    },
  )
}
