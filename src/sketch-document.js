import { configureSketchBrush } from './sketch-brushes.js'
export const SKETCH_SIZE = 1024
export const MAX_SKETCH_STROKES = 2000
export const MAX_STROKE_POINTS = 2000

export function sketchPoint(clientX, clientY, rect) {
  if (!(rect.width > 0 && rect.height > 0)) return undefined
  return { x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) }
}

export function paintSketch(context, strokes, size = SKETCH_SIZE, transparent = false, height = size, start = 0, end = strokes.length) {
  context.globalCompositeOperation = 'source-over'
  context.globalAlpha = 1
  if (!transparent) { context.fillStyle = '#ffffff'; context.fillRect(0, 0, size, height) }
  context.lineCap = 'round'
  context.lineJoin = 'round'
  for (let index = start; index < end; index++) {
    const stroke = strokes[index]
    const first = stroke.points[0]
    if (!first) continue
    context.globalCompositeOperation = stroke.shape === 'eraser' ? 'destination-out' : 'source-over'
    configureSketchBrush(context,stroke)
    context.beginPath()
    const last = stroke.points.at(-1)
    if (stroke.shape === 'text') {
      const x=Math.min(first.x,last.x)*size,y=Math.min(first.y,last.y)*height,w=Math.abs(last.x-first.x)*size,h=Math.abs(last.y-first.y)*height
      const lines=stroke.text.split('\n'),fontSize=Math.min(stroke.width,h/Math.max(1,lines.length)/1.2)
      context.font=`${fontSize}px system-ui, sans-serif`;context.textBaseline='top'
      lines.forEach((line,i)=>context.fillText(line,x,y+i*fontSize*1.2,w))
    } else if (stroke.shape === 'arrow') {
      const x=last.x*size,y=last.y*height,a=Math.atan2(y-first.y*height,x-first.x*size),head=Math.min(Math.hypot(x-first.x*size,y-first.y*height)*.4,Math.max(12,stroke.width*3))
      context.moveTo(first.x*size,first.y*height);context.lineTo(x,y);context.stroke();context.beginPath();context.moveTo(x,y)
      context.lineTo(x-head*Math.cos(a-.5),y-head*Math.sin(a-.5));context.lineTo(x-head*Math.cos(a+.5),y-head*Math.sin(a+.5));context.closePath();context.fill()
    } else if (stroke.shape === 'bezier') {
      context.moveTo(first.x*size,first.y*height)
      for(let i=1;i<stroke.points.length;i+=3){const [a,b,c]=stroke.points.slice(i,i+3);context.bezierCurveTo(a.x*size,a.y*height,b.x*size,b.y*height,c.x*size,c.y*height)}
      if(stroke.fill){context.closePath();context.fill()}else context.stroke()
    } else if (stroke.shape === 'line') {
      context.moveTo(first.x * size, first.y * height); context.lineTo(last.x * size, last.y * height); context.stroke()
    } else if (stroke.shape === 'rectangle') {
      context.rect(first.x * size, first.y * height, (last.x-first.x)*size, (last.y-first.y)*height)
      if(stroke.fill)context.fill();else context.stroke()
    } else if (stroke.shape === 'circle') {
      context.ellipse((first.x+last.x)*size/2, (first.y+last.y)*height/2, Math.abs(last.x-first.x)*size/2, Math.abs(last.y-first.y)*height/2, 0, 0, Math.PI*2)
      if(stroke.fill)context.fill();else context.stroke()
    } else if (stroke.shape === 'polygon') {
      context.moveTo(first.x*size,first.y*height)
      for(const point of stroke.points.slice(1))context.lineTo(point.x*size,point.y*height)
      context.closePath()
      if(stroke.fill)context.fill();else context.stroke()
    } else if (stroke.points.length === 1) {
      if(stroke.brushVersion===2 && stroke.brush==='marker')context.rect(first.x*size-context.lineWidth/2,first.y*height-context.lineWidth/4,context.lineWidth,context.lineWidth/2)
      else context.arc(first.x * size, first.y * height, context.lineWidth / 2, 0, Math.PI * 2)
      context.fill()
    } else {
      context.moveTo(first.x * size, first.y * height)
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const point = stroke.points[i], next = stroke.points[i + 1]
        if (context.quadraticCurveTo) context.quadraticCurveTo(point.x * size, point.y * height, (point.x + next.x) * size / 2, (point.y + next.y) * height / 2)
        else context.lineTo(point.x * size, point.y * height)
      }
      context.lineTo(last.x * size, last.y * height)
      context.stroke()
    }
  }
  context.globalCompositeOperation = 'source-over'
  context.globalAlpha = 1
}
