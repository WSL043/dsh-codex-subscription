import { readImageFeatures } from './image-features.js'

/** Removing the tool also removes its schema from subsequent model requests. */
export function watchImageTool(settings, register) {
  let disposeTool
  const sync = value => {
    const { imageGeneration, imageEditing } = readImageFeatures(value)
    if ((imageGeneration || imageEditing) && !disposeTool) disposeTool = register()
    else if (!imageGeneration && !imageEditing && disposeTool) {
      disposeTool()
      disposeTool = undefined
    }
  }
  sync(settings.get())
  const unwatch = settings.watch(sync)
  return () => { unwatch(); disposeTool?.(); disposeTool = undefined }
}
