import { useEffect, useRef } from 'react'
// Shared dismissal rules keep popovers independent from canvas pointer capture.
export function useSketchDismiss(open, close, host, selectors) {
  const latest=useRef(close);latest.current=close
  useEffect(()=>{
    if(!open)return
    const dialog=host.current?.closest('dialog') ?? host.current
    if(!dialog)return
    const pointer=event=>{
      if(selectors.some(selector=>event.target.closest?.(selector)))return
      latest.current(false)
      // A click that dismisses a panel must not leave an accidental dot.
      if(event.target.matches?.('canvas')){event.preventDefault();event.stopPropagation();event.target.focus({preventScroll:true})}
    }
    const key=event=>{if(event.key!=='Escape')return;event.preventDefault();event.stopPropagation();latest.current(false);dialog.querySelector('canvas')?.focus({preventScroll:true})}
    const hidden=()=>latest.current(false)
    document.addEventListener('pointerdown',pointer,true);document.addEventListener('keydown',key,true);dialog.addEventListener('close',hidden)
    return()=>{document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('keydown',key,true);dialog.removeEventListener('close',hidden)}
  },[open,host,selectors.join('|')])
}
export function useSketchCursor(canvas, ring, width, brush, zoom, hidden) {
  const last=useRef(null), heldPressure=useRef(1)
  const update=(event,bounds)=>{
    if(event)last.current=event
    const pointer=last.current,node=canvas.current,cursor=ring.current
    if(!pointer||!node||!cursor)return
    const rect=bounds ?? node.getBoundingClientRect()
    if(hidden||pointer.pointerType==='touch'||pointer.clientX<rect.left||pointer.clientX>rect.right||pointer.clientY<rect.top||pointer.clientY>rect.bottom){cursor.hidden=true;return}
    const pressure=node.hasPointerCapture(pointer.pointerId)&&pointer.pointerType==='pen'?heldPressure.current:1
    const diameter=width*(brush==='pencil'?.55:1)*pressure*rect.width/node.width
    cursor.hidden=false;cursor.style.width=`${diameter}px`;cursor.style.height=`${diameter}px`;cursor.style.transform=`translate(${pointer.clientX-diameter/2}px,${pointer.clientY-diameter/2}px)`
  }
  useEffect(()=>{update();const observer=new ResizeObserver(()=>update());if(canvas.current)observer.observe(canvas.current);return()=>observer.disconnect()},[width,brush,zoom,hidden])
  return {down:event=>{heldPressure.current=event.pointerType==='pen'?Math.max(.2,event.pressure):1},move:(event,bounds)=>update({clientX:event.clientX,clientY:event.clientY,pointerId:event.pointerId,pointerType:event.pointerType,pressure:event.pressure},bounds),leave:()=>{last.current=null;if(ring.current)ring.current.hidden=true}}
}
