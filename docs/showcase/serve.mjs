import http from 'node:http'
import fs from 'node:fs/promises'

const routes = {
  '/gallery.js': ['.artifacts/showcase/gallery.js', 'text/javascript'],
  '/gallery.css': ['docs/showcase/gallery.css', 'text/css'],
}
for (const view of ['settings', 'quota', 'creative']) {
  for (const lang of ['zh', 'en']) {
    routes[`/real-${view}-${lang}.png`] = [`docs/assets/real-${view}-${lang}.png`, 'image/png']
  }
}
routes['/account-demo-zh.png'] = ['docs/assets/subscription-account.png', 'image/png']
routes['/account-demo-en.png'] = ['docs/assets/subscription-account-en.png', 'image/png']
const page = '<!doctype html><meta charset="utf-8"><title>DSH Codex — Product gallery</title><link rel="stylesheet" href="/gallery.css"><div id="root"></div><script type="module" src="/gallery.js"></script>'

http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname
    const route = routes[pathname]
    if (route) {
      const body = await fs.readFile(route[0])
      res.setHeader('Content-Type', route[1])
      res.end(body)
    } else if (pathname === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(page)
    } else {
      res.writeHead(404).end()
    }
  } catch {
    res.writeHead(500).end('Build the documentation gallery first.')
  }
}).listen(65319, '127.0.0.1', () => console.log('Gallery: http://127.0.0.1:65319'))
