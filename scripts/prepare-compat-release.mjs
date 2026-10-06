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
  const compatibility = typeof current === 'string'
    ? { latestTested: current, supported: [current], previews: [] }
    : current
  parseVersion(compatibility.latestTested)
  const tested = new Set([...(compatibility.supported ?? []), ...(compatibility.previews ?? [])])
  const previewFloor = [...(compatibility.previews ?? [])].sort(compareVersions).at(-1)
    ?? compatibility.latestTested
  return [...new Set(versions)]
    .filter(version => typeof version === 'string'
      && !tested.has(version)
      && compareVersions(version, isPreviewVersion(version) ? previewFloor : compatibility.latestTested) > 0)
    .sort(compareVersions)[0] ?? null
}

function isPreviewVersion(version) {
  const [channel] = parseVersion(version).prerelease
  return channel === 'alpha' || channel === 'beta'
}

function nextStableVersion(version) {
  const parsed = parseVersion(version)
  if (parsed.prerelease.length > 0) {
    if (parsed.prerelease[0] !== 'beta') throw new Error(`unsupported plugin prerelease: ${version}`)
    return parsed.core.join('.')
  }
  return `${parsed.core[0]}.${parsed.core[1]}.${parsed.core[2] + 1}`
}

function nextBetaVersion(version) {
  const parsed = parseVersion(version)
  if (parsed.prerelease.length === 0) {
    return `${parsed.core[0]}.${parsed.core[1]}.${parsed.core[2] + 1}-beta.0`
  }
  if (parsed.prerelease.length !== 2 || parsed.prerelease[0] !== 'beta'
    || !Number.isInteger(parsed.prerelease[1])) {
    throw new Error(`unsupported plugin prerelease: ${version}`)
  }
  return `${parsed.core.join('.')}-beta.${parsed.prerelease[1] + 1}`
}

function previousDocumentedPluginVersion(version) {
  const parsed = parseVersion(version)
  if (parsed.prerelease.length === 0) return version
  if (parsed.prerelease.length !== 2 || parsed.prerelease[0] !== 'beta'
    || !Number.isInteger(parsed.prerelease[1]) || parsed.core[2] === 0) {
    throw new Error(`unsupported plugin prerelease: ${version}`)
  }
  return `${parsed.core[0]}.${parsed.core[1]}.${parsed.core[2] - 1}`
}

const SUBAGENT_RUNTIME = '@deepseek-ai/dsh-subagent-codex'

// Add one exact version to an `a || b || c` peer list, keeping existing entries.
function widenPeer(manifest, name, version) {
  const current = manifest.peerDependencies?.[name]
  if (version === undefined || typeof current !== 'string') return
  const versions = current.split('||').map(entry => entry.trim()).filter(Boolean)
  if (!versions.includes(version)) manifest.peerDependencies[name] = [...versions, version].join(' || ')
}

/** The exact cordis host a DSH release ships, read from its declared range (e.g. ~4.0.5-alpha.1). */
export function cordisHostOf(dshManifest) {
  const range = { ...dshManifest?.dependencies, ...dshManifest?.optionalDependencies }['@deepseek-ai/cordis']
  return /^[~^]?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(range ?? '')?.[1]
}

export function planCompatibilityUpdate(state, candidate) {
  parseVersion(candidate)
  const preview = isPreviewVersion(candidate)
  const lane = preview ? (state.compatibility.previews ?? []) : state.compatibility.supported
  const previousDshVersion = preview
    ? [...lane].sort(compareVersions).at(-1) ?? state.compatibility.latestTested
    : state.compatibility.latestTested
  const order = compareVersions(candidate, previousDshVersion)
  if (order === 0) return null
  if (order < 0) throw new Error(`DSH candidate ${candidate} is older than latest tested ${previousDshVersion}`)

  const compatibility = structuredClone(state.compatibility)
  compatibility.previews ??= []
  if (preview) {
    compatibility.previews = [...new Set([...compatibility.previews, candidate])].sort(compareVersions)
  } else {
    compatibility.latestTested = candidate
    compatibility.supported = [...new Set([...compatibility.supported, candidate])].sort(compareVersions)
  }

  const manifest = structuredClone(state.manifest)
  const previousPluginVersion = manifest.version
  manifest.version = preview ? nextBetaVersion(previousPluginVersion) : nextStableVersion(previousPluginVersion)
  if (!preview) {
    for (const name of Object.keys(manifest.devDependencies ?? {})) {
      if (name.startsWith('@deepseek-ai/dsh-') && !manifest.peerDependenciesMeta?.[name]?.optional) manifest.devDependencies[name] = candidate
    }
    if (manifest.dependencies?.['@deepseek-ai/dsh-home-paths']) manifest.dependencies['@deepseek-ai/dsh-home-paths'] = candidate
  }
  // The DSH plugin manager also checks the cordis host and the optional Codex subtask runtime.
  widenPeer(manifest, '@deepseek-ai/cordis', state.host?.cordis)
  const subagentRuntime = state.host?.subagentRuntime
  widenPeer(manifest, SUBAGENT_RUNTIME, subagentRuntime)
  if (subagentRuntime !== undefined && !preview && manifest.devDependencies?.[SUBAGENT_RUNTIME]) manifest.devDependencies[SUBAGENT_RUNTIME] = subagentRuntime
  const supportedRange = [...compatibility.supported, ...compatibility.previews].sort(compareVersions).join(' || ')
  for (const name of Object.keys(manifest.peerDependencies ?? {})) {
    if (name.startsWith('@deepseek-ai/dsh-') && !manifest.peerDependenciesMeta?.[name]?.optional) manifest.peerDependencies[name] = supportedRange
  }

  return {
    previousDshVersion,
    dshVersion: candidate,
    previousPluginVersion,
    previousDocumentedPluginVersion: previousDocumentedPluginVersion(previousPluginVersion),
    pluginVersion: manifest.version,
    updateStableReferences: !preview,
    ...(subagentRuntime === undefined ? {} : { subagentRuntime }),
    compatibility,
    manifest,
  }
}

export function rewriteBoundedVersions(source, update, label) {
  if (label === 'dsh-codex.ps1') {
    // The optional manager is stamped independently of README/package history.
    const assignment = /^(\$PackageVersion\s*=\s*')([^'\r\n]+)('\s*)$/gmu
    const matches = [...source.matchAll(assignment)]
    if (matches.length !== 1) throw new Error('expected one PackageVersion assignment in dsh-codex.ps1')
    parseVersion(matches[0][2])
    parseVersion(update.pluginVersion)
    const specAssignment = /^(\$PackageSpec[ \t]*=[ \t]*')([^'\r\n]+)('[ \t]*\r?)$/gmu
    const specs = [...source.matchAll(specAssignment)]
    if (specs.length !== 1 || specs[0][2] !== `dsh-codex-subscription@${matches[0][2]}`) {
      throw new Error('expected one matching PackageSpec assignment in dsh-codex.ps1')
    }
    return source
      .replace(assignment, (_match, prefix, _version, suffix) => prefix + update.pluginVersion + suffix)
      .replace(specAssignment, (_match, prefix, _spec, suffix) => prefix + `dsh-codex-subscription@${update.pluginVersion}` + suffix)
  }
  const previousVersion = update.previousDocumentedPluginVersion ?? update.previousPluginVersion
  let rewritten = source.replaceAll(previousVersion, update.pluginVersion)
  if (update.updateStableReferences) rewritten = rewritten.replaceAll(update.previousDshVersion, update.dshVersion)
  if (rewritten === source) throw new Error(`no bounded version reference changed in ${label}`)
  if (rewritten.includes(previousVersion)) throw new Error(`stale plugin version remains in ${label}`)
  return rewritten
}

/** Keep SUPPORTED_RUNTIME_VERSIONS in step with the peer list; a stable release also becomes the installed runtime. */
export function rewriteSubagentRuntime(source, update) {
  if (update.subagentRuntime === undefined) return source
  const constant = /^(export const SUBAGENT_RUNTIME_VERSION = ')([^'\r\n]+)(')$/mu
  const list = /^(export const SUPPORTED_RUNTIME_VERSIONS = Object\.freeze\(\[)([^\]\r\n]*)(\]\))$/mu
  const current = constant.exec(source)?.[2], items = list.exec(source)?.[2]
  if (current === undefined || items === undefined) throw new Error('expected SUBAGENT_RUNTIME_VERSION and SUPPORTED_RUNTIME_VERSIONS in subagent-runtime.js')
  const versions = items.split(',').map(item => item.trim()).filter(Boolean)
    .map(item => item === 'SUBAGENT_RUNTIME_VERSION' ? current : /^'([^']+)'$/u.exec(item)?.[1])
  if (versions.some(version => version === undefined)) throw new Error('unexpected SUPPORTED_RUNTIME_VERSIONS entry')
  const installed = update.updateStableReferences ? update.subagentRuntime : current
  const next = [...new Set([...versions, update.subagentRuntime])].sort(compareVersions)
    .map(version => version === installed ? 'SUBAGENT_RUNTIME_VERSION' : `'${version}'`).join(', ')
  return source
    .replace(constant, (_match, prefix, _version, suffix) => prefix + installed + suffix)
    .replace(list, (_match, prefix, _items, suffix) => prefix + next + suffix)
}

export function boundedArtifactPaths(update) {
  if (!update.updateStableReferences) return []
  return [
    'README.md',
    'README.en.md',
    'dsh-codex.ps1',
    '.github/scripts/accept-official-release.ps1',
  ]
}

export function rewriteWorkspaceCohort(workspace, update) {
  if (!update.updateStableReferences) return workspace
  const rewritten = workspace.replaceAll(update.previousDshVersion, update.dshVersion)
  if (rewritten === workspace) throw new Error(`DSH release cohort ${update.previousDshVersion} was not found`)
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

async function registryManifest(name, version) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`, { signal: AbortSignal.timeout(30_000) })
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`Cannot inspect ${name}@${version} (${response.status})`)
  return response.json()
}

/** What the candidate DSH release ships that the plugin manager checks besides the dsh-* cohort. */
export async function hostOf(candidate, fetchManifest = registryManifest) {
  const dsh = await fetchManifest('@deepseek-ai/dsh', candidate)
  if (dsh?.version !== candidate) throw new Error(`Cannot inspect @deepseek-ai/dsh@${candidate}`)
  const subagent = await fetchManifest(SUBAGENT_RUNTIME, candidate)
  return { cordis: cordisHostOf(dsh), ...(subagent?.version === candidate ? { subagentRuntime: candidate } : {}) }
}

async function prepare(root, candidate) {
  const compatibilityPath = resolve(root, 'compatibility.json')
  const manifestPath = resolve(root, 'package.json')
  const [compatibility, manifest] = await Promise.all([
    readFile(compatibilityPath, 'utf8').then(JSON.parse),
    readFile(manifestPath, 'utf8').then(JSON.parse),
  ])
  const update = planCompatibilityUpdate({ compatibility, manifest, host: await hostOf(candidate) }, candidate)
  if (update === null) return { changed: false, dshVersion: candidate, pluginVersion: manifest.version }

  const runtimePath = resolve(root, 'src/subagent-runtime.js')
  const runtimeSource = await readFile(runtimePath, 'utf8')
  const nextRuntime = rewriteSubagentRuntime(runtimeSource, update)

  const boundedPaths = boundedArtifactPaths(update)
  const sources = await Promise.all(boundedPaths.map(path => readFile(resolve(root, path), 'utf8')))
  const rewritten = sources.map((source, index) => rewriteBoundedVersions(source, update, boundedPaths[index]))

  const workspacePath = resolve(root, 'pnpm-workspace.yaml')
  const workspace = await readFile(workspacePath, 'utf8')
  const nextWorkspace = rewriteWorkspaceCohort(workspace, update)

  await Promise.all([
    writeFile(compatibilityPath, `${JSON.stringify(update.compatibility, null, 2)}\n`),
    writeFile(manifestPath, `${JSON.stringify(update.manifest, null, 2)}\n`),
    writeFile(workspacePath, nextWorkspace),
    ...(nextRuntime === runtimeSource ? [] : [writeFile(runtimePath, nextRuntime)]),
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
