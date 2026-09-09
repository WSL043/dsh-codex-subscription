// Speed-adaptive low-pass filter (1 Euro principle). Strength zero is raw input.
export function createStrokeFilter(strength = 0) {
  let last, filtered, velocity = 0, time
  const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt))
  return (point, timestamp) => {
    if (!last || !strength) { last = filtered = point; time = timestamp; return point }
    const dt = Math.max(1 / 1000, Math.min(.1, (timestamp - time) / 1000))
    const speed = Math.hypot(point.x - last.x, point.y - last.y) / dt
    velocity += alpha(1, dt) * (speed - velocity)
    const cutoff = 1 + (100 - strength) * .12 + velocity * 35
    const a = alpha(cutoff, dt)
    filtered = { x: filtered.x + a * (point.x - filtered.x), y: filtered.y + a * (point.y - filtered.y) }
    last = point; time = timestamp
    return filtered
  }
}

export function snapLine(start, end) {
  const angle = Math.round(Math.atan2(end.y - start.y, end.x - start.x) / (Math.PI / 4)) * Math.PI / 4
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  return { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length }
}
