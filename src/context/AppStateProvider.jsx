import { useCallback, useMemo, useState } from 'react'
import {
  createDefaultAppState,
  normalizeAppState,
  setViewMode as setViewModeState,
  updatePane as updatePaneState,
} from '../app/appState.js'
import { AppStateContext } from './AppStateContext.js'

export function AppStateProvider({ children, initialState, loadedFromHash = false }) {
  const [appState, setAppState] = useState(() =>
    normalizeAppState(initialState ?? createDefaultAppState()),
  )
  const [hydratedFromHash] = useState(loadedFromHash)

  const updatePane = useCallback((paneIndex, patch) => {
    setAppState((current) => updatePaneState(current, paneIndex, patch))
  }, [])

  const setViewMode = useCallback((viewMode) => {
    setAppState((current) => setViewModeState(current, viewMode))
  }, [])

  const setLibraries = useCallback((libraries) => {
    setAppState((current) => ({ ...current, libraries }))
  }, [])

  const setQueryState = useCallback((patch) => {
    setAppState((current) => ({ ...current, ...patch }))
  }, [])

  const [hoveredSpectrum, setHoveredSpectrum] = useState(null)

  const value = useMemo(
    () => ({
      appState,
      setAppState,
      updatePane,
      setViewMode,
      setLibraries,
      setQueryState,
      hoveredSpectrum,
      setHoveredSpectrum,
      hydratedFromHash,
    }),
    [
      appState,
      updatePane,
      setViewMode,
      setLibraries,
      setQueryState,
      hoveredSpectrum,
      hydratedFromHash,
    ],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
