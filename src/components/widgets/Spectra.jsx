import { useCallback, useEffect, useDeferredValue, useMemo, useRef, useState } from 'react'
import {
  applyHullCorrections,
  applyHullToSpectra,
  computePlotExtents,
  defaultPlotDomains,
  exportSpectraPlotData,
  filterPlotSpectra,
  filterSpectraBySpan,
} from '../../app/spectraSync.js'
import {
  buildLookupMap,
  selectedColorsMap,
  selectionColorsDep,
  selectionGroupDep,
} from '../../app/selectionMeta.js'
import { SPECTRAL_BANDS, SPECTRAL_BAND_KEYS } from '../../app/spectralBands.js'
import { useAppState } from '../../context/useAppState.js'
import { usePyodide } from '../../context/usePyodide.js'
import SpectraPlot, { dataWavelengthExtent, defaultDomainsFromData } from './SpectraPlot.jsx'
import './Spectra.css'

function visibleRawSpectra(rawPlotData, showSelected, showQuery) {
  return filterPlotSpectra(rawPlotData.spectra, { showSelected, showQuery })
}

export default function Spectra() {
  const { appState, hoveredSpectrum, setHoveredSpectrum } = useAppState()
  const { status, pyodide, runQueued } = usePyodide()
  const [rawPlotData, setRawPlotData] = useState({ spectra: [] })
  const [hullPlotData, setHullPlotData] = useState(null)
  const [hullRange, setHullRange] = useState(null)
  const [loading, setLoading] = useState(false)
  const [hullLoading, setHullLoading] = useState(false)
  const [error, setError] = useState('')
  const [xDomain, setXDomain] = useState(null)
  const [yDomain, setYDomain] = useState(null)
  const [activeBand, setActiveBand] = useState('ALL')
  const [showSelected, setShowSelected] = useState(true)
  const [showQuery, setShowQuery] = useState(true)
  const [applyHull, setApplyHull] = useState(false)

  const pageSlice = useMemo(() => {
    const [start, end] = appState.slice
    if (end > start) return [start, end]
    if (appState.query) return [start, start + appState.pageSize]
    return [0, 0]
  }, [appState.slice, appState.query, appState.pageSize])

  const selectionMeta = appState.selectionMeta ?? {}
  const groupDep = selectionGroupDep(appState.selection, selectionMeta)
  const colorsDep = selectionColorsDep(appState.selection, selectionMeta)

  const lookupMap = useMemo(
    () => buildLookupMap(appState.selection, selectionMeta),
    [appState.selection, groupDep],
  )

  const selectedColors = useMemo(
    () => selectedColorsMap(appState.selection, selectionMeta),
    [appState.selection, colorsDep],
  )

  const deferredSelectedColors = useDeferredValue(selectedColors)

  const visibleSpectra = useMemo(
    () => visibleRawSpectra(rawPlotData, showSelected, showQuery),
    [rawPlotData, showQuery, showSelected],
  )

  const hasVisibleSpectra = visibleSpectra.length > 0

  const deactivateHull = useCallback(() => {
    setApplyHull(false)
    setHullPlotData(null)
    setHullRange(null)
    setYDomain(null)
  }, [])

  const plotLoadRef = useRef({ contextKey: null, selectionKey: null })

  useEffect(() => {
    if (status !== 'ready' || !pyodide) return undefined

    const contextKey = `${pageSlice[0]},${pageSlice[1]}|${appState.query}|${appState.pageSize}`
    const selKey = JSON.stringify(appState.selection)
    const selectionOnly =
      plotLoadRef.current.contextKey === contextKey
      && plotLoadRef.current.selectionKey != null
      && plotLoadRef.current.selectionKey !== selKey

    plotLoadRef.current = { contextKey, selectionKey: selKey }

    let cancelled = false
    setLoading(true)
    setError('')

    if (!selectionOnly) {
      setApplyHull(false)
      setHullPlotData(null)
      setHullRange(null)
    }

    runQueued(async () => {
      const [start, end] = pageSlice
      return exportSpectraPlotData(pyodide, start, end, lookupMap)
    })
      .then((data) => {
        if (cancelled) return
        setRawPlotData(data)
        if (!selectionOnly) {
          const defaults = defaultDomainsFromData(data.spectra)
          setXDomain(defaults.xDomain)
          setYDomain(defaults.yDomain)
          setActiveBand('ALL')
        }
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    status,
    pyodide,
    runQueued,
    pageSlice,
    appState.selection,
    appState.query,
    appState.pageSize,
    lookupMap,
  ])

  const hullXDomain = useMemo(() => {
    if (xDomain) return xDomain
    if (!visibleSpectra.length) return [0, 1]
    return defaultDomainsFromData(visibleSpectra).xDomain
  }, [visibleSpectra, xDomain])

  useEffect(() => {
    if (!applyHull || status !== 'ready' || !pyodide) {
      setHullPlotData(null)
      setHullRange(null)
      return undefined
    }

    if (!visibleSpectra.length) {
      setHullPlotData(null)
      setHullRange(null)
      return undefined
    }

    const [xMin, xMax] = hullXDomain
    const spanningNames = filterSpectraBySpan(visibleSpectra, xMin, xMax).map(
      (spectrum) => spectrum.name,
    )

    setHullRange([xMin, xMax])

    if (!spanningNames.length) {
      setHullPlotData({ spectra: [] })
      return undefined
    }

    let cancelled = false
    setHullLoading(true)
    setError('')

    runQueued(async () => applyHullToSpectra(pyodide, spanningNames, xMin, xMax, lookupMap))
      .then((data) => {
        if (cancelled) return
        setHullPlotData(data)
        setHullRange([xMin, xMax])
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        deactivateHull()
      })
      .finally(() => {
        if (!cancelled) setHullLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [applyHull, deactivateHull, hullXDomain, lookupMap, pyodide, runQueued, status, visibleSpectra])

  const displayPlotData = useMemo(() => {
    if (!applyHull) {
      return { spectra: visibleSpectra }
    }

    const [xMin, xMax] = hullXDomain
    const spanning = filterSpectraBySpan(visibleSpectra, xMin, xMax)

    if (hullPlotData) {
      return { spectra: applyHullCorrections(spanning, hullPlotData.spectra) }
    }

    return { spectra: spanning }
  }, [applyHull, hullPlotData, hullXDomain, visibleSpectra])

  const resolvedDomains = useMemo(() => {
    if (!displayPlotData.spectra.length) {
      return { xDomain: [0, 1], yDomain: applyHull ? [0, 1.1] : [0, 100] }
    }
    return computePlotExtents(displayPlotData.spectra, xDomain, yDomain, { hullYAxis: applyHull })
  }, [applyHull, displayPlotData, xDomain, yDomain])

  const resetToAllDomains = useCallback(
    (spectra) => {
      if (!spectra.length) return null

      if (applyHull && hullRange) {
        return defaultPlotDomains(spectra, hullRange, { hullYAxis: true })
      }

      return defaultDomainsFromData(spectra)
    },
    [applyHull, hullRange],
  )

  const handleBrushZoom = useCallback(({ xDomain: nextX, yDomain: nextY }) => {
    setXDomain(nextX)
    setYDomain(nextY)
    setActiveBand('ALL')
  }, [])

  const handleViewPan = useCallback(({ xDomain: nextX, yDomain: nextY }) => {
    deactivateHull()
    setXDomain(nextX)
    setYDomain(nextY)
    setActiveBand('ALL')
  }, [deactivateHull])

  const handleResetZoom = useCallback(() => {
    deactivateHull()
    if (!visibleSpectra.length) return
    const defaults = defaultDomainsFromData(visibleSpectra)
    setXDomain(defaults.xDomain)
    setYDomain(defaults.yDomain)
    setActiveBand('ALL')
  }, [deactivateHull, visibleSpectra])

  const handleBandSelect = useCallback(
    (bandKey) => {
      if (!visibleSpectra.length) return

      deactivateHull()
      setActiveBand(bandKey)

      if (bandKey === 'ALL') {
        const defaults = defaultDomainsFromData(visibleSpectra)
        setXDomain(defaults.xDomain)
        setYDomain(defaults.yDomain)
        return
      }

      const band = SPECTRAL_BANDS[bandKey]
      const [dataXMin, dataXMax] = dataWavelengthExtent(visibleSpectra)
      const nextX = [
        Math.max(band.min, dataXMin),
        Math.min(band.max, dataXMax),
      ]

      if (nextX[1] <= nextX[0]) {
        setXDomain([band.min, band.max])
        const fallback = defaultDomainsFromData(visibleSpectra)
        setYDomain(fallback.yDomain)
        return
      }

      const { yDomain: nextY } = computePlotExtents(visibleSpectra, nextX, null)
      setXDomain(nextX)
      setYDomain(nextY)
    },
    [deactivateHull, visibleSpectra],
  )

  const handleHullToggle = useCallback(() => {
    if (applyHull) {
      deactivateHull()
      return
    }
    if (!hasVisibleSpectra || loading || hullLoading) return
    setYDomain(null)
    setApplyHull(true)
  }, [applyHull, deactivateHull, hasVisibleSpectra, hullLoading, loading])

  const plotBusy = loading || (applyHull && hullLoading)

  return (
    <div className="widget widget-spectra">
      {error ? <p className="spectra-status spectra-status--error">{error}</p> : null}
      {loading ? <p className="spectra-status">Loading spectra…</p> : null}
      {applyHull && hullLoading ? (
        <p className="spectra-status">Applying hull correction…</p>
      ) : null}

      <SpectraPlot
        plotData={displayPlotData}
        xDomain={resolvedDomains.xDomain}
        yDomain={resolvedDomains.yDomain}
        hoveredSpectrum={hoveredSpectrum}
        onHoverSpectrum={setHoveredSpectrum}
        onBrushZoom={handleBrushZoom}
        onViewPan={handleViewPan}
        onResetZoom={handleResetZoom}
        applyHull={applyHull}
        selectedColors={deferredSelectedColors}
      />

      <div className="spectra-toolbar">
        <div className="spectra-controls">
          <label className="spectra-control">
            <input
              type="checkbox"
              checked={showSelected}
              onChange={(event) => {
                deactivateHull()
                setShowSelected(event.target.checked)
              }}
              disabled={plotBusy || rawPlotData.spectra.length === 0}
            />
            Selected
          </label>
          <label className="spectra-control">
            <input
              type="checkbox"
              checked={showQuery}
              onChange={(event) => {
                deactivateHull()
                setShowQuery(event.target.checked)
              }}
              disabled={plotBusy || rawPlotData.spectra.length === 0}
            />
            Query
          </label>
          <button
            type="button"
            className={`spectra-band-button${applyHull ? ' spectra-band-button--active' : ''}`}
            onClick={handleHullToggle}
            disabled={status !== 'ready' || loading || !hasVisibleSpectra}
          >
            Hull
          </button>
          <button
            type="button"
            className="spectra-band-button"
            onClick={handleResetZoom}
            disabled={status !== 'ready' || plotBusy || !hasVisibleSpectra}
          >
            Reset zoom
          </button>
        </div>

        <div className="spectra-band-nav">
          {SPECTRAL_BAND_KEYS.map((bandKey) => (
            <button
              key={bandKey}
              type="button"
              className={`spectra-band-button${activeBand === bandKey ? ' spectra-band-button--active' : ''}`}
              onClick={() => handleBandSelect(bandKey)}
              disabled={status !== 'ready' || plotBusy || visibleSpectra.length === 0}
            >
              {SPECTRAL_BANDS[bandKey].label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
