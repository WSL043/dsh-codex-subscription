import { WorkspaceIcon } from './workspace-icons.jsx'

export function SketchToolPicker({
  t,
  disabled,
  tool,
  brush,
  chooseBrush,
  chooseTool,
  shapesOpen,
  setShapesOpen
}) {
  return (
    <div
      className="codexSketchPill"
      role="toolbar"
      aria-label={t('sketchTitle')}
      title={t('sketchShortcuts')}
    >
      {['select', 'pen', 'pencil', 'marker', 'text', 'eraser'].map((name) => {
        const drawing = ['pen', 'pencil', 'marker'].includes(name)
        const label = t(drawing ? `sketchBrush_${name}` : `sketchTool_${name}`)
        return (
          <button
            type="button"
            key={name}
            aria-label={label}
            title={
              drawing ? `${label} · ${t(`sketchBrushHint_${name}`)}` : label
            }
            aria-pressed={
              drawing ? tool === 'pen' && brush === name : tool === name
            }
            disabled={disabled}
            onClick={() => {
              if (drawing) chooseBrush(name)
              else chooseTool(name)
            }}
          >
            <WorkspaceIcon name={name} size={23} />
            <span>{label}</span>
          </button>
        )
      })}
      <button
        className="codexSketchShapeToggle"
        type="button"
        aria-label={t('sketchShapes')}
        aria-expanded={shapesOpen}
        aria-pressed={['line', 'arrow', 'rectangle', 'circle'].includes(tool)}
        disabled={disabled}
        onClick={() => setShapesOpen((v) => !v)}
      >
        <WorkspaceIcon
          name={
            ['line', 'arrow', 'rectangle', 'circle'].includes(tool)
              ? tool
              : 'rectangle'
          }
          size={23}
        />
        <span>
          {t(
            ['line', 'arrow', 'rectangle', 'circle'].includes(tool)
              ? `sketchTool_${tool}`
              : 'sketchShapes'
          )}
        </span>
      </button>
      {shapesOpen ? (
        <div className="codexSketchShapeMenu">
          {['line', 'arrow', 'rectangle', 'circle'].map((name) => (
            <button
              key={name}
              disabled={disabled}
              type="button"
              aria-pressed={tool === name}
              onClick={() => {
                chooseTool(name)
                setShapesOpen(false)
              }}
            >
              {t(`sketchTool_${name}`)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
