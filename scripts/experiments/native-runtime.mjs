// Explicit installed runtime; never installs packages or changes a user profile.
import fs from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
const argument = process.env.DSH_TEST_RUNTIME
if (!argument) throw Error('Set DSH_TEST_RUNTIME to the installed DSH node_modules/.pnpm directory')
const runtime = path.resolve(argument), cache = new Map()
export async function packagePath(name) {
  if (cache.has(name)) return cache.get(name)
  for (const entry of await fs.readdir(runtime)) {
    const root = path.join(runtime,entry,'node_modules',name)
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'))
      if (pkg.name === name) { cache.set(name,root); return root }
    } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  throw Error('Missing installed runtime package: '+name)
}
export async function load(name) {
  const root = await packagePath(name), pkg = JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'))
  return import(pathToFileURL(path.join(root,pkg.main??'lib/index.js')))
}
