import {
  DEFAULT_BIPLOT_COLOR_MAX,
  DEFAULT_BIPLOT_COLOR_MIN,
  DEFAULT_BIPLOT_OPACITY_MAX,
  DEFAULT_BIPLOT_OPACITY_MIN,
  DEFAULT_BIPLOT_SIZE_MAX,
  DEFAULT_BIPLOT_SIZE_MIN,
} from './biplotStyling.js'

export const BIPLOT_PANE_STATE_KEYS = [
  'xExpr',
  'yExpr',
  'width',
  'colorExpr',
  'colorMin',
  'colorMax',
  'opacityExpr',
  'opacityMin',
  'opacityMax',
  'sizeExpr',
  'sizeMin',
  'sizeMax',
]

const NUMERIC_BIPLOT_STATE_KEYS = new Set([
  'width',
  'colorMin',
  'colorMax',
  'opacityMin',
  'opacityMax',
  'sizeMin',
  'sizeMax',
])

export const DEFAULT_BIPLOT_PANE_STATE = {
  xExpr: '2200-2400P',
  yExpr: '^8500-12000P',
  width: 50,
  colorExpr: '',
  colorMin: DEFAULT_BIPLOT_COLOR_MIN,
  colorMax: DEFAULT_BIPLOT_COLOR_MAX,
  opacityExpr: '',
  opacityMin: DEFAULT_BIPLOT_OPACITY_MIN,
  opacityMax: DEFAULT_BIPLOT_OPACITY_MAX,
  sizeExpr: '',
  sizeMin: DEFAULT_BIPLOT_SIZE_MIN,
  sizeMax: DEFAULT_BIPLOT_SIZE_MAX,
}

function biplotValuesEqual(key, left, right) {
  if (NUMERIC_BIPLOT_STATE_KEYS.has(key)) {
    return Number(left) === Number(right)
  }
  return String(left) === String(right)
}

export function mergeBiplotPaneState(paneState) {
  return { ...DEFAULT_BIPLOT_PANE_STATE, ...(paneState ?? {}) }
}

export function normalizeBiplotPaneState(raw) {
  if (!raw || typeof raw !== 'object') return {}

  const normalized = {}
  for (const key of BIPLOT_PANE_STATE_KEYS) {
    if (raw[key] !== undefined && raw[key] !== null) {
      normalized[key] = raw[key]
    }
  }
  return normalized
}

export function compactBiplotPaneState(state) {
  const merged = mergeBiplotPaneState(state)
  const compact = {}

  for (const key of BIPLOT_PANE_STATE_KEYS) {
    if (!biplotValuesEqual(key, merged[key], DEFAULT_BIPLOT_PANE_STATE[key])) {
      compact[key] = merged[key]
    }
  }

  return compact
}

export function hasSavedBiplotPaneState(state) {
  return Object.keys(compactBiplotPaneState(state)).length > 0
}

export function findBiplotPaneState(panes) {
  const pane = Array.isArray(panes) ? panes.find((entry) => entry.type === 'biplot') : null
  return pane?.state ?? {}
}
