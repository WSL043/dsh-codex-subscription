// Adapted from dsh-image-viewer 0.1.0 MIT.

import { useCallback, useEffect, useRef, useState } from 'react'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const fitted = () => ({ zoom: 1, x: 0, y: 0 })

// Coordinates are relative to the fitted image; 100% uses its decoded pixel width.
export function useImageTransform(identity) {
  const [transform, setTransform] = useState(fitted)
  const [dragging, setDragging] = useState(false)
  const [pixelScale, setPixelScale] = useState(1)
  const [geometry, setGeometry] = useState({ width: 0, height: 0, stageWidth: 0, stageHeight: 0 })
  const stageRef = useRef(null), surfaceRef = useRef(null), imageRef = useRef(null)
  const transformRef = useRef(transform)
  const pointers = useRef(new Map()), gesture = useRef()
  transformRef.current = transform

  const resetGesture = useCallback(() => {
    pointers.current.clear()
    gesture.current = undefined
    setDragging(false)
  }, [])
  const fit = useCallback(() => { resetGesture(); setTransform(fitted()) }, [resetGesture])
  useEffect(() => { fit() }, [identity, fit])

  const actualScale = () => imageRef.current?.naturalWidth / Math.max(1, surfaceRef.current?.offsetWidth || 1) || 1
  const boundedPan = useCallback((zoom, x, y) => {
    const stage = stageRef.current, surface = surfaceRef.current
    if (!stage || !surface || zoom <= 1) return { x: 0, y: 0 }
    const limitX = Math.max(0, (surface.offsetWidth * zoom - stage.clientWidth) / 2)
    const limitY = Math.max(0, (surface.offsetHeight * zoom - stage.clientHeight) / 2)
    return { x: clamp(x, -limitX, limitX), y: clamp(y, -limitY, limitY) }
  }, [])
  const setZoomAt = useCallback((zoom, clientX, clientY) => {
    const stage = stageRef.current
    if (!stage) return
    setTransform(current => {
      const next = clamp(zoom, 0.5, Math.max(8, actualScale()))
      const box = stage.getBoundingClientRect()
      const px = clientX - box.left - box.width / 2, py = clientY - box.top - box.height / 2
      const ratio = next / current.zoom
      return { zoom: next, ...boundedPan(next, px - (px - current.x) * ratio, py - (py - current.y) * ratio) }
    })
  }, [boundedPan])
  const actual = useCallback(() => {
    if (!imageRef.current?.naturalWidth) return
    resetGesture()
    setTransform({ zoom: actualScale(), x: 0, y: 0 })
  }, [resetGesture])
  const measure = useCallback(() => {
    const next = { width: surfaceRef.current?.offsetWidth ?? 0, height: surfaceRef.current?.offsetHeight ?? 0,
      stageWidth: stageRef.current?.clientWidth ?? 0, stageHeight: stageRef.current?.clientHeight ?? 0 }
    setGeometry(current => Object.keys(next).every(key => current[key] === next[key]) ? current : next)
    setPixelScale(1 / actualScale())
    setTransform(current => ({ ...current, ...boundedPan(current.zoom, current.x, current.y) }))
  }, [boundedPan])
  useEffect(() => {
    if (!stageRef.current || !surfaceRef.current) return
    const observer = new ResizeObserver(measure)
    observer.observe(stageRef.current)
    observer.observe(surfaceRef.current)
    measure()
    return () => observer.disconnect()
  }, [identity, measure])
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const wheel = event => {
      event.preventDefault()
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1)
      setZoomAt(transformRef.current.zoom * Math.exp(-delta * 0.0015), event.clientX, event.clientY)
    }
    stage.addEventListener('wheel', wheel, { passive: false })
    return () => stage.removeEventListener('wheel', wheel)
  }, [identity, setZoomAt])

  const onPointerDown = event => {
    if (event.button !== 0 || event.target.closest('button,a,input,textarea,select')) return
    const current = transformRef.current
    if (event.pointerType === 'mouse' && current.zoom <= 1) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = { kind: 'pinch', distance: Math.hypot(a.x - b.x, a.y - b.y), transform: current }
    } else {
      gesture.current = { kind: 'pan', x: event.clientX, y: event.clientY, transform: current }
    }
    setDragging(true)
  }
  const onPointerMove = event => {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const start = gesture.current
    if (start?.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      setZoomAt(start.transform.zoom * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, start.distance), (a.x + b.x) / 2, (a.y + b.y) / 2)
    } else if (start?.kind === 'pan') {
      setTransform({ zoom: start.transform.zoom, ...boundedPan(start.transform.zoom, start.transform.x + event.clientX - start.x, start.transform.y + event.clientY - start.y) })
    }
  }
  const endPointer = event => {
    pointers.current.delete(event.pointerId)
    const remaining = [...pointers.current.values()][0]
    if (remaining) gesture.current = { kind: 'pan', ...remaining, transform: transformRef.current }
    else resetGesture()
  }
  return { transform, transformRef, dragging, pixelScale, geometry, stageRef, surfaceRef, imageRef, fit, actual, measure, setZoomAt, resetGesture,
    pointerHandlers: { onPointerDown, onPointerMove, onPointerUp: endPointer, onPointerCancel: endPointer, onLostPointerCapture: endPointer } }
}
