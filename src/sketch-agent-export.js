// Keep file encoding and transport serialization under the same lock as manual
// save/import/download. A rejected duplicate must not clear the first export's lock.
export async function exportSketchAgentFile(format, { gate, blocked, working, report, exportFile }) {
  let result
  const completed = await gate.run(async () => {
    const { blob, extension } = await exportFile(format)
    const data = new Uint8Array(await blob.arrayBuffer())
    let raw = ''
    for (let i = 0; i < data.length; i += 8192)
      raw += String.fromCharCode(...data.subarray(i, i + 8192))
    result = { extension, mediaType: blob.type, base64: btoa(raw) }
  }, { blocked, working, report, rethrow: true })
  if (!completed) throw Error('Sketch is being edited; retry after it settles')
  return result
}
