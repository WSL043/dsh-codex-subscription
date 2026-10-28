import { createRequire } from 'node:module'
import { isAbsolute } from 'node:path'
import { realpathSync } from 'node:fs'

const id = '@deepseek-ai/dsh-session'
const absent = error => error?.code === 'MODULE_NOT_FOUND'
  && error.message?.startsWith(`Cannot find module '${id}'`)
const loadSdk = base => {
  let resolved = base
  try { resolved = realpathSync(base.startsWith('file:') ? new URL(base) : base) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  return createRequire(resolved)(id)
}

/** Session writers must come from the host's SDK: even equal-version copies have distinct private brands. */
export function loadHostSessionSdk({ entry = process.argv[1], local = import.meta.url,
  load = loadSdk } = {}) {
  for (const base of [typeof entry === 'string' && isAbsolute(entry) ? entry : undefined, local]) {
    if (!base) continue
    try { return load(base) }
    catch (error) { if (!absent(error)) throw error }
  }
  return undefined
}
