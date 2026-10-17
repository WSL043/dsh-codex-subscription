import { useId, useLayoutEffect, useRef, useState } from 'react'

/** A setting's explanation: shows up to two lines; a "More" link appears only when the text is actually cut off. */
export function Hint({ children, t, as: Tag = 'span' }) {
  const [open, setOpen] = useState(false)
  const [clipped, setClipped] = useState(false)
  const text = useRef(null)
  const id = useId()
  const foldable = typeof children === 'string'
  useLayoutEffect(() => {
    const node = text.current
    if (!foldable || node === null || open) return
    const measure = () => setClipped(node.scrollHeight > node.clientHeight + 1)
    measure()
    if (typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [children, foldable, open])
  if (!foldable) return <Tag className="codexSubscriptionPreferenceHint">{children}</Tag>
  return <Tag className="codexSubscriptionPreferenceHint codexSubscriptionHintFold" data-open={open || undefined}>
    <span id={id} ref={text} className="codexSubscriptionHintText">{children}</span>
    {clipped || open ? <button type="button" className="codexSubscriptionHintToggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>{t(open ? 'hintLess' : 'hintMore')}</button> : null}
  </Tag>
}
