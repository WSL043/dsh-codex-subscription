import { spawn, execFileSync } from 'node:child_process'

const [command, ...args] = process.argv.slice(2)
if (!command) throw new Error('Missing official DSH command')
const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
let timedOut = false
const timer = setTimeout(() => {
  timedOut = true
  console.error('Official DSH command exceeded 180 seconds; stopping its process tree.')
  if (process.platform === 'win32' && child.pid) {
    try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'inherit' }) }
    catch { child.kill('SIGKILL') }
  } else child.kill('SIGKILL')
}, 180000)
child.on('error', error => { clearTimeout(timer); console.error(error.message); process.exitCode = 1 })
child.on('close', code => { clearTimeout(timer); process.exitCode = timedOut ? 1 : code ?? 1 })
