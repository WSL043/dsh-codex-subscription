import { useEffect, useState } from 'react'

// Keep a usable preview during refresh; stale resolutions cannot replace a new image.
export function useImageSource(load, identity, preview) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ identity, src: preview, failed: false, usable: false })
  useEffect(() => {
    let live = true
    setState(previous => ({ identity, src: previous.identity === identity ? previous.src : preview, failed: false,
      usable: previous.identity === identity && previous.usable }))
    Promise.resolve().then(() => attempt === 0 && preview ? preview : load())
      .then(src => { if (live) setState(previous => ({ identity, src, failed: !src, usable: previous.identity === identity && previous.src === src && previous.usable })) }, () => {
        if (live) setState(previous => ({ ...previous, failed: true }))
      })
    return () => { live = false }
  }, [identity, load, preview, attempt])
  return {
    src: state.identity === identity ? state.src : preview,
    failed: state.identity === identity && state.failed,
    usable: state.identity === identity && state.usable,
    loaded: () => setState(previous => previous.identity === identity ? { ...previous, usable: true } : previous),
    fail: () => setState(previous => previous.identity === identity ? { ...previous, failed: true, usable: false } : previous),
    retry: () => setAttempt(value => value + 1),
    attempt,
  }
}
