export const objectId = (stroke, index) => stroke.id ?? `legacy-${index}`
export const identifyObjects = doc => ({...doc,layers:doc.layers.map(layer=>({...layer,strokes:layer.strokes.map((s,i)=>s.id?s:{...s,id:objectId(s,i)})}))})
export function objectBounds(stroke) {
  const xs=stroke.points.map(p=>p.x),ys=stroke.points.map(p=>p.y)
  return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}
}
export function transformObject(stroke, {dx=0,dy=0,scaleX=1,scaleY=1}) {
  if(![dx,dy,scaleX,scaleY].every(Number.isFinite)||scaleX<=0||scaleY<=0)throw Error('Invalid object transform')
  const box=objectBounds(stroke)
  const points=stroke.points.map(p=>({x:box.x+(p.x-box.x)*scaleX+dx,y:box.y+(p.y-box.y)*scaleY+dy}))
  if(points.some(p=>p.x<0||p.x>1||p.y<0||p.y>1))throw Error('Object would leave the canvas')
  return {...stroke,points}
}
export function sketchObjectSummary(doc) {
  return doc.layers.flatMap(layer=>layer.strokes.map((stroke,i)=>({layer:layer.id,id:objectId(stroke,i),shape:stroke.shape,color:stroke.color,bounds:objectBounds(stroke),...(stroke.text?{text:stroke.text}:{})})))
}
