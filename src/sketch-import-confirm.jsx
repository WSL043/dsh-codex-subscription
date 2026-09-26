import { useEffect, useRef, useState } from 'react'

export function useSketchImportConfirm(t) {
  const [pending, setPending] = useState(false)
  const resolve = useRef(null)
  const dialog = useRef(null)
  const finish = accepted => {
    const done = resolve.current
    resolve.current = null
    setPending(false)
    done?.(accepted)
  }
  useEffect(() => {
    if (pending) dialog.current?.showModal()
    else dialog.current?.close()
  }, [pending])
  useEffect(() => () => { resolve.current?.(false); resolve.current = null }, [])
  return {
    confirmPsd: () => new Promise(done => {
      resolve.current?.(false)
      resolve.current = done
      setPending(true)
    }),
    prompt: <dialog ref={dialog} className="codexSketchImportConfirm" aria-label={t('sketchPsdConfirmTitle')}
      onKeyDown={event => event.stopPropagation()}
      onCancel={event => { event.preventDefault(); event.stopPropagation(); finish(false) }}>
      <h3>{t('sketchPsdConfirmTitle')}</h3>
      <p>{t('sketchPsdConfirmBody')}</p>
      <div><button type="button" autoFocus onClick={() => finish(false)}>{t('sketchCancel')}</button>
        <button type="button" onClick={() => finish(true)}>{t('sketchImport')}</button></div>
    </dialog>,
  }
}
