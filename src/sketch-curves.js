const cached = new WeakMap()
const midpoint = (a,b) => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2})
// Flatten only for hit testing. Rendering and storage retain cubic controls.
export function flattenSketchCurve(stroke,width,height) {
  const previous=cached.get(stroke)
  if(previous?.width===width && previous.height===height)return previous.points
  const controls=stroke.points.map(p=>({x:p.x*width,y:p.y*height})), points=[controls[0]]
  const distance=(p,a,b)=>{
    const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy
    const t=d?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/d)):0
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)
  }
  const split=(a,b,c,d,depth)=>{
    if(depth===10 || Math.max(distance(b,a,d),distance(c,a,d))<=.5){points.push(d);return}
    const ab=midpoint(a,b),bc=midpoint(b,c),cd=midpoint(c,d),abc=midpoint(ab,bc),bcd=midpoint(bc,cd),m=midpoint(abc,bcd)
    split(a,ab,abc,m,depth+1);split(m,bcd,cd,d,depth+1)
  }
  for(let i=1;i<controls.length;i+=3)split(controls[i-1],controls[i],controls[i+1],controls[i+2],0)
  const normalized=points.map(p=>({x:p.x/width,y:p.y/height}))
  cached.set(stroke,{width,height,points:normalized})
  return normalized
}
