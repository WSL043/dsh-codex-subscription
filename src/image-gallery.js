import { decodeImagePresentation } from './image-original-contract.js'

export function sessionImageGallery(events) {
  const images = new Map()
  for (const event of events ?? []) {
    if (event?.type !== 'tool/result') continue
    const original = decodeImagePresentation(event.data?.meta)?.original
    if (!original) continue
    for (const result of event.data?.message?.content ?? []) {
      if (result.type !== 'tool-result' || result.isError) continue
      for (const item of result.content ?? []) {
        const ref = item?.attachment
        if (item.type !== 'image' || ref?.mediaType !== 'image/png' || !/^sha256:[a-f0-9]{64}$/.test(ref.attachmentId)) continue
        if (![ref.bytes,ref.width,ref.height].every(value => Number.isSafeInteger(value) && value > 0)) continue
        images.set(ref.attachmentId, { attachment: { attachmentId: ref.attachmentId, mediaType: ref.mediaType, bytes: ref.bytes, width: ref.width, height: ref.height, name: typeof ref.name === 'string' ? ref.name.slice(0,128) : 'image.png' }, original })
      }
    }
  }
  return [...images.values()].slice(-100)
}
