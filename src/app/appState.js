import { DEFAULT_LIBRARY_ID } from './libraries.js'
import { DEFAULT_CONFIDENCE, DEFAULT_PAGE_SIZE } from './querySync.js'
import { normalizeSelectionMeta } from './selectionMeta.js'

export const APP_STATE_VERSION = 2

export const LAYOUT_PANE_DEFAULTS = {
  tri: ['query', 'spectra', 'llm'],
  bi: ['spectra', 'query'],
  quad: ['query', 'spectra', 'biplot', 'llm'],
}

export function defaultViewMode() {
  if (typeof window === 'undefined') return 'tri'
  return window.innerHeight > window.innerWidth ? 'bi' : 'tri'
}

export function panesForViewMode(viewMode, existingPanes = []) {
  const defaults = LAYOUT_PANE_DEFAULTS[viewMode] ?? LAYOUT_PANE_DEFAULTS.tri
  return defaults.map((type, index) => {
    const existing = existingPanes[index]
    if (existing?.type === type) {
      return { type: existing.type, state: existing.state ?? {} }
    }
    if (existing) {
      return { type, state: existing.state ?? {} }
    }
    return { type, state: {} }
  })
}

export function createDefaultAppState(viewMode = defaultViewMode()) {
  return {
    v: APP_STATE_VERSION,
    libraries: [DEFAULT_LIBRARY_ID],
    query: '',
    slice: [0, 0],
    confidence: DEFAULT_CONFIDENCE,
    pageSize: DEFAULT_PAGE_SIZE,
    selection: [],
    selectionMeta: {},
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
    libraries: Array.isArray(raw?.libraries) ? raw.libraries : base.libraries,
    query: typeof raw?.query === 'string' ? raw.query : base.query,
    slice: Array.isArray(raw?.slice) && raw.slice.length === 2 ? raw.slice : base.slice,
    confidence: Number.isFinite(Number(raw?.confidence)) ? Number(raw.confidence) : base.confidence,
    pageSize: Number.isFinite(Number(raw?.pageSize)) ? Number(raw.pageSize) : base.pageSize,
    selection,
    selectionMeta: normalizeSelectionMeta(raw?.selectionMeta, selection),
    viewMode,
    panes: panesForViewMode(viewMode, Array.isArray(raw?.panes) ? raw.panes : base.panes),
  }
}

export function toShareableState(appState) {
  return {
    v: appState.v,
    libraries: appState.libraries,
    query: appState.query,
    slice: appState.slice,
    confidence: appState.confidence,
    pageSize: appState.pageSize,
    selection: appState.selection,
    selectionMeta: appState.selectionMeta,
    viewMode: appState.viewMode,
    panes: appState.panes.map(({ type, state }) => ({ type, state })),
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
