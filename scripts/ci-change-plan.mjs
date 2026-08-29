import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

function argument(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function normalizeBase(candidate) {
  if (candidate && !/^0+$/u.test(candidate)) {
    try {
      git('rev-parse', '--verify', `${candidate}^{commit}`)
      return candidate
    } catch {}
  }
  try {
    return git('rev-parse', 'HEAD^')
  } catch {
    return git('rev-parse', 'HEAD')
  }
}

function compareVersions(left, right) {
  const parse = value => String(value).replace(/^v/u, '').split('-', 1)[0].split('.').map(Number)
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0)
  }
  return 0
}

const base = normalizeBase(argument('--base'))
const publishedVersion = argument('--published')
const packageVersion = argument('--package-version') ?? JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const explicitFiles = argument('--files')
const files = (explicitFiles === undefined ? git('diff', '--name-only', `${base}...HEAD`) : explicitFiles)
  .split(',').flatMap(value => value.split(/\r?\n/u)).map(value => value.trim()).filter(Boolean)
const matches = patterns => files.some(file => patterns.some(pattern => pattern.test(file)))

const plannerChanged = matches([/^scripts\/ci-change-plan\.mjs$/u, /^\.github\/workflows\/ci\.yml$/u])
const runtime = matches([
  /^src\//u,
  /^lib\//u,
  /^cordis\.patch\.yml$/u,
  /^tsdown\.config\.mjs$/u,
])
const manager = plannerChanged || matches([
  /^dsh-codex\.ps1$/u,
  /^tests\/powershell-manager\.test\.mjs$/u,
  /^\.github\/scripts\/accept-official-release\.ps1$/u,
])
const delivery = plannerChanged || matches([
  /^\.github\//u,
  /^(?:README(?:\.zh-CN)?|DIRECTORY|AGENTS|SECURITY|THIRD_PARTY_NOTICES|LICENSE)\.md$/u,
  /^screenshots\.json$/u,
  /^compatibility\.json$/u,
  /^package\.json$/u,
  /^pnpm-lock\.yaml$/u,
  /^pnpm-workspace\.yaml$/u,
  /^scripts\/prepare-compat-release\.mjs$/u,
  /^tests\/(?:ci-change-plan|client-contract|release-contract|release-notes|publish-idempotency|prepare-compat-release|support-intake)\.test\.mjs$/u,
])
const behavior = plannerChanged || runtime || matches([
  /^compatibility\.json$/u,
  /^package\.json$/u,
  /^pnpm-lock\.yaml$/u,
  /^pnpm-workspace\.yaml$/u,
  /^tests\/(?:auth-security|cache-contract|codex-images|codex-search|image-edit|model-catalog|oauth-network|pi-ai-runtime|plugin-integration|reset-credits|sidebar-quota|transport-contract|usage)\.test\.mjs$/u,
])
const official = plannerChanged || runtime || matches([
  /^compatibility\.json$/u,
  /^package\.json$/u,
  /^pnpm-lock\.yaml$/u,
  /^pnpm-workspace\.yaml$/u,
])

if (runtime && publishedVersion && compareVersions(packageVersion, publishedVersion) <= 0) {
  console.error(`Runtime-bearing files changed after ${publishedVersion}, but package.json is still ${packageVersion}.`)
  console.error('Advance the package version before merging so main cannot advertise code that npm latest does not contain.')
  process.exit(1)
}

const plan = { behavior, delivery, manager, official, runtime }
console.log(JSON.stringify({ base, files, packageVersion, publishedVersion, plan }, null, 2))

if (process.env.GITHUB_OUTPUT && existsSync(process.env.GITHUB_OUTPUT)) {
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(plan).map(([key, value]) => `${key}=${value}\n`).join(''))
}
