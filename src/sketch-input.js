export function snapLine(start, end) {
  const angle = Math.round(Math.atan2(end.y - start.y, end.x - start.x) / (Math.PI / 4)) * Math.PI / 4
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  return { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length }
}
// Geometric smoothing keeps the first and newest sample exact: no input delay.
export function smoothStrokePoints(points, strength = 0) {
  if (!strength || points.length < 3) return points
  const radius = Math.max(1, Math.round(strength / 25)), amount = Math.min(1,strength/75)
  return points.map((point,i)=>{
    if(i===0 || i===points.length-1)return point
    let x=0,y=0,weight=0
    for(let j=Math.max(0,i-radius);j<=Math.min(points.length-1,i+radius);j++){
      const w=radius+1-Math.abs(j-i);x+=points[j].x*w;y+=points[j].y*w;weight+=w
    }
    return {...point,x:point.x+(x/weight-point.x)*amount,y:point.y+(y/weight-point.y)*amount}
  })
}
