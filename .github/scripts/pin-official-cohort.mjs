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

// Cordis services must share the vendor generation declared by this DSH build.
// New vendor minors/patches can change service initialization independently of DSH.
export function vendorDependencies(manifest) {
  return Object.entries({ ...manifest.dependencies, ...manifest.optionalDependencies })
    .filter(([name]) => /^@deepseek-ai\/(?:cordis(?:-plugin-[a-z-]+)?|cosmokit|schemastery)$/.test(name))
    .map(([name, range]) => {
      const match = /^[~^]?(\d+\.\d+\.\d+)$/.exec(range)
      if (!match) throw new Error(`Unsupported official vendor range: ${name}@${range}`)
      return [name, match[1]]
    })
}

export async function pinOfficialCohort(root, version, fetchManifest = async (name, requestedVersion) => {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${requestedVersion}`, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`Cannot inspect official cohort: ${name}@${requestedVersion} (${response.status})`)
  return response.json()
}) {
  const seen = new Set(), overrides = {}
  let pending = [['@deepseek-ai/dsh', version]]
  while (pending.length) {
    const batch = pending.splice(0, 12).filter(([name]) => !seen.has(name))
    for (const [name] of batch) seen.add(name)
    const manifests = await Promise.all(batch.map(([name, requested]) => fetchManifest(name, requested)))
    for (let i = 0; i < manifests.length; i++) {
      const manifest = manifests[i]
      const [name, requested] = batch[i]
      if (manifest.name !== name || manifest.version !== requested) throw new Error('Official cohort identity mismatch')
      overrides[name] = requested
      const dependencies = [...cohortDependencies(manifest, version).map(name => [name, version]), ...vendorDependencies(manifest)]
      for (const [dependency, target] of dependencies) {
        const existing = overrides[dependency] ?? pending.find(([name]) => name === dependency)?.[1] ?? batch.find(([name]) => name === dependency)?.[1]
        if (existing && existing !== target) throw new Error(`Conflicting official cohort: ${dependency}@${existing} / ${target}`)
        if (!existing) pending.push([dependency, target])
      }
    }
  }
  await writeFile(resolve(root, 'pnpm-workspace.yaml'), JSON.stringify({ overrides }, null, 2) + '\n')
  console.log(`Pinned ${seen.size} official DSH/vendor packages for ${version}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await pinOfficialCohort(process.argv[2], process.argv[3])
}
