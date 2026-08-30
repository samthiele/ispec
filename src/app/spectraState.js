import { SPECTRAL_BANDS } from './spectralBands.js'

export const SPECTRA_PANE_STATE_KEYS = ['xDomain', 'yDomain', 'activeBand', 'applyHull', 'showAbsorbance']

export const DEFAULT_SPECTRA_PANE_STATE = {
  xDomain: null,
  yDomain: null,
  activeBand: 'ALL',
  applyHull: false,
  hullRange: null,
  showAbsorbance: false,
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
  if (raw.showAbsorbance) normalized.showAbsorbance = true
  const hullRange = normalizeDomain(raw.hullRange)
  if (hullRange) normalized.hullRange = hullRange

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
  if (merged.applyHull && merged.hullRange) compact.hullRange = merged.hullRange
  if (merged.showAbsorbance) compact.showAbsorbance = true

  return compact
}

export function isPlaceholderEmptyDomain(xDomain) {
  return (
    Array.isArray(xDomain)
    && xDomain.length === 2
    && Number(xDomain[0]) === 0
    && Number(xDomain[1]) === 1
  )
}

export function hasSavedSpectraView(state) {
  const merged = mergeSpectraPaneState(state)
  if (isPlaceholderEmptyDomain(merged.xDomain)) {
    return merged.yDomain != null || merged.activeBand !== 'ALL' || merged.applyHull || merged.showAbsorbance
  }
  return (
    merged.xDomain != null
    || merged.yDomain != null
    || merged.activeBand !== 'ALL'
    || merged.applyHull
    || merged.showAbsorbance
  )
}

export function findSpectraPane(panes) {
  return panes?.find((pane) => pane.type === 'spectra') ?? null
}

/** Plotted x extent from spectra pane state, or null if not determined. */
export function resolveSpectraXExtent(appState, fallbackExtent = null) {
  const merged = mergeSpectraPaneState(findSpectraPane(appState?.panes)?.state)
  if (merged.xDomain && !isPlaceholderEmptyDomain(merged.xDomain)) {
    return merged.xDomain
  }
  const band = merged.activeBand
  if (band && band !== 'ALL' && SPECTRAL_BANDS[band]?.min != null) {
    return [SPECTRAL_BANDS[band].min, SPECTRAL_BANDS[band].max]
  }
  if (
    Array.isArray(fallbackExtent)
    && fallbackExtent.length === 2
    && Number.isFinite(fallbackExtent[0])
    && Number.isFinite(fallbackExtent[1])
    && fallbackExtent[1] > fallbackExtent[0]
  ) {
    return fallbackExtent
  }
  return null
}
