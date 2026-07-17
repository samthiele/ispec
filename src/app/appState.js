import { DEFAULT_LIBRARY_ID } from './libraries.js'
import { compactBiplotPaneState, normalizeBiplotPaneState } from './biplotState.js'
import { compactSpectraPaneState, normalizeSpectraPaneState } from './spectraState.js'
import { DEFAULT_CONFIDENCE, DEFAULT_PAGE_SIZE } from './querySync.js'
import { normalizeSelectionMeta } from './selectionMeta.js'
import { normalizeVirtualMixRecipes } from './virtualSpectra.js'

export const APP_STATE_VERSION = 4

export const LAYOUT_PANE_DEFAULTS = {
  tri: ['query', 'spectra', 'llm'],
  bi: ['spectra', 'query'],
  quad: ['query', 'spectra', 'biplot', 'llm'],
}

export const VALID_PANE_TYPES = new Set([
  'query',
  'spectra',
  'biplot',
  'llm',
  'console',
  'library',
])

export function defaultViewMode() {
  if (typeof window === 'undefined') return 'tri'
  return window.innerHeight > window.innerWidth ? 'bi' : 'tri'
}

export function panesForViewMode(viewMode, existingPanes = []) {
  const defaults = LAYOUT_PANE_DEFAULTS[viewMode] ?? LAYOUT_PANE_DEFAULTS.tri
  return defaults.map((defaultType, index) => {
    const existing = existingPanes[index]
    if (existing?.type && VALID_PANE_TYPES.has(existing.type)) {
      return { type: existing.type, state: existing.state ?? {} }
    }
    return { type: defaultType, state: {} }
  })
}

function normalizePaneEntry(pane) {
  const type = pane?.type && VALID_PANE_TYPES.has(pane.type) ? pane.type : 'query'
  let state = pane?.state ?? {}
  if (type === 'biplot') {
    state = normalizeBiplotPaneState(state)
  } else if (type === 'spectra') {
    state = normalizeSpectraPaneState(state)
  }
  return { type, state }
}

export function normalizePanes(rawPanes, viewMode) {
  const defaults = LAYOUT_PANE_DEFAULTS[viewMode] ?? LAYOUT_PANE_DEFAULTS.tri

  if (!Array.isArray(rawPanes) || rawPanes.length === 0) {
    return panesForViewMode(viewMode).map((pane) => normalizePaneEntry(pane))
  }

  return defaults.map((defaultType, index) => {
    const existing = rawPanes[index]
    if (existing?.type && VALID_PANE_TYPES.has(existing.type)) {
      return normalizePaneEntry(existing)
    }
    return { type: defaultType, state: {} }
  })
}

export function normalizeLoadedLibraries(raw, { fallbackToDefault = false } = {}) {
  if (!Array.isArray(raw)) {
    return fallbackToDefault ? [DEFAULT_LIBRARY_ID] : []
  }
  const ids = [...new Set(raw.map((id) => String(id).trim()).filter(Boolean))]
  if (ids.length === 0 && fallbackToDefault) {
    return [DEFAULT_LIBRARY_ID]
  }
  return ids
}

export function loadedLibrariesEqual(a, b) {
  const left = normalizeLoadedLibraries(a, { fallbackToDefault: false })
  const right = normalizeLoadedLibraries(b, { fallbackToDefault: false })
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function resolveSharedLibraries(rawLibraries, fallbackLibraries) {
  if (rawLibraries === undefined) {
    return fallbackLibraries
  }
  const libraries = normalizeLoadedLibraries(rawLibraries, { fallbackToDefault: false })
  // Empty arrays in share links are treated as missing (legacy bug) and fall back to defaults.
  return libraries.length > 0 ? libraries : fallbackLibraries
}

export function createDefaultAppState(viewMode = defaultViewMode()) {
  return {
    v: APP_STATE_VERSION,
    libraries: [],
    query: '',
    slice: [0, 0],
    confidence: DEFAULT_CONFIDENCE,
    pageSize: DEFAULT_PAGE_SIZE,
    selection: [],
    selectionMeta: {},
    virtualSpectra: {},
    virtualMixRecipes: {},
    viewMode,
    panes: panesForViewMode(viewMode),
  }
}

export function normalizeAppState(raw) {
  const viewMode = raw?.viewMode ?? defaultViewMode()
  const base = createDefaultAppState(viewMode)
  const selection = Array.isArray(raw?.selection) ? raw.selection.map(String) : base.selection

  return {
    ...base,
    ...raw,
    v: APP_STATE_VERSION,
    libraries: resolveSharedLibraries(raw?.libraries, base.libraries),
    query: typeof raw?.query === 'string' ? raw.query : base.query,
    slice: Array.isArray(raw?.slice) && raw.slice.length === 2 ? raw.slice : base.slice,
    confidence: Number.isFinite(Number(raw?.confidence)) ? Number(raw.confidence) : base.confidence,
    pageSize: Number.isFinite(Number(raw?.pageSize)) ? Number(raw.pageSize) : base.pageSize,
    selection,
    selectionMeta: normalizeSelectionMeta(raw?.selectionMeta, selection),
    virtualMixRecipes: normalizeVirtualMixRecipes(raw?.virtualMixRecipes, selection),
    virtualSpectra: {},
    viewMode,
    panes: normalizePanes(raw?.panes, viewMode),
  }
}

function shareablePaneState(type, state) {
  if (type === 'biplot') {
    return compactBiplotPaneState(state)
  }
  if (type === 'spectra') {
    return compactSpectraPaneState(state)
  }
  return state ?? {}
}

export function toShareableState(appState) {
  const libraries = normalizeLoadedLibraries(appState.libraries, { fallbackToDefault: false })
  return {
    v: appState.v,
    ...(libraries.length > 0 ? { libraries } : {}),
    query: appState.query,
    slice: appState.slice,
    confidence: appState.confidence,
    pageSize: appState.pageSize,
    selection: appState.selection,
    selectionMeta: appState.selectionMeta,
    virtualMixRecipes: appState.virtualMixRecipes ?? {},
    viewMode: appState.viewMode,
    panes: appState.panes.map(({ type, state }) => ({
      type,
      state: shareablePaneState(type, state),
    })),
  }
}

export function updatePane(appState, paneIndex, patch) {
  const panes = appState.panes.map((pane, index) => {
    if (index !== paneIndex) return pane
    return {
      ...pane,
      ...patch,
      state: patch.state !== undefined ? patch.state : pane.state,
    }
  })
  return { ...appState, panes }
}

export function setViewMode(appState, viewMode) {
  return {
    ...appState,
    viewMode,
    panes: panesForViewMode(viewMode, appState.panes),
  }
}
