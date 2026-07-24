import {
  loadedLibrariesEqual,
  normalizeAppState,
  toShareableState,
} from './appState.js'
import { applyPythonUiLibraries } from './librarySync.js'
import {
  applyPythonQueryState,
  clampSlice,
  clearPythonSearch,
  runPythonSearch,
} from './querySync.js'
import { hasSavedSpectraView } from './spectraState.js'
import { rebuildVirtualSpectraFromRecipes, syncPythonVirtualSpectra } from './selectionSync.js'
import { normalizeVirtualSpectra } from './virtualSpectra.js'

function selectionOrRecipesChanged(currentState, nextState) {
  return (
    JSON.stringify(currentState.selection) !== JSON.stringify(nextState.selection)
    || JSON.stringify(currentState.virtualMixRecipes ?? {})
      !== JSON.stringify(nextState.virtualMixRecipes ?? {})
  )
}

function incomingSpecifiesSpectraView(incomingRaw) {
  if (!Array.isArray(incomingRaw?.panes)) return false
  return incomingRaw.panes.some(
    (pane) => pane?.type === 'spectra' && hasSavedSpectraView(pane.state ?? {}),
  )
}

function resetSpectraPaneViews(panes) {
  return panes.map((pane) => (pane.type === 'spectra' ? { ...pane, state: {} } : pane))
}

export async function hydrateSharedAppState(
  pyodide,
  catalog,
  currentState,
  incomingRaw,
  { merge = true, syncLibraries } = {},
) {
  const mergedRaw = merge
    ? { ...toShareableState(currentState), ...incomingRaw }
    : incomingRaw
  const next = normalizeAppState(mergedRaw)

  if (!loadedLibrariesEqual(next.libraries, currentState.libraries)) {
    await syncLibraries(pyodide, catalog, next.libraries)
    await applyPythonUiLibraries(pyodide)
  }

  let searchResults = null
  if (next.query.trim()) {
    searchResults = await runPythonSearch(pyodide, next.query, next.confidence)
    next.slice = clampSlice(next.slice, searchResults.total, next.pageSize)
  } else {
    await clearPythonSearch(pyodide)
  }

  await applyPythonQueryState(pyodide, {
    query: next.query,
    slice: next.slice,
    selection: next.selection,
  })

  const mixSpectra = await rebuildVirtualSpectraFromRecipes(
    pyodide,
    next.virtualMixRecipes ?? {},
    { selection: next.selection, selectionMeta: next.selectionMeta ?? {} },
  )
  const storedSpectra = normalizeVirtualSpectra(next.virtualSpectra ?? {}, next.selection)
  const virtualSpectra = { ...storedSpectra, ...mixSpectra }
  await syncPythonVirtualSpectra(pyodide, virtualSpectra)

  let state = { ...next, virtualSpectra }
  if (
    selectionOrRecipesChanged(currentState, next)
    && !incomingSpecifiesSpectraView(incomingRaw)
  ) {
    state = {
      ...state,
      panes: resetSpectraPaneViews(state.panes),
    }
  }

  return {
    state,
    searchResults,
  }
}
