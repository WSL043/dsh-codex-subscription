import { useEffect, useMemo, useRef, useState } from 'react'
import { paintSketchLayers } from './sketch-layer-renderer.js'
import { SKETCH_SIZE } from './sketch-document.js'
import { planReplay, replayFrame, replaySteps } from './sketch-replay.js'
import { WorkspaceIcon } from './workspace-icons.jsx'

const SPEEDS = [['fast', 12_000, 'sketchReplayFast'], ['normal', 30_000, 'sketchReplayNormal'], ['slow', 60_000, 'sketchReplaySlow']]
const VIDEO_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']

// Plays back how the drawing was made, stroke by stroke, and can record the playback as a video.
export function SketchReplay({ states, current, images, name, onClose, t }) {
  const dialog = useRef(null)
  const canvas = useRef(null)
  const cache = useRef(new Map())
  const clock = useRef({ time: 0, capture: null })
  const [speed, setSpeed] = useState('normal')
  const [playing, setPlaying] = useState(true)
  const [recording, setRecording] = useState(false)
  const [progress, setProgress] = useState(0)
  const [note, setNote] = useState('')
  const [video, setVideo] = useState(null)
  const width = current.width ?? SKETCH_SIZE, height = current.height ?? SKETCH_SIZE
  const duration = SPEEDS.find(item => item[0] === speed)[1]
  const steps = useMemo(() => replaySteps([...states, current]), [states, current])
  const plan = useMemo(() => planReplay(steps, duration, width, height), [steps, duration, width, height])
  const total = plan.at(-1)?.end ?? 0

  useEffect(() => {
    const node = dialog.current
    node.showModal()
    return () => node.close()
  }, [])

  const paint = time => {
    const target = canvas.current
    if (!target) return
    const frame = replayFrame(plan, time)
    paintSketchLayers(target.getContext('2d'), frame?.doc ?? current, cache.current, width, height, frame?.moving, images)
  }

  useEffect(() => {
    clock.current.time = 0
    cache.current.clear()
    setProgress(0)
  }, [plan])

  useEffect(() => {
    if (video || !total) return
    const state = clock.current
    if (!playing) { paint(state.time); return }
    let frame = 0, last, lastPaint = -Infinity, lastProgress = -Infinity
    const tick = now => {
      state.time = Math.min(total, state.time + (last === undefined ? 0 : now - last))
      last = now
      const finished = state.time >= total
      if (finished || now - lastPaint >= 1000 / 30 - 1) {
        paint(state.time)
        lastPaint = now
      }
      if (finished || now - lastProgress >= 100) {
        setProgress(state.time / total)
        lastProgress = now
      }
      if (finished) {
        setPlaying(false)
        const capture = state.capture
        if (capture) capture.timer = setTimeout(() => endRecording(), 250)
      } else {
        frame = requestAnimationFrame(tick)
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [plan, playing, video])

  useEffect(() => () => { if (video) URL.revokeObjectURL(video.url) }, [video])
  useEffect(() => () => endRecording(true), [])

  function endRecording(discard = false) {
    const capture = clock.current.capture
    if (!capture) return
    clearTimeout(capture.timer)
    if (discard) {
      clock.current.capture = null
      capture.recorder.onstop = null
    }
    if (capture.recorder.state !== 'inactive') capture.recorder.stop()
    if (discard) for (const track of capture.stream.getTracks()) track.stop()
  }

  const toggle = () => {
    const state = clock.current
    if (state.time >= total) { state.time = 0; cache.current.clear(); setProgress(0) }
    setPlaying(value => !value)
  }
  const seek = value => {
    clock.current.time = value * total
    setPlaying(false)
    cache.current.clear()
    paint(clock.current.time)
    setProgress(value)
  }
  const record = () => {
    if (recording) { endRecording(); return }
    const type = VIDEO_TYPES.find(item => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(item))
    if (!type || !canvas.current?.captureStream) { setNote(t('sketchReplayUnsupported')); return }
    setNote('')
    const chunks = []
    let stream, recorder
    try {
      stream = canvas.current.captureStream(30)
      recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 })
      recorder.start(250)
    } catch {
      for (const track of stream?.getTracks() ?? []) track.stop()
      setNote(t('sketchReplayUnsupported'))
      return
    }
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    recorder.onstop = () => {
      clock.current.capture = null
      for (const track of stream.getTracks()) track.stop()
      setRecording(false)
      // Nothing is saved on its own: the video appears here and the person decides whether to save it.
      setVideo({ url: URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })), file: `${(name || 'sketch').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').slice(0, 80)}-${t('sketchReplayFileSuffix')}.webm` })
    }
    clock.current.time = 0
    cache.current.clear()
    clock.current.capture = { recorder, stream }
    paint(0)
    setProgress(0)
    setPlaying(true)
    setRecording(true)
  }
  const stop = () => { endRecording(true); onClose() }

  const clock0 = Math.round(progress * total / 1000), clock1 = Math.round(total / 1000)
  const mmss = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  return (
    <dialog ref={dialog} className="codexSketchReplay" aria-label={t('sketchReplayTitle')} onCancel={event => { event.preventDefault(); event.stopPropagation(); stop() }}>
      <header>
        <strong>{t('sketchReplayTitle')}</strong>
        <button type="button" className="codexSketchReplayClose" onClick={stop} aria-label={t('sketchReplayClose')}><WorkspaceIcon name="close" size={18} /><span>{t('sketchReplayClose')}</span></button>
      </header>
      {video ? <>
        <div className="codexSketchReplayStage"><video src={video.url} controls autoPlay loop /></div>
        <div className="codexSketchReplayBar">
          <a className="codexSketchReplaySave" href={video.url} download={video.file}>{t('sketchReplaySave')}</a>
          <button type="button" onClick={() => setVideo(null)}>{t('sketchReplayAgain')}</button>
        </div>
      </> : steps.length === 0 ? <p>{t('sketchReplayEmpty')}</p> : <>
        <div className="codexSketchReplayStage"><canvas ref={canvas} width={width} height={height} style={{ aspectRatio: `${width} / ${height}`, width: `min(100cqw, calc(100cqh * ${width / height}))` }} /></div>
        <div className="codexSketchReplayBar">
          <button type="button" className="codexSketchReplayPlay" disabled={recording} onClick={toggle} aria-label={playing ? t('sketchReplayPause') : t('sketchReplayPlay')}><WorkspaceIcon name={playing ? 'pause' : 'play'} size={18} /></button>
          <span className="codexSketchReplayTime">{mmss(clock0)} / {mmss(clock1)}</span>
          <input type="range" min="0" max="1" step="0.001" value={progress} disabled={recording} aria-label={t('sketchReplayTitle')} onChange={event => seek(Number(event.target.value))} />
          <div className="codexSketchSegment" role="group" aria-label={t('sketchReplaySpeed')}>
            {SPEEDS.map(([value, , label]) => <button key={value} type="button" aria-pressed={speed === value} disabled={recording} onClick={() => setSpeed(value)}>{t(label)}</button>)}
          </div>
          <button type="button" className="codexSketchReplayRecord" title={t('sketchReplayHint')} data-recording={recording || undefined} onClick={record}><i aria-hidden="true" />{recording ? t('sketchReplayStopRecording') : t('sketchReplayRecord')}</button>
        </div>
        {note ? <small role="alert">{note}</small> : null}
      </>}
    </dialog>
  )
}
