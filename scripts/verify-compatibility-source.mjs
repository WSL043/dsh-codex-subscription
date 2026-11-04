import { publishedBaseline, verifyCompatibilitySource } from './compatibility-baseline.mjs'
import { registryJson } from './upstream-compatibility.mjs'
import { hostOf } from './prepare-compat-release.mjs'

const published = await registryJson('https://registry.npmjs.org/dsh-codex-subscription/latest')
const baseline = publishedBaseline(published)
if (process.env.BASELINE_VERSION !== baseline.version) throw Error('Published baseline changed; regenerate the compatibility candidate')
console.log(JSON.stringify(verifyCompatibilitySource({ source: process.env.SOURCE_SHA, baseline,
  dshVersion: process.env.DSH_VERSION, host: await hostOf(process.env.DSH_VERSION),
  recheck: process.env.DRY_RUN === 'true' })))
