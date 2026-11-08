import { cloneElement, forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDownTrayIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, DocumentDuplicateIcon, PencilSquareIcon, XMarkIcon } from '@heroicons/react/24/outline'

const classes = (...names) => names.filter(Boolean).join(' ')
const icon = (Icon, size) => function ControlIcon() { return <Icon width={size} height={size} aria-hidden="true" /> }
export const IconCheckOutline16 = icon(CheckIcon, 16)
export const IconChevronDownOutline14 = icon(ChevronDownIcon, 14)
export const IconChevronLeftOutline14 = icon(ChevronLeftIcon, 14)
export const IconChevronRightOutline14 = icon(ChevronRightIcon, 14)
export const IconCloseOutline16 = icon(XMarkIcon, 16)
export const IconCopyOutline16 = icon(DocumentDuplicateIcon, 16)
export const IconDownloadOutline16 = icon(ArrowDownTrayIcon, 16)
export const IconEditOutline16 = icon(PencilSquareIcon, 16)

export const Button = forwardRef(function Button({ variant = 'ghost', size = 'md', icon, className, children, ...props }, ref) {
  return <button ref={ref} type="button" className={classes('dcsButton', className)} data-variant={variant} data-size={size} {...props}>
    {icon == null ? null : <span className="dcsButtonIcon">{icon}</span>}{children}
  </button>
})

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <span className={classes('dcsInput', className)}><input ref={ref} {...props} /></span>
})

export function Switch({ checked, onChange, label, disabled, title, className }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} title={title}
    disabled={disabled} className={classes('dcsSwitch', className)} onClick={() => onChange(!checked)}><span /></button>
}

// Keep an overlay inside its slot while the browser handles stacking and clipping.
export function usePopover(panelRef, open) {
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!open || typeof panel?.showPopover !== 'function') return
    panel.showPopover()
    return () => { if (panel.isConnected) panel.hidePopover() }
  }, [panelRef, open])
}

export function useAnchoredPosition({ open, anchorRef, panelRef, side = 'bottom', align = 'start', gap = 6, margin = 12 }) {
  const [position, setPosition] = useState(null)
  useLayoutEffect(() => {
    const anchor = anchorRef.current, panel = panelRef.current
    if (!open || !anchor || !panel) { setPosition(null); return }
    const win = anchor.ownerDocument.defaultView
    const viewport = win.visualViewport
    const update = () => {
      const { left, right, top, bottom } = anchor.getBoundingClientRect()
      const { width, height } = panel.getBoundingClientRect()
      const minLeft = (viewport?.offsetLeft ?? 0) + margin
      const minTop = (viewport?.offsetTop ?? 0) + margin
      const maxLeft = minLeft + (viewport?.width ?? win.innerWidth) - width - margin * 2
      const maxTop = minTop + (viewport?.height ?? win.innerHeight) - height - margin * 2
      const anchorX = align === 'end' ? right - width : align === 'center' ? (left + right - width) / 2 : left
      const above = top - height - gap, below = bottom + gap
      const anchorY = side === 'top' ? (above < minTop && below <= maxTop ? below : above)
        : below > maxTop && above >= minTop ? above : below
      const next = { left: Math.max(minLeft, Math.min(anchorX, maxLeft)), top: Math.max(minTop, Math.min(anchorY, maxTop)) }
      setPosition(previous => previous?.left === next.left && previous?.top === next.top ? previous : next)
    }
    update()
    win.addEventListener('resize', update)
    win.addEventListener('scroll', update, true)
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : undefined
    observer?.observe(anchor)
    observer?.observe(panel)
    return () => {
      observer?.disconnect()
      win.removeEventListener('resize', update)
      win.removeEventListener('scroll', update, true)
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
    }
  }, [open, anchorRef, panelRef, side, align, gap, margin])
  return position
}

export function useDismissOnOutsidePointer(anchor, open, dismiss, panel) {
  useEffect(() => {
    if (!open) return
    const doc = anchor.current?.ownerDocument
    const outside = event => {
      if (!anchor.current?.contains(event.target) && !panel.current?.contains(event.target)) dismiss()
    }
    doc?.addEventListener('pointerdown', outside)
    return () => doc?.removeEventListener('pointerdown', outside)
  }, [anchor, open, dismiss, panel])
}

export function Tooltip({ label, children, side = 'bottom', delayMs = 0, maxWidth, openOnClick = false }) {
  const anchor = useRef(null), panel = useRef(null), timer = useRef()
  const [open, setOpen] = useState(false), [pinned, setPinned] = useState(false)
  const id = useId()
  const originalRef = children.ref
  const setAnchor = useCallback(element => {
    anchor.current = element
    if (typeof originalRef === 'function') originalRef(element)
    else if (originalRef) originalRef.current = element
  }, [originalRef])
  const show = delay => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), delay) }
  const hide = () => { clearTimeout(timer.current); if (!pinned) setOpen(false) }
  const dismiss = () => { clearTimeout(timer.current); setPinned(false); setOpen(false) }
  useEffect(() => () => clearTimeout(timer.current), [])
  usePopover(panel, open)
  const position = useAnchoredPosition({ open, anchorRef: anchor, panelRef: panel, side, align: 'center' })
  useDismissOnOutsidePointer(anchor, pinned, dismiss, panel)
  useEffect(() => {
    if (!open) return
    const doc = anchor.current?.ownerDocument
    const escape = event => {
      if (event.key !== 'Escape') return
      dismiss()
      if (pinned || anchor.current?.contains(doc.activeElement)) { event.preventDefault(); event.stopPropagation() }
    }
    const win = doc?.defaultView
    win?.addEventListener('keydown', escape, true)
    return () => win?.removeEventListener('keydown', escape, true)
  }, [open, pinned])
  const target = cloneElement(children, {
    ref: setAnchor,
    'data-dcs-tooltip-anchor': '',
    'aria-describedby': open ? [children.props['aria-describedby'], id].filter(Boolean).join(' ') : children.props['aria-describedby'],
    'aria-description': children.props['aria-description'] ?? label,
    onPointerEnter: event => { children.props.onPointerEnter?.(event); if (event.pointerType !== 'touch') show(delayMs) },
    onPointerLeave: event => { children.props.onPointerLeave?.(event); hide() },
    onFocus: event => { children.props.onFocus?.(event); show(0) },
    onBlur: event => { children.props.onBlur?.(event); hide() },
    onClick: openOnClick ? event => {
      children.props.onClick?.(event)
      if (event.defaultPrevented) return
      if (pinned) dismiss()
      else { clearTimeout(timer.current); setPinned(true); setOpen(true) }
    } : children.props.onClick,
  })
  const bubble = open ? <span ref={panel} popover="manual" className="dcsTooltip" id={id} role="tooltip"
    data-pinned={pinned || undefined} style={{ ...position, maxWidth: maxWidth ? `min(${maxWidth}px, calc(100vw - 24px))` : undefined, visibility: position ? 'visible' : 'hidden' }}>
    {label}
  </span> : null
  // A disclosure's summary must remain its first direct child, including while closed.
  return children.type === 'summary' ? cloneElement(target, undefined, children.props.children, bubble) : <>{target}{bubble}</>
}

export function Menu({ open, anchor, items, selectedId, onSelect, onClose, align = 'start', side = 'bottom' }) {
  const trigger = useRef(null), panel = useRef(null)
  const [submenu, setSubmenu] = useState()
  const id = useId()
  const menuItems = () => [...panel.current.querySelectorAll('button[role^="menuitem"]:not(:disabled)')]
  const dismiss = (restoreFocus = false) => {
    setSubmenu(undefined)
    onClose()
    if (restoreFocus) trigger.current?.focus()
  }
  usePopover(panel, open)
  const position = useAnchoredPosition({ open, anchorRef: trigger, panelRef: panel, side, align })
  useDismissOnOutsidePointer(trigger, open, dismiss, panel)
  const positioned = position !== null
  useLayoutEffect(() => {
    if (!open || !positioned) return
    const choices = menuItems()
    const current = choices.find(item => item.getAttribute('aria-checked') === 'true') ?? choices[0] ?? panel.current
    current.focus()
  }, [open, positioned])
  useLayoutEffect(() => {
    if (open && submenu) panel.current.querySelector('[data-submenu-item]:not(:disabled)')?.focus()
  }, [open, submenu])
  useEffect(() => {
    if (!open) setSubmenu(undefined)
  }, [open])
  const closeSubmenu = () => {
    panel.current.querySelector('[aria-expanded="true"]')?.focus()
    setSubmenu(undefined)
  }
  useEffect(() => {
    if (!open) return
    const win = trigger.current?.ownerDocument.defaultView
    const escape = event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      if (submenu) closeSubmenu()
      else dismiss(true)
    }
    win?.addEventListener('keydown', escape, true)
    return () => win?.removeEventListener('keydown', escape, true)
  }, [open, submenu, onClose])
  const walk = event => {
    const { key, target } = event
    if (key === 'Tab') { dismiss(true); return }
    if (key === 'ArrowRight' && target.hasAttribute('aria-expanded')) { event.preventDefault(); target.click(); return }
    if (key === 'ArrowLeft' && submenu) { event.preventDefault(); closeSubmenu(); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return
    event.preventDefault()
    const choices = menuItems(), current = choices.indexOf(target)
    const next = key === 'Home' ? 0 : key === 'End' ? choices.length - 1
      : (current + (key === 'ArrowUp' ? -1 : 1) + choices.length) % choices.length
    choices[next]?.focus()
  }
  const rows = (entries, nested = false) => entries.map(item => {
    if (item.type === 'separator') return <div key={item.id} role="separator" className="dcsMenuSeparator" />
    if (item.type === 'label') return <div key={item.id} className="dcsMenuLabel">{item.text}</div>
    const selected = item.id === selectedId, expanded = submenu === item.id
    return <div role="none" key={item.id}>
      <button type="button" role={item.submenu ? 'menuitem' : 'menuitemradio'} tabIndex={-1}
        aria-checked={item.submenu ? undefined : selected} aria-haspopup={item.submenu ? 'menu' : undefined}
        aria-expanded={item.submenu ? expanded : undefined} data-submenu-item={nested || undefined}
        disabled={item.disabled} onClick={() => {
          if (item.submenu) { setSubmenu(expanded ? undefined : item.id); return }
          setSubmenu(undefined)
          trigger.current?.focus()
          onSelect(item.id)
        }}>
        <span>{item.label}</span>{item.submenu ? <IconChevronRightOutline14 /> : selected ? <IconCheckOutline16 /> : null}
      </button>
      {item.submenu && expanded ? <div role="menu" aria-label={typeof item.label === 'string' ? item.label : undefined} className="dcsMenuChildren">{rows(item.submenu, true)}</div> : null}
    </div>
  })
  return <>
    {cloneElement(anchor, { ref: trigger, 'aria-haspopup': 'menu', 'aria-controls': open ? id : undefined, onKeyDown: event => {
      anchor.props.onKeyDown?.(event)
      if (!event.defaultPrevented && !open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault()
        anchor.props.onClick?.(event)
      }
    } })}
    {open ? <div ref={panel} id={id} popover="manual" className="dcsMenu" role="menu" aria-label={anchor.props['aria-label']} tabIndex={-1}
      style={{ ...position, visibility: position ? 'visible' : 'hidden' }} onKeyDown={walk}>{rows(items)}</div> : null}
  </>
}

export function ImageLightbox({ src, alt, labels, onClose }) {
  const dialog = useRef(null)
  useLayoutEffect(() => {
    const element = dialog.current, opener = element.ownerDocument.activeElement
    element.showModal()
    element.querySelector('button')?.focus()
    return () => { element.close(); if (opener?.isConnected) opener.focus() }
  }, [])
  return <dialog ref={dialog} className="dcsLightbox" aria-label={labels.dialog} onCancel={event => {
    event.preventDefault()
    event.stopPropagation()
    onClose()
  }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <img src={src} alt={alt} />
    <button type="button" aria-label={labels.close} onClick={onClose}><IconCloseOutline16 /></button>
  </dialog>
}
