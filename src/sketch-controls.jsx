import { SketchToolPicker } from './sketch-tool-picker.jsx'
import { SketchViewControls } from './sketch-view.jsx'

const PALETTE = [
  '#18181b',
  '#929398',
  '#ff3936',
  '#ff9500',
  '#ffcc00',
  '#34c759',
  '#0088ff'
]

export function SketchControls({
  t,
  navigation,
  picturesOpen,
  setPicturesOpen,
  disabled,
  tool,
  brush,
  chooseBrush,
  chooseTool,
  shapesOpen,
  setShapesOpen,
  fillShape,
  setFillShape,
  selected,
  editObject,
  selection,
  setTextEdit,
  stability,
  setStability,
  eraser,
  setEraser,
  color,
  pickColor
}) {
  return (
    <div className="codexSketchControls">
      <button
        type="button"
        className="codexSketchPicturesToggle"
        aria-expanded={picturesOpen}
        onClick={() => setPicturesOpen((value) => !value)}
      >
        {t('sketchPictures')}
      </button>
      <SketchViewControls navigation={navigation} t={t} />
      <SketchToolPicker
        t={t}
        disabled={disabled}
        tool={tool}
        brush={brush}
        chooseBrush={chooseBrush}
        chooseTool={chooseTool}
        shapesOpen={shapesOpen}
        setShapesOpen={setShapesOpen}
      />
      <div className="codexLayerBrush">
        {['rectangle', 'circle'].includes(tool) ? (
          <label>
            <input
              type="checkbox"
              disabled={disabled}
              checked={fillShape}
              onChange={(event) => setFillShape(event.target.checked)}
            />
            {t('sketchFill')}
          </label>
        ) : null}
        {selected ? (
          <div className="codexSketchObjectActions">
            <button
              disabled={disabled}
              onClick={() => editObject({}, 'duplicate')}
            >
              {t('sketchObjectDuplicate')}
            </button>
            <button disabled={disabled} onClick={() => editObject({}, 'delete')}>
              {t('sketchObjectDelete')}
            </button>
            {selected.shape === 'text' ? (
              <button
                disabled={disabled}
                onClick={() => setTextEdit({ selection, value: selected.text })}
              >
                {t('sketchText')}
              </button>
            ) : null}
          </div>
        ) : null}
        {tool === 'pen' ? (
          <label className="codexSketchStability">
            {t('sketchStability')}
            <select
              aria-label={t('sketchStability')}
              value={stability}
              disabled={disabled}
              onChange={(event) => setStability(Number(event.target.value))}
            >
              {[0, 25, 50, 75].map((value) => (
                <option key={value} value={value}>
                  {t(`sketchStability${value}`)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {tool === 'eraser' ? (
          <div
            className="codexSketchSegment"
            role="group"
            aria-label={t('sketchEraserMode')}
          >
            {['pixel', 'stroke'].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={eraser === value}
                disabled={disabled}
                onClick={() => setEraser(value)}
              >
                {t(`sketchErase_${value}`)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div
        className="codexSketchPalette"
        role="group"
        aria-label={t('sketchColor')}
      >
        {PALETTE.map((value) => (
          <button
            type="button"
            key={value}
            className="codexSketchSwatch"
            style={{ '--swatch': value }}
            aria-label={`${t('sketchColor')} ${value}`}
            aria-pressed={(selected?.color ?? color) === value}
            disabled={disabled}
            onClick={() => pickColor(value)}
          />
        ))}
        <label className="codexSketchCustom" title={t('sketchColor')}>
          <span style={{ background: color }} />
          <input
            type="color"
            aria-label={t('sketchColor')}
            value={color}
            disabled={disabled}
            onChange={(event) => pickColor(event.target.value)}
          />
        </label>
      </div>
    </div>
  )
}
