export function WorkspaceIcon({ name, size = 24 }) {
  const paths = {
    line: 'M4 20L20 4',
    layers: 'M12 3L2 8l10 5 10-5-10-5zM2 12l10 5 10-5M2 16l10 5 10-5',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM15 12a3 3 0 11-6 0 3 3 0 016 0',
    eyeOff: 'M3 3l18 18M9 5a10 10 0 013 0c6 0 10 7 10 7l-3 4M6 6C3 8 2 12 2 12s4 7 10 7c2 0 4-1 5-2',
    duplicate: 'M8 8h13v13H8zM16 8V3H3v13h5',
    up: 'M12 20V4M5 11l7-7 7 7',
    down: 'M12 4v16M5 13l7 7 7-7',
    pencil: 'M4 20l2-6L17 3l4 4L10 18l-6 2zM14 6l4 4',
    marker: 'M5 16l9-12 7 5-9 12-7-5zM5 16l-3 4 6 1M12 7l7 5',
    image: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 8h.01',
    close: 'M6 6l12 12M18 6L6 18',
    pen: 'M4 17c3-7 12-15 12-11S4 19 8 19s10-10 10-6-6 8-2 7l4-3',
    eraser: 'M4 14l9-10 7 7-9 10H9l-5-5zM8 10l7 7M11 21h10',
    undo: 'M9 5L4 10l5 5M5 10h9a6 6 0 010 12',
    redo: 'M15 5l5 5-5 5M19 10h-9a6 6 0 000 12',
    check: 'M5 12l5 5 9-11',
    clear: 'M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13',
    rectangle: 'M5 5h14v14H5z',
    circle: 'M20 12a8 8 0 11-16 0 8 8 0 0116 0',
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.pen} /></svg>
}
