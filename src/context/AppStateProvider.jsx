import { useCallback, useMemo, useState } from 'react'
import {
  createDefaultAppState,
  normalizeAppState,
  setViewMode as setViewModeState,
  updatePane as updatePaneState,
} from '../app/appState.js'
import { EMPTY_BIPLOT_CROSSHAIR } from '../app/spectralExpression.js'
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
  const [biplotCrosshair, setBiplotCrosshairState] = useState(EMPTY_BIPLOT_CROSSHAIR)

  const setBiplotCrosshair = useCallback((next) => {
    setBiplotCrosshairState(next ?? EMPTY_BIPLOT_CROSSHAIR)
  }, [])

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
      biplotCrosshair,
      setBiplotCrosshair,
      hydratedFromHash,
    }),
    [
      appState,
      updatePane,
      setViewMode,
      setLibraries,
      setQueryState,
      hoveredSpectrum,
      biplotCrosshair,
      setBiplotCrosshair,
      hydratedFromHash,
    ],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
