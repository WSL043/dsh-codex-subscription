import { useId, useLayoutEffect, useRef, useState } from 'react'

// A fold has to be worth it: text that fits in five lines is shown whole; longer text folds to three lines (so at least
// three lines are saved) and gets a "More" link.
export const MIN_FOLD_LINES = 6
export const FOLDED_LINES = 3

/** A setting's explanation: short text is shown whole; only text that would save several lines when folded gets a "More" link. */
export function Hint({ children, t, as: Tag = 'span' }) {
  const [open, setOpen] = useState(false)
  const [lines, setLines] = useState(0)
  const text = useRef(null)
  const id = useId()
  const foldable = typeof children === 'string'
  useLayoutEffect(() => {
    const node = text.current
    if (!foldable || node === null) return
    // scrollHeight is the whole text's height whether or not it is currently folded.
    const measure = () => setLines(Math.round(node.scrollHeight / (Number.parseFloat(getComputedStyle(node).lineHeight) || 17)))
    measure()
    if (typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [children, foldable])
  if (!foldable) return <Tag className="codexSubscriptionPreferenceHint">{children}</Tag>
  const folds = lines >= MIN_FOLD_LINES
  return <Tag className="codexSubscriptionPreferenceHint codexSubscriptionHintFold" data-fold={folds && !open ? 'true' : undefined} data-open={open || undefined}>
    <span id={id} ref={text} className="codexSubscriptionHintText">{children}</span>
    {folds ? <button type="button" className="codexSubscriptionHintToggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>{t(open ? 'hintLess' : 'hintMore')}</button> : null}
  </Tag>
}
