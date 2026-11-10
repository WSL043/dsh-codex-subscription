// CDP scripts use this probe to choose a local debug port. It does not start DSH.
// The retired UI runner's credential-copying throwaway-host implementation was
// removed; current installed-product acceptance is documented in docs/ui-smoke.md.
import { createServer } from 'node:net'

export function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}
