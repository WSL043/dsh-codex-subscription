const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/

export function parseVersion(version) {
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

export function dshCompatibilityRange(manifest) {
  const range = manifest?.engines?.dsh ?? manifest?.peerDependencies?.['@deepseek-ai/dsh-llm']
  return typeof range === 'string' ? range : ''
}

// Published manifests use exact versions and bounded intervals. Interpret only
// those forms so unknown declarations cannot silently skip an acceptance run.
export function declaresDshCompatibility(manifest, version) {
  if (typeof version !== 'string' || !VERSION_RE.test(version)) return false
  return dshCompatibilityRange(manifest).split('||').some(term => {
    const clause = term.trim()
    if (clause === version) return true
    const interval = /^>=(\S+) <(\S+)$/u.exec(clause)
    return interval !== null && interval.slice(1).every(bound => VERSION_RE.test(bound))
      && compareVersions(version, interval[1]) >= 0 && compareVersions(version, interval[2]) < 0
  })
}
