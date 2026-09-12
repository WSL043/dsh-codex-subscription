const defaults = {pen:12, pencil:6, marker:28, eraser:24, text:32, line:12, arrow:12, rectangle:12, circle:12}
const keyFor = ({tool, brush}) => tool === 'pen' ? brush : tool

// Selection edits belong to the object, never to a drawing tool's settings.
export function switchSketchToolWidth(memory, current, next) {
  if (current.tool !== 'select') memory[keyFor(current)] = current.width
  if (next.tool === 'select') return current.width
  const key = keyFor(next)
  return memory[key] ?? defaults[key] ?? 12
}

export function stepSketchWidth(width, direction) {
  return Math.max(1, Math.min(256, width + direction * 2))
}
