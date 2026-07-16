export const SPECTRA_PANE_STATE_KEYS = ['xDomain', 'yDomain', 'activeBand', 'applyHull']

export const DEFAULT_SPECTRA_PANE_STATE = {
  xDomain: null,
  yDomain: null,
  activeBand: 'ALL',
  applyHull: false,
}

function normalizeDomain(value) {
  if (!Array.isArray(value) || value.length !== 2) return null
  const lo = Number(value[0])
  const hi = Number(value[1])
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null
  return [lo, hi]
}

export function normalizeSpectraPaneState(raw) {
  if (!raw || typeof raw !== 'object') return {}

  const normalized = {}
  const xDomain = normalizeDomain(raw.xDomain)
  const yDomain = normalizeDomain(raw.yDomain)

  if (xDomain) normalized.xDomain = xDomain
  if (yDomain) normalized.yDomain = yDomain
  if (typeof raw.activeBand === 'string' && raw.activeBand.trim()) {
    normalized.activeBand = raw.activeBand.trim()
  }
  if (raw.applyHull) normalized.applyHull = true

  return normalized
}

export function mergeSpectraPaneState(paneState) {
  return { ...DEFAULT_SPECTRA_PANE_STATE, ...normalizeSpectraPaneState(paneState) }
}

export function compactSpectraPaneState(state) {
  const merged = mergeSpectraPaneState(state)
  const compact = {}

  if (merged.xDomain) compact.xDomain = merged.xDomain
  if (merged.yDomain) compact.yDomain = merged.yDomain
  if (merged.activeBand && merged.activeBand !== 'ALL') {
    compact.activeBand = merged.activeBand
  }
  if (merged.applyHull) compact.applyHull = true

  return compact
}

export function hasSavedSpectraView(state) {
  const merged = mergeSpectraPaneState(state)
  return (
    merged.xDomain != null
    || merged.yDomain != null
    || merged.activeBand !== 'ALL'
    || merged.applyHull
  )
}
