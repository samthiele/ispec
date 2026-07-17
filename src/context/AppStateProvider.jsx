import { useCallback, useMemo, useState } from 'react'
import {
  createDefaultAppState,
  normalizeAppState,
  setViewMode as setViewModeState,
  updatePane as updatePaneState,
} from '../app/appState.js'
import {
  crosshairEqual,
  EMPTY_BIPLOT_CROSSHAIR,
} from '../app/spectralExpression.js'
import { AppActionsContext } from './AppActionsContext.js'
import { AppStateContext } from './AppStateContext.js'
import { InteractionContext } from './InteractionContext.js'

export function AppStateProvider({ children, initialState, loadedFromHash = false }) {
  const [appState, setAppState] = useState(() =>
    normalizeAppState(initialState ?? createDefaultAppState()),
  )
  const [hydratedFromHash] = useState(loadedFromHash)
  const [searchResults, setSearchResults] = useState(null)

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

  const [hoveredSpectrum, setHoveredSpectrumState] = useState(null)
  const [biplotCrosshair, setBiplotCrosshairState] = useState(EMPTY_BIPLOT_CROSSHAIR)

  const setHoveredSpectrum = useCallback((next) => {
    setHoveredSpectrumState((current) => (current === next ? current : next))
  }, [])

  const setBiplotCrosshair = useCallback((next) => {
    const value = next ?? EMPTY_BIPLOT_CROSSHAIR
    setBiplotCrosshairState((current) => (crosshairEqual(current, value) ? current : value))
  }, [])

  const appValue = useMemo(
    () => ({
      appState,
      setAppState,
      hydratedFromHash,
      searchResults,
      setSearchResults,
    }),
    [appState, hydratedFromHash, searchResults],
  )

  const actionsValue = useMemo(
    () => ({
      setAppState,
      updatePane,
      setViewMode,
      setLibraries,
      setQueryState,
      setSearchResults,
    }),
    [setLibraries, setQueryState, setSearchResults, setViewMode, updatePane],
  )

  const interactionValue = useMemo(
    () => ({
      hoveredSpectrum,
      setHoveredSpectrum,
      biplotCrosshair,
      setBiplotCrosshair,
    }),
    [biplotCrosshair, hoveredSpectrum, setBiplotCrosshair, setHoveredSpectrum],
  )

  return (
    <AppActionsContext.Provider value={actionsValue}>
      <AppStateContext.Provider value={appValue}>
        <InteractionContext.Provider value={interactionValue}>
          {children}
        </InteractionContext.Provider>
      </AppStateContext.Provider>
    </AppActionsContext.Provider>
  )
}
