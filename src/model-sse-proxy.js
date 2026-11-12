// Process-local coordination. A provider must publish a ready endpoint before
// requests start; it owns readiness and migration, never the request itself.
export function createModelSseProxyRegistry() {
  let owner, claimed = false
  return {
    register(provider) {
      if (owner) throw new Error('A model SSE proxy provider is already registered')
      if (typeof provider?.current !== 'function') throw new TypeError('Expected a synchronous current() proxy provider')
      const registration = { provider }
      owner = registration
      claimed = true
      return () => { if (owner === registration) owner = undefined }
    },
    resolve() {
      if (!claimed) return undefined
      const route = owner?.provider.current()
      if (!route || typeof route.proxy !== 'string') throw new Error('Model SSE proxy is unavailable; no request was sent')
      let url
      try { url = new URL(route.proxy) }
      catch { throw new TypeError('Model SSE proxy must be an HTTP or HTTPS CONNECT origin') }
      if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash)
        throw new TypeError('Model SSE proxy must be an HTTP or HTTPS CONNECT origin')
      if (route.ca !== undefined && (typeof route.ca !== 'string' || !route.ca.includes('-----BEGIN CERTIFICATE-----')))
        throw new TypeError('Model SSE proxy CA must be a PEM certificate')
      return Object.freeze({ proxy: url.href, ca: route.ca })
    },
  }
}
