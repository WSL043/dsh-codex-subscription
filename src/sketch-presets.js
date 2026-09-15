// Canonical polygons keep presets editable/exportable without a new file format.
export const SKETCH_PRESETS = ['triangle', 'diamond', 'star']
export function expandSketchPreset(command) {
  if (!SKETCH_PRESETS.includes(command.shape)) return command
  const points = command.points
  if (!Array.isArray(points) || points.length !== 2 || points.some(p => !p || ![p.x, p.y].every(v => Number.isFinite(v) && v >= 0 && v <= 1))) throw Error('Shape preset requires two normalized bounding-box corners')
  const [a, b] = points, x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  const w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y)
  if (!w || !h) throw Error('Shape preset requires a non-empty box')
  const vertices = command.shape === 'triangle' ? [[.5,0],[1,1],[0,1]]
    : command.shape === 'diamond' ? [[.5,0],[1,.5],[.5,1],[0,.5]]
    : Array.from({length:10}, (_, i) => {
      const angle = i * Math.PI / 5 - Math.PI / 2, radius = i % 2 ? .22 : .5
      return [.5 + Math.cos(angle) * radius, .5 + Math.sin(angle) * radius]
    })
  return { ...command, shape: 'polygon', points: vertices.map(([u,v]) => ({x:x+u*w, y:y+v*h})) }
}
