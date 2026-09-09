import { useEffect, useRef, useState } from 'react'
export const DEFAULT_KEYS = {pen:'b',eraser:'e',line:'l',rectangle:'r',circle:'o',pan:' ',zoomIn:'=',zoomOut:'-',fit:'0'}
export function useSketchView(canvas, open) {
  const [view,setView]=useState({scale:1,x:0,y:0}),[keys,setKeys]=useState(()=>{try{return {...DEFAULT_KEYS,...JSON.parse(localStorage.getItem('codex-sketch-keys'))}}catch{return DEFAULT_KEYS}})
  const [shortcuts,setShortcuts]=useState(()=>{try{return localStorage.getItem('codex-sketch-shortcuts')!=='off'}catch{return true}}),[space,setSpace]=useState(false)
  const drag=useRef(null),viewRef=useRef(view);viewRef.current=view
  const zoom=factor=>setView(v=>({...v,scale:Math.max(.25,Math.min(8,v.scale*factor))}))
  const reset=()=>setView({scale:1,x:0,y:0})
  useEffect(()=>{const node=canvas.current;if(!node||!open)return;const wheel=e=>{if(!shortcuts||!e.altKey)return;e.preventDefault();zoom(e.deltaY<0?1.1:1/1.1)};node.addEventListener('wheel',wheel,{passive:false});return()=>node.removeEventListener('wheel',wheel)},[open,shortcuts])
  useEffect(()=>{const stop=()=>{drag.current=null;setSpace(false)};window.addEventListener('blur',stop);return()=>window.removeEventListener('blur',stop)},[])
  useEffect(()=>{if(!open||!shortcuts){setSpace(false);drag.current=null}},[open,shortcuts])
  const setKey=(action,key)=>{key=key.toLowerCase();if(!key||Object.entries(keys).some(([a,k])=>a!==action&&k===key)||['[',']'].includes(key))return;const next={...keys,[action]:key};setKeys(next);try{localStorage.setItem('codex-sketch-keys',JSON.stringify(next))}catch{}}
  return {view,keys,shortcuts,space,zoom,reset,setKey,toggle:()=>setShortcuts(v=>{try{localStorage.setItem('codex-sketch-shortcuts',v?'off':'on')}catch{}return !v}),
    keyDown:e=>{if(!shortcuts||e.ctrlKey||e.metaKey||e.altKey)return false;const key=e.key.toLowerCase();if(key===keys.pan&&!e.ctrlKey&&!e.metaKey){e.preventDefault();setSpace(true);return true}if(key===keys.zoomIn||key==='+'||key===keys.zoomOut||key===keys.fit){e.preventDefault();if(key===keys.fit)reset();else zoom(key===keys.zoomOut?1/1.2:1.2);return true}return false},
    keyUp:e=>{if(e.key.toLowerCase()===keys.pan)setSpace(false)},
    down:e=>{if(e.button!==1&&!space)return false;e.preventDefault();drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,view:viewRef.current};canvas.current.setPointerCapture(e.pointerId);return true},
    move:e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return false;setView({...d.view,x:d.view.x+e.clientX-d.x,y:d.view.y+e.clientY-d.y});return true},
    end:e=>{if(drag.current?.id!==e.pointerId)return false;drag.current=null;if(canvas.current.hasPointerCapture(e.pointerId))canvas.current.releasePointerCapture(e.pointerId);return true}}
}
export function SketchViewControls({navigation,t}) {
  const [open,setOpen]=useState(false)
  return <div className="codexSketchViewControls"><button type="button" aria-label={t('sketchZoomOut')} onClick={()=>navigation.zoom(1/1.2)}>−</button><button type="button" title={t('sketchFit')} onClick={navigation.reset}>{Math.round(navigation.view.scale*100)}%</button><button type="button" aria-label={t('sketchZoomIn')} onClick={()=>navigation.zoom(1.2)}>＋</button><button type="button" onClick={()=>setOpen(!open)}>{t('sketchKeys')}</button>{open?<section className="codexSketchKeyPanel" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false)}}}><label><input type="checkbox" checked={navigation.shortcuts} onChange={navigation.toggle}/>{t('sketchKeysEnabled')}</label><p>{t('sketchNavigationHint')}</p>{Object.entries(navigation.keys).map(([action,key])=><label key={action}>{t(`sketchKey_${action}`)}<input aria-label={t(`sketchKey_${action}`)} value={key===' '?'Space':key} readOnly onKeyDown={e=>{if(e.key==='Tab'||e.key==='Escape')return;e.preventDefault();e.stopPropagation();if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey)navigation.setKey(action,e.key)}}/></label>)}<small>{t('sketchKeyHint')}</small></section>:null}</div>
}
