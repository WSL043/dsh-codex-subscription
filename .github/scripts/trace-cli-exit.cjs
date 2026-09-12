const { basename } = require('node:path')
setTimeout(() => {
  console.error('Official CLI exit diagnostics:', JSON.stringify({
    pid: process.pid, entry: basename(process.argv[1] || ''),
    resources: process.getActiveResourcesInfo(),
    stdin: { tty: !!process.stdin.isTTY, flowing: process.stdin.readableFlowing, ended: process.stdin.readableEnded },
    handles: process._getActiveHandles().map(handle => ({ type: handle.constructor.name, fd: handle.fd })),
  }))
}, 20000).unref()
