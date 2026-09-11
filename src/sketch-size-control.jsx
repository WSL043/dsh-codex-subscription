import { useRef } from 'react'

// Native range keeps keyboard/accessibility behavior; one history entry per drag.
export function SketchSizeControl({value,onChange,onStart,onEnd,label,disabled,min=2,max=128,mode,modes,onModeChange,suffix=''}) {
  const active=useRef(false)
  const start=()=>{if(!active.current){active.current=true;onStart?.()}}
  const end=()=>{if(active.current){active.current=false;onEnd?.()}}
  return <div className="codexSketchSizeControl" title={label}>
    {modes?<div className="codexSketchSizeModes">{modes.map(item=><button key={item.value} type="button" aria-pressed={mode===item.value} disabled={disabled} onClick={()=>{end();onModeChange(item.value)}}>{item.label}</button>)}</div>:<span>{label}</span>}
    <input type="range" aria-label={label} aria-orientation="vertical" min={min} max={max} value={value} disabled={disabled}
      onPointerDown={start} onPointerUp={end} onPointerCancel={end} onBlur={end}
      onKeyDown={start} onKeyUp={end} onChange={event=>{start();onChange(Number(event.target.value))}} />
    <output>{Math.round(value)}{suffix}</output>
  </div>
}
