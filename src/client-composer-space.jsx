import { useLayoutEffect, useRef } from 'react'

const RESTORE_MARGIN = 8
const toolbars = new WeakMap()

export function ComposerControl({ children, priority, onHide }) {
  const element = useRef(null)
  const hide = useRef(onHide)
  hide.current = onHide
  useLayoutEffect(() => {
    const control = element.current
    let row = control.parentElement
    while (row) {
      const style = getComputedStyle(row)
      if (style.display === 'flex' && style.flexWrap === 'wrap') break
      row = row.parentElement
    }
    if (!row) return
    let owner = toolbars.get(row)
    if (!owner) {
      owner = observeToolbar(row)
      toolbars.set(row, owner)
    }
    owner.controls.set(control, { priority, onHide: () => hide.current?.() })
    owner.update()
    return () => {
      owner.controls.delete(control)
      if (owner.controls.size) owner.update()
      else { owner.dispose(); toolbars.delete(row) }
    }
  }, [priority])
  return <span ref={element} style={{ display: 'contents' }} data-codex-composer-control="">{children}</span>
}

function observeToolbar(row) {
  const controls = new Map()
  const update = () => {
    const ordered = [...controls].sort((a, b) => b[1].priority - a[1].priority)
    const visible = new Set(ordered.filter(([control]) => control.style.display !== 'none').map(([control]) => control))
    for (const [control] of ordered) control.style.display = 'none'
    const style = getComputedStyle(row)
    const available = row.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    const groups = [...row.children].filter(child => getComputedStyle(child).display !== 'none')
    const gaps = (parseFloat(style.columnGap) || 0) * Math.max(0, groups.length - 1)
    for (const [control] of ordered) {
      control.style.display = 'contents'
      const needed = groups.reduce((sum, group) => sum + Math.max(group.getBoundingClientRect().width, group.scrollWidth), 0)
        + gaps
      if (needed + (visible.has(control) ? 0 : RESTORE_MARGIN) > available) {
        control.style.display = 'none'
        break
      }
    }
    for (const [control, { onHide }] of ordered) {
      if (control.style.display === 'none' && visible.has(control)) onHide()
    }
  }
  // ResizeObserver runs before paint; deferring this work to rAF exposes a wrapped frame.
  let width, reconnectFrame
  const resize = new ResizeObserver(([entry]) => {
    if (entry.contentRect.width === width) return
    width = entry.contentRect.width
    // Do not observe the height change caused by removing a wrapped control.
    resize.unobserve(row)
    update()
    reconnectFrame = requestAnimationFrame(() => resize.observe(row))
  })
  resize.observe(row)
  const mutation = new MutationObserver(update)
  mutation.observe(row, { childList: true, subtree: true, characterData: true })
  return { controls, update, dispose() { cancelAnimationFrame(reconnectFrame); resize.disconnect(); mutation.disconnect() } }
}
