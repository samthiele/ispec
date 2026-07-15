import { interpolateCool } from 'd3-scale-chromatic'
import { percentileClipNormalize } from './spectraStyling.js'

export const DEFAULT_BIPLOT_COLOR_MIN = 2
export const DEFAULT_BIPLOT_COLOR_MAX = 98
export const DEFAULT_BIPLOT_OPACITY_MIN = 2
export const DEFAULT_BIPLOT_OPACITY_MAX = 98
export const DEFAULT_BIPLOT_SIZE_MIN = 2
export const DEFAULT_BIPLOT_SIZE_MAX = 98
export const BIPLOT_RADIUS_MIN = 3
export const BIPLOT_RADIUS_MAX = 10
const BIPLOT_HOVER_COLOR = '#22d3ee'
const BIPLOT_HOVER_RADIUS_SCALE = 1.25

export function parseLimitSpec(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null
  if (/^-?\d+$/.test(text)) {
    const value = Number(text)
    return Number.isFinite(value) ? { kind: 'percentile', value } : null
  }
  const value = Number(text)
  return Number.isFinite(value) ? { kind: 'absolute', value } : null
}

export function percentileValue(values, percentile) {
  const finite = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (!finite.length) return Number.NaN
  const clamped = Math.max(0, Math.min(100, percentile))
  const index = (clamped / 100) * (finite.length - 1)
  const lo = Math.floor(index)
  const hi = Math.ceil(index)
  if (lo === hi) return finite[lo]
  const weight = index - lo
  return finite[lo] * (1 - weight) + finite[hi] * weight
}

export function resolveLimitRange(minRaw, maxRaw, values, fallback = [0, 1]) {
  const minSpec = parseLimitSpec(minRaw)
  const maxSpec = parseLimitSpec(maxRaw)
  if (!minSpec || !maxSpec) return fallback

  const finite = values.filter((value) => Number.isFinite(value))
  if (!finite.length) return fallback

  const lo = minSpec.kind === 'percentile'
    ? percentileValue(finite, minSpec.value)
    : minSpec.value
  const hi = maxSpec.kind === 'percentile'
    ? percentileValue(finite, maxSpec.value)
    : maxSpec.value

  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return fallback
  return [lo, hi]
}

export function resolveBiplotLimits(points, config) {
  const colorValues = points.map((point) => point.color).filter((value) => value != null)
  const opacityValues = points.map((point) => point.opacity).filter((value) => value != null)
  const sizeValues = points.map((point) => point.size).filter((value) => value != null)

  return {
    color: resolveLimitRange(config.colorMin, config.colorMax, colorValues, [0, 1]),
    opacity: resolveLimitRange(config.opacityMin, config.opacityMax, opacityValues, [0, 1]),
    size: resolveLimitRange(config.sizeMin, config.sizeMax, sizeValues, [0, 1]),
  }
}

export function linearMap(value, min, max) {
  if (!Number.isFinite(value)) return null
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0.5
  return Math.max(0, Math.min(1, (value - min) / (max - min)))
}

export function biplotColor(value, min, max) {
  const t = linearMap(value, min, max)
  if (t == null) return null
  return interpolateCool(1 - t)
}

export function biplotOpacity(value, min, max, fallback = 0.85) {
  const t = linearMap(value, min, max)
  if (t == null) return fallback
  return t
}

export function biplotRadius(value, min, max) {
  const t = linearMap(value, min, max)
  if (t == null) return (BIPLOT_RADIUS_MIN + BIPLOT_RADIUS_MAX) / 2
  return BIPLOT_RADIUS_MIN + t * (BIPLOT_RADIUS_MAX - BIPLOT_RADIUS_MIN)
}

export function styleBiplotPoint(point, config, styleContext) {
  const { ranks, scores, selectedColors, limits } = styleContext
  const hovered = styleContext.hoveredName === point.name

  let style

  if (point.selected) {
    const fill = selectedColors?.[point.name] ?? '#ffffff'
    const [sizeMin, sizeMax] = limits.size
    style = {
      fill,
      opacity: 0.95,
      radius: config.sizeExpr.trim()
        ? biplotRadius(point.size, sizeMin, sizeMax)
        : 5,
      stroke: fill,
      strokeWidth: 1,
    }
  } else {
    const [colorMin, colorMax] = limits.color
    const [opacityMin, opacityMax] = limits.opacity
    const [sizeMin, sizeMax] = limits.size

    const colorFromExpr = config.colorExpr.trim()
      ? biplotColor(point.color, colorMin, colorMax)
      : null
    const rankNorm = percentileClipNormalize(point.rank, ranks)
    const fill = colorFromExpr ?? interpolateCool(1 - rankNorm)

    const opacityFromExpr = config.opacityExpr.trim()
    const opacity = opacityFromExpr
      ? biplotOpacity(point.opacity, opacityMin, opacityMax, 0.85)
      : 0.35 + rankNorm * 0.55

    const sizeFromExpr = config.sizeExpr.trim()
    const radius = sizeFromExpr
      ? biplotRadius(point.size, sizeMin, sizeMax)
      : 3 + rankNorm * 3

    style = {
      fill,
      opacity,
      radius,
      stroke: fill,
      strokeWidth: 0.75,
    }
  }

  if (hovered) {
    return {
      ...style,
      fill: BIPLOT_HOVER_COLOR,
      opacity: 1,
      radius: style.radius * BIPLOT_HOVER_RADIUS_SCALE,
      stroke: BIPLOT_HOVER_COLOR,
      strokeWidth: Math.max(style.strokeWidth, 1.5),
    }
  }

  return style
}

export function formatLimitLabel(raw, resolved) {
  const spec = parseLimitSpec(raw)
  if (!spec) return ''
  if (spec.kind === 'percentile') return `p${spec.value}`
  if (!Number.isFinite(resolved)) return String(raw)
  const abs = Math.abs(resolved)
  if (abs >= 10) return resolved.toFixed(1)
  if (abs >= 1) return resolved.toFixed(2)
  return resolved.toFixed(3)
}

export function biplotColorbarGradient(steps = 8) {
  const colors = []
  for (let index = 0; index < steps; index += 1) {
    const t = index / (steps - 1)
    colors.push(interpolateCool(1 - t))
  }
  return `linear-gradient(to right, ${colors.join(', ')})`
}
