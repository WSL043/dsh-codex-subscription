import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publishedBaseline, verifyCompatibilitySource } from '../scripts/compatibility-baseline.mjs'
import { planCompatibilityUpdate, rewriteSubagentRuntime } from '../scripts/prepare-compat-release.mjs'

test('the actual candidate tree extends the published tag and excludes divergent main code and metadata', () => {
  const root = mkdtempSync(join(tmpdir(), 'compat-source-')), repo = join(root, 'repo'), candidate = join(root, 'candidate')
  mkdirSync(repo)
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim()
  const write = (cwd,path,value) => { const file = join(cwd,path);mkdirSync(join(file,'..'),{recursive:true});writeFileSync(file,typeof value==='string'?value:JSON.stringify(value)) }
  try {
    git(repo,'init');git(repo,'config','user.name','fixture');git(repo,'config','user.email','fixture@example.invalid')
    const manifest = {name:'dsh-codex-subscription',version:'3.2.4',peerDependencies:{'@deepseek-ai/dsh-llm':'0.2.1-rc.5','@deepseek-ai/cordis':'4.0.5'},dependencies:{'@deepseek-ai/dsh-home-paths':'0.2.1-rc.5'}}
    const compatibility = {latestTested:'0.2.1-rc.5',supported:['0.2.1-rc.5'],previews:[]}
    const runtime = "export const SUBAGENT_RUNTIME_VERSION = '0.2.1-rc.5'\nexport const SUPPORTED_RUNTIME_VERSIONS = Object.freeze([SUBAGENT_RUNTIME_VERSION])\n"
    write(repo,'package.json',manifest);write(repo,'compatibility.json',compatibility);write(repo,'src/subagent-runtime.js',runtime);write(repo,'src/index.js','export const published = true\n')
    git(repo,'add','.');git(repo,'commit','-m','published');git(repo,'tag','v3.2.4');git(repo,'remote','add','origin',repo)
    const baseline = publishedBaseline(manifest, (...args)=>git(repo,...args))
    write(repo,'package.json',{...manifest,version:'9.9.0'});write(repo,'src/unpublished.js','export const mustNotShip = true\n')
    git(repo,'add','.');git(repo,'commit','-m','unreleased main')
    git(repo,'worktree','add','--detach',candidate,baseline.sha)
    const host = {cordis:'4.1.0',subagentRuntime:'0.2.2-rc.1'},dshVersion='0.2.2-rc.1'
    const update=planCompatibilityUpdate({manifest,compatibility,host},dshVersion)
    write(candidate,'package.json',update.manifest);write(candidate,'compatibility.json',update.compatibility);write(candidate,'src/subagent-runtime.js',rewriteSubagentRuntime(runtime,update))
    git(candidate,'add','.');git(candidate,'commit','-m','compat only')
    const source=git(candidate,'rev-parse','HEAD'),run=(...args)=>git(candidate,...args)
    assert.equal(verifyCompatibilitySource({source,baseline,dshVersion,host},run).source,source)
    assert.equal(JSON.parse(readFileSync(join(candidate,'package.json'))).version,'3.2.5')
    assert.throws(()=>git(candidate,'show',`${source}:src/unpublished.js`))
    assert.throws(()=>verifyCompatibilitySource({source:git(repo,'rev-parse','HEAD'),baseline,dshVersion,host},run),/outside|metadata/)
    write(candidate,'package.json',{...update.manifest,dependencies:{...update.manifest.dependencies,unexpected:'1.0.0'}})
    git(candidate,'add','.');git(candidate,'commit','--amend','--no-edit')
    assert.throws(()=>verifyCompatibilitySource({source:git(candidate,'rev-parse','HEAD'),baseline,dshVersion,host},run),/metadata/)
    assert.throws(()=>publishedBaseline({...manifest,version:'3.2.4',gitHead:'a'.repeat(40)},(...args)=>git(repo,...args)),/identity/)
  } finally { rmSync(root,{recursive:true,force:true}) }
})
