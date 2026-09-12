import { WorkspaceIcon } from './workspace-icons.jsx'
import { MAX_SKETCH_LAYERS, strokeCount } from './sketch-layers.js'
import { MAX_SKETCH_STROKES } from './sketch-document.js'

export function SketchLayerPanel({ document, disabled, change, t }) {
  const current = document.layers.find((layer) => layer.id === document.active)
  return (
    <aside className="codexSketchLayers" aria-label={t('sketchLayers')}>
      <header>
        <strong>{t('sketchLayers')}</strong>
        <button
          type="button"
          title={t('sketchLayerAdd')}
          aria-label={t('sketchLayerAdd')}
          disabled={disabled || document.layers.length >= MAX_SKETCH_LAYERS}
          onClick={() => change('add')}
        >
          ＋
        </button>
      </header>
      <div className="codexLayerList">
        {document.layers
          .slice()
          .reverse()
          .map((layer) => (
            <div
              key={layer.id}
              className="codexLayerRow"
              data-active={layer.id === document.active}
            >
              <button
                type="button"
                disabled={disabled}
                aria-label={`${t('sketchLayerVisible')} ${layer.id}`}
                aria-pressed={layer.visible}
                onClick={() => change('visible', layer.id)}
              >
                <WorkspaceIcon
                  name={layer.visible ? 'eye' : 'eyeOff'}
                  size={18}
                />
              </button>
              <button
                type="button"
                disabled={disabled}
                aria-pressed={layer.id === document.active}
                onClick={() => change('select', layer.id)}
              >
                {layer.name || `${t('sketchLayer')} ${layer.id}`}
              </button>
            </div>
          ))}
      </div>
      <label className="codexSketchLayerLabel">{t('sketchLayerName')}</label>
      <input
        key={current.id + '-' + current.name}
        disabled={disabled}
        aria-label={t('sketchLayerName')}
        defaultValue={current.name}
        placeholder={`${t('sketchLayer')} ${current.id}`}
        maxLength={40}
        onBlur={(e) => {
          if (e.target.value !== current.name)
            change('rename', current.id, e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
      <div className="codexLayerActions">
        {['duplicate', 'up', 'down', 'delete'].map((action) => (
          <button
            type="button"
            key={action}
            title={t(`sketchLayer_${action}`)}
            aria-label={t(`sketchLayer_${action}`)}
            disabled={
              disabled ||
              (action === 'delete' && document.layers.length === 1) ||
              (action === 'duplicate' &&
                (document.layers.length >= MAX_SKETCH_LAYERS ||
                  strokeCount(document) + current.strokes.length >
                    MAX_SKETCH_STROKES)) ||
              (action === 'up' && current === document.layers.at(-1)) ||
              (action === 'down' && current === document.layers[0])
            }
            onClick={() => change(action)}
          >
            <WorkspaceIcon
              name={action === 'delete' ? 'clear' : action}
              size={17}
            />
            <span>{t(`sketchLayer_${action}`)}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="codexSketchClearLayer"
        disabled={disabled || (!current.strokes.length && !current.image)}
        onClick={() => change('clear')}
      >
        <WorkspaceIcon name="clear" size={16} />
        {t('sketchClearLayer')}
      </button>
    </aside>
  )
}
