function parseFeatureNumber(text) {
  const number = Number(text)
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`Wavelength values must be positive: ${text}`)
  }
  return number
}

export function parseSpectralExpression(expr) {
  const raw = String(expr ?? '').trim()
  if (!raw) {
    throw new Error('Empty spectral attribute expression.')
  }

  let compact = raw.replace(/\s+/g, '')
  const isPeak = compact.startsWith('^')
  if (isPeak) {
    compact = compact.slice(1)
  }

  if (compact && (compact.endsWith('D') || compact.endsWith('P'))) {
    const kind = compact.slice(-1)
    const body = compact.slice(0, -1)

    if (body.includes('-')) {
      const dashIndex = body.indexOf('-')
      const startText = body.slice(0, dashIndex)
      const endText = body.slice(dashIndex + 1)
      if (!startText || !endText) {
        throw new Error(`Invalid wavelength range in ${raw}.`)
      }
      const start = parseFeatureNumber(startText)
      const end = parseFeatureNumber(endText)
      if (end <= start) {
        throw new Error(`Invalid wavelength range in ${raw}.`)
      }
      return {
        type: 'feature',
        peak: isPeak,
        range: [start, end],
        center: null,
        metric: kind === 'D' ? 'depth' : 'position',
      }
    }

    if (body) {
      return {
        type: 'feature',
        peak: isPeak,
        range: null,
        center: parseFeatureNumber(body),
        metric: kind === 'D' ? 'depth' : 'position',
      }
    }
  }

  return { type: 'bandmath', expression: raw }
}

export function isPositionAttribute(expr) {
  try {
    const parsed = parseSpectralExpression(expr)
    return parsed.type === 'feature' && parsed.metric === 'position'
  } catch {
    return false
  }
}

export function crosshairEqual(left, right) {
  return (
    left.active === right.active
    && left.x === right.x
    && left.y === right.y
  )
}

export function biplotCrosshairFromPoint(point, xExpr, yExpr) {
  if (!point) {
    return { x: null, y: null }
  }

  return {
    x: isPositionAttribute(xExpr) && Number.isFinite(point.x) ? point.x : null,
    y: isPositionAttribute(yExpr) && Number.isFinite(point.y) ? point.y : null,
  }
}

export function spectraCrosshairWavelengths(crosshair, xExpr, yExpr) {
  if (!crosshair?.active) return []

  const wavelengths = []
  if (isPositionAttribute(xExpr) && crosshair.x != null && Number.isFinite(crosshair.x)) {
    wavelengths.push(crosshair.x)
  }
  if (isPositionAttribute(yExpr) && crosshair.y != null && Number.isFinite(crosshair.y)) {
    wavelengths.push(crosshair.y)
  }

  return [...new Set(wavelengths)].sort((left, right) => left - right)
}

export const POSITION_GUIDE_LINE_COLOR = '#9aa0a6'

export const EMPTY_BIPLOT_CROSSHAIR = { active: false, x: null, y: null }
