import { useCallback, useEffect, useDeferredValue, useMemo, useRef, useState } from 'react'
import {
  applyHullCorrections,
  applyHullToSpectra,
  clampPlotYDomainMin,
  clipSpectraToXRange,
  computePlotExtents,
  exportSpectraPlotData,
  filterPlotSpectra,
  filterSpectraBySpan,
  HULL_Y_DOMAIN,
  normalizePlotYDomain,
} from '../../app/spectraSync.js'
import {
  buildLookupMap,
  selectedColorsMap,
  selectionColorsDep,
  selectionGroupDep,
  spectrumHoverLabel,
} from '../../app/selectionMeta.js'
import { SPECTRAL_BANDS, SPECTRAL_BAND_KEYS } from '../../app/spectralBands.js'
import { findBiplotPaneState, mergeBiplotPaneState } from '../../app/biplotState.js'
import { parseSearchQueryWavelengths } from '../../app/querySync.js'
import {
  compactSpectraPaneState,
  hasSavedSpectraView,
  isPlaceholderEmptyDomain,
  mergeSpectraPaneState,
} from '../../app/spectraState.js'
import { spectraCrosshairWavelengths } from '../../app/spectralExpression.js'
import { buildSpectraLegendSections } from '../../app/plotLegend.js'
import { useCoreAppState } from '../../context/useAppState.js'
import { useInteraction } from '../../context/useInteraction.js'
import { usePyodide } from '../../context/usePyodide.js'
import SpectraPlot, { dataWavelengthExtent, defaultDomainsFromData } from './SpectraPlot.jsx'
import PlotSaveMenu from '../PlotSaveMenu.jsx'
import './Spectra.css'

const HULL_TOOLTIP =
  'Continuum removal on the current view range when enabled. Hull stays fixed while you pan or zoom; double-click resets to that range. Click Hull again to show uncorrected spectra.'

function visibleRawSpectra(rawPlotData, showSelected, showQuery) {
  return filterPlotSpectra(rawPlotData.spectra, { showSelected, showQuery })
}

export default function Spectra({ paneIndex, paneState }) {
  const { appState, updatePane } = useCoreAppState()
  const { hoveredSpectrum, setHoveredSpectrum, biplotCrosshair } = useInteraction()
  const savedPane = useMemo(() => mergeSpectraPaneState(paneState), [paneState])
  const { status, pyodide, runQueued } = usePyodide()
  const [rawPlotData, setRawPlotData] = useState({ spectra: [] })
  const [hullPlotData, setHullPlotData] = useState(null)
  const [hullCalcRange, setHullCalcRange] = useState(savedPane.hullRange)
  const [hullSpanningNames, setHullSpanningNames] = useState(null)
  const [loading, setLoading] = useState(false)
  const [hullLoading, setHullLoading] = useState(false)
  const [error, setError] = useState('')
  const [xDomain, setXDomain] = useState(savedPane.xDomain)
  const [yDomain, setYDomain] = useState(savedPane.yDomain)
  const [activeBand, setActiveBand] = useState(savedPane.activeBand)
  const [showSelected, setShowSelected] = useState(true)
  const [showQuery, setShowQuery] = useState(true)
  const [applyHull, setApplyHull] = useState(savedPane.applyHull)

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

  const hoverLabel = useMemo(
    () => spectrumHoverLabel(hoveredSpectrum, selectionMeta),
    [hoveredSpectrum, selectionMeta, groupDep],
  )

  const biplotConfig = useMemo(
    () => mergeBiplotPaneState(findBiplotPaneState(appState.panes)),
    [appState.panes],
  )

  const positionGuideWavelengths = useMemo(() => {
    const fromQuery = parseSearchQueryWavelengths(appState.query)
    const fromCrosshair = spectraCrosshairWavelengths(
      biplotCrosshair,
      biplotConfig.xExpr,
      biplotConfig.yExpr,
    )
    return [...new Set([...fromQuery, ...fromCrosshair])].sort((left, right) => left - right)
  }, [appState.query, biplotConfig.xExpr, biplotConfig.yExpr, biplotCrosshair])

  const visibleSpectra = useMemo(
    () => visibleRawSpectra(rawPlotData, showSelected, showQuery),
    [rawPlotData, showQuery, showSelected],
  )

  const hasVisibleSpectra = visibleSpectra.length > 0

  const plotLoadRef = useRef({ contextKey: null, selectionKey: null })
  const hullSnapshotRef = useRef(null)
  const hullInFlightRef = useRef(null)
  const lastWrittenPaneRef = useRef(null)
  const paneStateRef = useRef(paneState)
  const hasPlotDataRef = useRef(false)
  paneStateRef.current = paneState
  hasPlotDataRef.current = rawPlotData.spectra.length > 0

  const deactivateHull = useCallback(() => {
    setApplyHull(false)
    setHullPlotData(null)
    setHullCalcRange(null)
    setHullSpanningNames(null)
    hullSnapshotRef.current = null
    hullInFlightRef.current = null
  }, [])

  const writeSpectraPane = useCallback(
    (next) => {
      const compact = compactSpectraPaneState(next)
      const current = compactSpectraPaneState(paneState)
      if (JSON.stringify(compact) === JSON.stringify(current)) return
      lastWrittenPaneRef.current = compact
      updatePane(paneIndex, { state: compact })
    },
    [paneIndex, paneState, updatePane],
  )

  const persistTimerRef = useRef(null)

  const scheduleWriteSpectraPane = useCallback(
    (next) => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current)
      persistTimerRef.current = window.setTimeout(() => {
        writeSpectraPane(next)
      }, 300)
    },
    [writeSpectraPane],
  )

  useEffect(
    () => () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!hasSavedSpectraView(savedPane)) return

    const compact = compactSpectraPaneState(savedPane)
    if (
      lastWrittenPaneRef.current
      && JSON.stringify(compact) === JSON.stringify(lastWrittenPaneRef.current)
    ) {
      lastWrittenPaneRef.current = null
      return
    }

    setXDomain(savedPane.xDomain)
    setYDomain(normalizePlotYDomain(savedPane.yDomain))
    setActiveBand(savedPane.activeBand)
    setApplyHull(savedPane.applyHull)
    setHullCalcRange(savedPane.applyHull ? (savedPane.hullRange ?? savedPane.xDomain) : null)
    if (!savedPane.applyHull) {
      setHullSpanningNames(null)
    }
  }, [savedPane])

  useEffect(() => {
    if (!applyHull || !hullCalcRange || hullSpanningNames?.length) return undefined
    if (!visibleSpectra.length) return undefined

    const [xMin, xMax] = hullCalcRange
    const names = filterSpectraBySpan(visibleSpectra, xMin, xMax).map((spectrum) => spectrum.name)
    setHullSpanningNames(names)
    return undefined
  }, [applyHull, hullCalcRange, hullSpanningNames, visibleSpectra])

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
    const silentRefresh = selectionOnly && hasPlotDataRef.current
    if (!silentRefresh) {
      setLoading(true)
    }
    setError('')

    if (!selectionOnly) {
      if (!hasSavedSpectraView(mergeSpectraPaneState(paneStateRef.current))) {
        setApplyHull(false)
        setHullPlotData(null)
        setHullCalcRange(null)
      }
    }

    runQueued(async () => {
      const [start, end] = pageSlice
      return exportSpectraPlotData(pyodide, start, end, lookupMap)
    })
      .then((data) => {
        if (cancelled) return
        setRawPlotData(data)
        const saved = mergeSpectraPaneState(paneStateRef.current)
        const defaults = defaultDomainsFromData(data.spectra)
        const explicitView = hasSavedSpectraView(saved)

        if (selectionOnly && explicitView) {
          return
        }

        if (explicitView) {
          const nextX = isPlaceholderEmptyDomain(saved.xDomain)
            ? defaults.xDomain
            : (saved.xDomain ?? defaults.xDomain)
          setXDomain(nextX)
          setYDomain(saved.yDomain ?? defaults.yDomain)
          setActiveBand(saved.activeBand)
          setApplyHull(saved.applyHull)
          setHullCalcRange(saved.applyHull ? (saved.hullRange ?? nextX) : null)
          if (saved.applyHull) {
            setHullSpanningNames(null)
            hullSnapshotRef.current = null
            hullInFlightRef.current = null
          }
          return
        }

        setXDomain(defaults.xDomain)
        setYDomain(defaults.yDomain)
        setActiveBand('ALL')
        setApplyHull(false)
        setHullPlotData(null)
        setHullCalcRange(null)
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

  useEffect(() => {
    if (!applyHull || status !== 'ready' || !pyodide || !hullCalcRange) {
      if (!applyHull) {
        setHullPlotData(null)
        hullSnapshotRef.current = null
        hullInFlightRef.current = null
      }
      return undefined
    }

    const snapshotKey = `${hullCalcRange[0]}-${hullCalcRange[1]}`
    if (hullSnapshotRef.current === snapshotKey) {
      return undefined
    }

    if (!hullSpanningNames?.length) {
      if (Array.isArray(hullSpanningNames)) {
        hullSnapshotRef.current = snapshotKey
        setHullPlotData({ spectra: [] })
      }
      return undefined
    }

    if (hullInFlightRef.current === snapshotKey) {
      return undefined
    }

    const [xMin, xMax] = hullCalcRange
    let cancelled = false
    hullInFlightRef.current = snapshotKey
    setHullLoading(true)
    setError('')

    runQueued(async () => applyHullToSpectra(pyodide, hullSpanningNames, xMin, xMax, lookupMap))
      .then((data) => {
        if (cancelled) return
        hullSnapshotRef.current = snapshotKey
        setHullPlotData(data)
      })
      .catch((err) => {
        if (cancelled) return
        hullSnapshotRef.current = null
        setError(err instanceof Error ? err.message : String(err))
        deactivateHull()
      })
      .finally(() => {
        if (hullInFlightRef.current === snapshotKey) {
          hullInFlightRef.current = null
        }
        if (!cancelled) setHullLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [applyHull, deactivateHull, hullCalcRange, hullSpanningNames, lookupMap, pyodide, runQueued, status])

  const displayPlotData = useMemo(() => {
    if (!applyHull) {
      return { spectra: visibleSpectra }
    }

    if (!hullPlotData || !hullCalcRange) {
      return { spectra: [] }
    }

    const corrected = applyHullCorrections(visibleSpectra, hullPlotData.spectra)
    const [xMin, xMax] = hullCalcRange
    return { spectra: clipSpectraToXRange(corrected, xMin, xMax) }
  }, [applyHull, hullCalcRange, hullPlotData, visibleSpectra])

  const resolvedDomains = useMemo(() => {
    if (!displayPlotData.spectra.length) {
      return { xDomain: [0, 1], yDomain: applyHull ? [0, 105] : [0, 100] }
    }
    return computePlotExtents(
      displayPlotData.spectra,
      xDomain,
      normalizePlotYDomain(yDomain),
      { hullYAxis: applyHull },
    )
  }, [applyHull, displayPlotData, xDomain, yDomain])

  const persistSpectraView = useCallback(
    (patch) => {
      const payload = {
        xDomain,
        yDomain,
        activeBand,
        applyHull,
        ...(applyHull && hullCalcRange ? { hullRange: hullCalcRange } : {}),
        ...patch,
      }
      if (!payload.applyHull) {
        delete payload.hullRange
      }
      writeSpectraPane(payload)
    },
    [activeBand, applyHull, hullCalcRange, writeSpectraPane, xDomain, yDomain],
  )

  const normalizeViewYDomain = useCallback(
    (nextY) => {
      const normalized = normalizePlotYDomain(nextY) ?? clampPlotYDomainMin(nextY)
      if (!normalized) {
        return applyHull ? [...HULL_Y_DOMAIN] : normalized
      }
      return normalized
    },
    [applyHull],
  )

  const handleBrushZoom = useCallback(
    ({ xDomain: nextX, yDomain: nextY }) => {
      const clampedY = normalizeViewYDomain(nextY)
      setXDomain(nextX)
      setYDomain(clampedY)
      setActiveBand('ALL')
      persistSpectraView({
        xDomain: nextX,
        yDomain: clampedY,
        activeBand: 'ALL',
      })
    },
    [normalizeViewYDomain, persistSpectraView],
  )

  const handleViewPan = useCallback(
    ({ xDomain: nextX, yDomain: nextY }) => {
      const clampedY = normalizeViewYDomain(nextY)
      setXDomain(nextX)
      setYDomain(clampedY)
      setActiveBand('ALL')
      scheduleWriteSpectraPane({
        xDomain: nextX,
        yDomain: clampedY,
        activeBand: 'ALL',
        applyHull,
        ...(applyHull && hullCalcRange ? { hullRange: hullCalcRange } : {}),
      })
    },
    [applyHull, hullCalcRange, normalizeViewYDomain, scheduleWriteSpectraPane],
  )

  const handleBandSelect = useCallback(
    (bandKey) => {
      if (!visibleSpectra.length) return

      setActiveBand(bandKey)

      const persistBandView = (nextX, nextY, nextBand) => {
        writeSpectraPane({
          xDomain: nextX,
          yDomain: nextY,
          activeBand: nextBand,
          applyHull,
          ...(applyHull && hullCalcRange ? { hullRange: hullCalcRange } : {}),
        })
      }

      if (bandKey === 'ALL') {
        const defaults = defaultDomainsFromData(visibleSpectra)
        setXDomain(defaults.xDomain)
        setYDomain(defaults.yDomain)
        persistBandView(defaults.xDomain, defaults.yDomain, 'ALL')
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
        persistBandView([band.min, band.max], fallback.yDomain, bandKey)
        return
      }

      const { yDomain: nextY } = computePlotExtents(visibleSpectra, nextX, null)
      setXDomain(nextX)
      setYDomain(nextY)
      persistBandView(nextX, nextY, bandKey)
    },
    [applyHull, hullCalcRange, visibleSpectra, writeSpectraPane],
  )

  const handleResetZoom = useCallback(() => {
    if (applyHull && hullCalcRange) {
      const nextX = [...hullCalcRange]
      const nextY = [...HULL_Y_DOMAIN]
      setXDomain(nextX)
      setYDomain(nextY)
      setActiveBand('ALL')
      persistSpectraView({
        xDomain: nextX,
        yDomain: nextY,
        activeBand: 'ALL',
      })
      return
    }
    handleBandSelect('ALL')
  }, [applyHull, handleBandSelect, hullCalcRange, persistSpectraView])

  const handleHullToggle = useCallback(() => {
    if (applyHull) {
      deactivateHull()
      writeSpectraPane({
        xDomain,
        yDomain: normalizePlotYDomain(yDomain),
        activeBand,
        applyHull: false,
      })
      return
    }
    if (!hasVisibleSpectra || (loading && rawPlotData.spectra.length === 0) || (applyHull && hullLoading && !hullPlotData)) return

    const calcRange = xDomain?.length === 2
      ? [...xDomain]
      : defaultDomainsFromData(visibleSpectra).xDomain
    const spanningNames = filterSpectraBySpan(visibleSpectra, calcRange[0], calcRange[1]).map(
      (spectrum) => spectrum.name,
    )

    hullSnapshotRef.current = null
    hullInFlightRef.current = null
    setHullPlotData(null)
    setHullSpanningNames(spanningNames)
    setHullCalcRange(calcRange)
    setYDomain([...HULL_Y_DOMAIN])
    setApplyHull(true)
    writeSpectraPane({
      xDomain,
      yDomain: [...HULL_Y_DOMAIN],
      activeBand,
      applyHull: true,
      hullRange: calcRange,
    })
  }, [
    activeBand,
    applyHull,
    deactivateHull,
    hasVisibleSpectra,
    hullLoading,
    hullPlotData,
    loading,
    rawPlotData.spectra.length,
    visibleSpectra,
    writeSpectraPane,
    xDomain,
    yDomain,
  ])

  const spectraLoading = loading && rawPlotData.spectra.length === 0
  const hullBusy = applyHull && hullLoading && !hullPlotData
  const plotBusy = spectraLoading || hullBusy
  const plotHostRef = useRef(null)

  const legendSections = useMemo(
    () => buildSpectraLegendSections(displayPlotData.spectra, {
      selection: appState.selection,
      selectionMeta,
      selectedColors: deferredSelectedColors,
      showSelected,
      showQuery,
    }),
    [
      appState.selection,
      deferredSelectedColors,
      displayPlotData.spectra,
      selectionMeta,
      showQuery,
      showSelected,
    ],
  )

  return (
    <div className="widget widget-spectra">
      {error ? <p className="spectra-status spectra-status--error">{error}</p> : null}
      {spectraLoading ? <p className="spectra-status">Loading spectra…</p> : null}
      {hullBusy ? (
        <p className="spectra-status">Applying hull correction…</p>
      ) : null}

      <SpectraPlot
        hostRef={plotHostRef}
        overlay={
          <>
            <PlotSaveMenu
              containerRef={plotHostRef}
              basename="spectra"
              className="spectra-save-menu"
              disabled={plotBusy || !hasVisibleSpectra}
              legendSections={legendSections}
            />
            {hoverLabel ? (
              <p className="plot-hover-name" aria-live="polite">
                {hoverLabel}
              </p>
            ) : null}
          </>
        }
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
        positionGuideWavelengths={positionGuideWavelengths}
      />

      <div className="spectra-toolbar">
        <div className="spectra-controls">
          <label className="spectra-control">
            <input
              type="checkbox"
              checked={showSelected}
              onChange={(event) => {
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
                setShowQuery(event.target.checked)
              }}
              disabled={plotBusy || rawPlotData.spectra.length === 0}
            />
            Query
          </label>
          <span data-tooltip={HULL_TOOLTIP}>
            <button
              type="button"
              className={`spectra-band-button${applyHull ? ' spectra-band-button--active' : ''}`}
              onClick={handleHullToggle}
              disabled={status !== 'ready' || spectraLoading || !hasVisibleSpectra}
            >
              Hull
            </button>
          </span>
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
