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
import { rebuildVirtualSpectraFromRecipes } from './selectionSync.js'

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

  const virtualSpectra = await rebuildVirtualSpectraFromRecipes(
    pyodide,
    next.virtualMixRecipes ?? {},
  )

  return {
    state: { ...next, virtualSpectra },
    searchResults,
  }
}
