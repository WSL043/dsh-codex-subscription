export function SketchPicturePanel({
  document,
  disabled,
  pictureInput,
  importImage,
  runFile,
  change,
  t
}) {
  const pictures = document.layers.filter((layer) => layer.image)

  return (
    <aside className="codexSketchPictures">
      <header>
        <strong>{t('sketchPictures')}</strong>
        <button
          type="button"
          disabled={disabled}
          onClick={() => pictureInput.current.click()}
        >
          {t('sketchPictureAdd')}
        </button>
      </header>
      <input
        ref={pictureInput}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void runFile(() => importImage(file))
        }}
      />
      {pictures.map((layer) => (
        <div key={layer.id} data-active={layer.id === document.active}>
          <button
            type="button"
            disabled={disabled}
            aria-label={`${t('sketchPictureSelect')} ${layer.name}`}
            onClick={() => change('select', layer.id)}
          >
            <img src={layer.image.src} alt={layer.name} />
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-label={`${t('sketchDeleteDraft')} ${layer.name}`}
            onClick={() =>
              change(document.layers.length === 1 ? 'clear' : 'delete', layer.id)
            }
          >
            ×
          </button>
        </div>
      ))}
      {pictures.length === 0 ? <small>{t('sketchPicturesEmpty')}</small> : null}
    </aside>
  )
}
