import { useEffect, useMemo, useRef, useState } from 'react'
import { paintSketchLayers } from './sketch-layer-renderer.js'
import { SKETCH_SIZE } from './sketch-document.js'
import { planReplay, replayFrame, replaySteps } from './sketch-replay.js'

const SPEEDS = [['fast', 12_000, 'sketchReplayFast'], ['normal', 30_000, 'sketchReplayNormal'], ['slow', 60_000, 'sketchReplaySlow']]
const VIDEO_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']

// Plays back how the drawing was made, stroke by stroke, and can record the playback as a video.
export function SketchReplay({ states, current, images, name, onClose, t }) {
  const canvas = useRef(null)
  const cache = useRef(new Map())
  const clock = useRef({ time: 0, last: 0, playing: true, recorder: null })
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

  const paint = time => {
    const target = canvas.current
    if (!target) return
    const frame = replayFrame(plan, time)
    paintSketchLayers(target.getContext('2d'), frame?.doc ?? current, cache.current, width, height, frame?.moving, images)
  }

  useEffect(() => {
    clock.current.time = 0
    clock.current.last = 0
    cache.current.clear()
    let frame = 0
    const tick = now => {
      const state = clock.current
      if (state.playing) {
        state.time = Math.min(total, state.time + (state.last ? now - state.last : 0))
        if (state.time >= total) {
          state.playing = false
          setPlaying(false)
          if (state.recorder) window.setTimeout(() => state.recorder?.stop(), 600)
        }
      }
      state.last = now
      paint(state.time)
      setProgress(total ? state.time / total : 1)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [plan])

  useEffect(() => () => { if (video) URL.revokeObjectURL(video.url) }, [video])
  useEffect(() => () => { if (clock.current.recorder?.state === 'recording') { clock.current.recorder.onstop = null; clock.current.recorder.stop() } }, [])

  const toggle = () => {
    const state = clock.current
    if (state.time >= total) { state.time = 0; cache.current.clear() }
    state.playing = !state.playing
    setPlaying(state.playing)
  }
  const seek = value => {
    clock.current.time = value * total
    clock.current.playing = false
    setPlaying(false)
    cache.current.clear()
  }
  const record = () => {
    if (recording) { clock.current.recorder?.stop(); return }
    const type = VIDEO_TYPES.find(item => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(item))
    if (!type || !canvas.current?.captureStream) { setNote(t('sketchReplayUnsupported')); return }
    setNote('')
    const chunks = []
    const recorder = new MediaRecorder(canvas.current.captureStream(30), { mimeType: type, videoBitsPerSecond: 8_000_000 })
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    recorder.onstop = () => {
      clock.current.recorder = null
      setRecording(false)
      // Nothing is saved on its own: the video appears here and the person decides whether to save it.
      setVideo({ url: URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })), file: `${(name || 'sketch').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').slice(0, 80)}-${t('sketchReplayFileSuffix')}.webm` })
    }
    clock.current.time = 0
    clock.current.playing = true
    cache.current.clear()
    clock.current.recorder = recorder
    setPlaying(true)
    setRecording(true)
    recorder.start(250)
  }
  const stop = () => { if (clock.current.recorder?.state === 'recording') { clock.current.recorder.onstop = null; clock.current.recorder.stop(); clock.current.recorder = null; setRecording(false) } onClose() }

  return (
    <section className="codexSketchReplay" role="dialog" aria-label={t('sketchReplayTitle')}>
      <header>
        <strong>{t('sketchReplayTitle')}</strong>
        <button type="button" onClick={stop}>{t('sketchReplayClose')}</button>
      </header>
      {video ? <>
        <video src={video.url} controls autoPlay loop style={{ flex: 1, minHeight: 0, maxWidth: '100%', borderRadius: 8 }} />
        <div className="codexSketchReplayBar">
          <a className="codexSketchReplaySave" href={video.url} download={video.file}>{t('sketchReplaySave')}</a>
          <button type="button" onClick={() => setVideo(null)}>{t('sketchReplayAgain')}</button>
        </div>
        <small>{t('sketchReplaySaveHint')}</small>
      </> : steps.length === 0 ? <p>{t('sketchReplayEmpty')}</p> : <>
        <canvas ref={canvas} width={width} height={height} style={{ aspectRatio: `${width} / ${height}` }} />
        <div className="codexSketchReplayBar">
          <button type="button" disabled={recording} onClick={toggle}>{playing ? t('sketchReplayPause') : t('sketchReplayPlay')}</button>
          <input type="range" min="0" max="1" step="0.001" value={progress} disabled={recording} aria-label={t('sketchReplayTitle')} onChange={event => seek(Number(event.target.value))} />
          <div className="codexSketchSegment" role="group" aria-label={t('sketchReplaySpeed')}>
            {SPEEDS.map(([value, , label]) => <button key={value} type="button" aria-pressed={speed === value} disabled={recording} onClick={() => setSpeed(value)}>{t(label)}</button>)}
          </div>
          <button type="button" onClick={record}>{recording ? t('sketchReplayStopRecording') : t('sketchReplayRecord')}</button>
        </div>
        {note ? <small role="alert">{note}</small> : <small>{t('sketchReplayHint')}</small>}
      </>}
    </section>
  )
}
