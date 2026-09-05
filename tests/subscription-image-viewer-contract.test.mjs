import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('subscription client keeps external viewer priority and owns only its local overlay', async () => {
  const source = await read('src/client.jsx')
  const viewer = await read('src/subscription-image-viewer.jsx')
  const styles = await read('src/subscription-image-viewer-styles.js')

  assert.match(source, /SubscriptionImageViewerService/u)
  assert.match(source, /slots\.inject\(['"]shell\.overlay['"]/u)
  assert.match(source, /getImageViewer\?\.\(\)/u)
  assert.match(source, /viewer\?\.open\?\.\(request\) === true[\s\S]*?getInternalImageViewer/u)
  assert.doesNotMatch(source, /installOfficialImageBridge|nativeImageButton|reflect\.provide\(['"]nativeImageViewer/u)
  assert.doesNotMatch(source, /codexGeneratedImageLightbox|codexGeneratedImageTopbar|codexGeneratedImageComments/u)
  assert.match(viewer, /addEventListener\('wheel', onWheel, \{ passive: false \}\)/u)
  assert.match(viewer, /onPointerMove/u)
  assert.match(viewer, /closest\('button,textarea,input,a,select,\[contenteditable=true\]'\)/u)
  assert.match(viewer, /pointersRef\.current\.size === 2\) \{\s*event\.currentTarget\.setPointerCapture/u)
  assert.match(viewer, /className="dcsiv-topbar"/u)
  assert.match(viewer, /className="dcsiv-inline-note"/u)
  assert.match(viewer, /event\.key === 'Enter' && !event\.shiftKey/u)
  assert.match(viewer, /stopImmediatePropagation/u)
  assert.match(viewer, /service\.setAnnotations\(item\.id, next\)/u)
  assert.match(viewer, /navigator\.clipboard\.writeText/u)
  assert.match(viewer, /item\.download === undefined/u)
  assert.match(viewer, /action\.onInvoke\(\{ annotations, item, src: item\.src \}\)/u)
  assert.match(styles, /\.dcsiv-topbar\{position:absolute;right:50%;bottom:22px/u)
  assert.match(styles, /\.dcsiv-inline-note\{position:absolute;bottom:34px/u)
  assert.doesNotMatch(styles, /\.niv-|\.codexGeneratedImage/u)
})
