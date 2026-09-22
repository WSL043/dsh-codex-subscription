import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// A prerelease caret can select a later, only partially published DSH cohort.
// Pin only dependencies declared against the exact cohort being accepted.
export function cohortDependencies(manifest, version) {
  return Object.entries({ ...manifest.dependencies, ...manifest.optionalDependencies })
    .filter(([name, range]) => name.startsWith('@deepseek-ai/dsh-') && [version, `^${version}`, `~${version}`].includes(range))
    .map(([name]) => name)
}

export async function pinOfficialCohort(root, version, fetchManifest = async name => {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`Cannot inspect official cohort: ${name}@${version} (${response.status})`)
  return response.json()
}) {
  const seen = new Set(), overrides = {}
  let pending = ['@deepseek-ai/dsh']
  while (pending.length) {
    const batch = pending.splice(0, 12).filter(name => !seen.has(name))
    for (const name of batch) seen.add(name)
    const manifests = await Promise.all(batch.map(fetchManifest))
    for (let i = 0; i < manifests.length; i++) {
      const manifest = manifests[i]
      if (manifest.name !== batch[i] || manifest.version !== version) throw new Error('Official cohort identity mismatch')
      overrides[batch[i]] = version
      pending.push(...cohortDependencies(manifest, version).filter(name => !seen.has(name) && !pending.includes(name)))
    }
  }
  await writeFile(resolve(root, 'pnpm-workspace.yaml'), JSON.stringify({ overrides }, null, 2) + '\n')
  console.log(`Pinned ${seen.size} official DSH packages to ${version}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await pinOfficialCohort(process.argv[2], process.argv[3])
}
