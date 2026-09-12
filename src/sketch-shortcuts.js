export function sketchShortcutAction(keys, key) {
  key = key.toLowerCase()
  // Explicit user bindings take priority over convenience aliases.
  const configured = Object.entries(keys).find(([, value]) => value === key)
  return configured?.[0] ?? ({v:'select', t:'text', '+':'zoomIn'})[key]
}
