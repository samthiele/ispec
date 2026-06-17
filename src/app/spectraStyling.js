import { interpolateCool } from 'd3-scale-chromatic'

const HOVER_COLOR = '#22d3ee'
const SELECTED_COLOR = '#ffffff'
const MIN_OPACITY = 0.25
const MAX_OPACITY = 0.95

function scoreOpacity(score, scores) {
  const scoreNorm = percentileClipNormalize(score, scores)
  return MIN_OPACITY + scoreNorm * (MAX_OPACITY - MIN_OPACITY)
}

export function percentileClipNormalize(value, values, low = 0.05, high = 0.95) {
  if (value == null || !Number.isFinite(value)) return 0.5

  const finite = values.filter((entry) => entry != null && Number.isFinite(entry))
  if (finite.length === 0) return 0.5

  const sorted = [...finite].sort((a, b) => a - b)
  const lo = sorted[Math.floor(low * (sorted.length - 1))]
  const hi = sorted[Math.floor(high * (sorted.length - 1))]
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return 0.5

  return Math.max(0, Math.min(1, (value - lo) / (hi - lo)))
}

export function spectrumStrokeStyle(spectrum, context, hoveredName) {
  const { ranks, scores, selectedColors } = context
  const isHovered = hoveredName === spectrum.name

  if (isHovered) {
    return {
      stroke: HOVER_COLOR,
      strokeWidth: 2.75,
      strokeOpacity: 1,
    }
  }

  if (spectrum.selected) {
    return {
      stroke: selectedColors?.[spectrum.name] ?? SELECTED_COLOR,
      strokeWidth: 1.75,
      strokeOpacity: 0.95,
    }
  }

  const rankNorm = percentileClipNormalize(spectrum.rank, ranks)

  return {
    stroke: interpolateCool(1 - rankNorm),
    strokeWidth: 1.5,
    strokeOpacity: scoreOpacity(spectrum.score, scores),
  }
}

export function isSpectrumHovered(name, hoveredName) {
  return Boolean(hoveredName && name === hoveredName)
}

export function resultNameStyle({ rank, score, selected, hovered, color }, ranks, scores) {
  if (hovered) {
    return { color: HOVER_COLOR, opacity: 1 }
  }

  if (selected) {
    return { color: color ?? SELECTED_COLOR, opacity: 0.95 }
  }

  const rankNorm = percentileClipNormalize(rank, ranks)

  return {
    color: interpolateCool(1 - rankNorm),
    opacity: scoreOpacity(score, scores),
  }
}
