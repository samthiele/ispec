import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  formatSpectrumDisplayName,
  mixPercentFor,
  parseSpectrumName,
  pruneSelectionMeta,
  selectedColorFor,
  setSelectionColor,
  setSelectionGroup,
  setSelectionMixPercent,
} from '../../app/selectionMeta.js'
import {
  buildMixComponents,
  createPythonWeightedMixture,
  downloadSelectedSpectra,
  removePythonVirtualSpectrum,
  syncPythonVirtualSpectra,
} from '../../app/selectionSync.js'
import {
  isVirtualSpectrum,
  nextMixSpectrumName,
  pruneVirtualMixRecipes,
  pruneVirtualSpectra,
  serializeMixRecipe,
} from '../../app/virtualSpectra.js'
import { resultNameStyle } from '../../app/spectraStyling.js'
import {
  addPythonSelection,
  applyPythonQueryState,
  clearPythonSearch,
  initialSlice,
  clampSlice,
  nextSlice,
  previousSlice,
  removePythonSelection,
  runPythonSearch,
} from '../../app/querySync.js'
import { useLongPress } from '../../app/useLongPress.js'
import { useAppState } from '../../context/useAppState.js'
import { usePyodide } from '../../context/usePyodide.js'
import './Query.css'

const COLOR_COMMIT_MS = 250
const MIX_COMMIT_MS = 250

const SEARCH_TOOLTIP =
  'Search by name or absorption. Use | to OR several queries (results interleaved by rank). Exclude features using ! and add ^ to search for peaks. Ranges can be specified as X-Y.'
const CONFIDENCE_TOOLTIP =
  'Default uncertainty (± nm) when matching absorption features in a search.'
const DOWNLOAD_TOOLTIP =
  'Download selected spectra as .txt files. Caution: this downloads compressed (denoised) spectra, so will not exactly match those in the original library.'
const MIX_TOOLTIP =
  'Create a virtual mixture from selected spectra using their Mix % weights (at least two with weight > 0).'

function parseMixPercent(value) {
  const trimmed = String(value).trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null
  return parsed
}

function formatMixPercent(value) {
  return value == null ? '' : String(value)
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function formatScorePercent(score) {
  return `${(Number(score) * 100).toFixed(1)}%`
}

const SELECT_ACTION_HINT = 'Double-click or long-press to select'
const DESELECT_ACTION_HINT = 'Double-click or long-press to remove'

function QueryResultItem({
  rank,
  name,
  score,
  isSelected,
  isHovered,
  nameStyle,
  onSelect,
  onHover,
}) {
  const longPress = useLongPress(() => onSelect(name))

  return (
    <li
      {...longPress}
      className={`query-result${isSelected ? ' query-result--selected' : ''}${isHovered ? ' query-item--hovered' : ''}`}
      onDoubleClick={() => onSelect(name)}
      onMouseEnter={() => onHover(name)}
      onMouseLeave={() => onHover(null)}
      title={SELECT_ACTION_HINT}
    >
      <span className="query-result-rank">{rank}.</span>
      <span className="query-result-name" style={nameStyle}>
        {name}
      </span>
      <span className="query-result-score">{formatScorePercent(score)}</span>
    </li>
  )
}

function SelectedSpectrumItem({
  canonical,
  color,
  mixPercent,
  selectionMeta,
  hoveredSpectrum,
  onHover,
  onDeselect,
  onGroupChange,
  onColorChange,
  onColorCommit,
  onMixPercentChange,
  onMixPercentCommit,
}) {
  const parsed = useMemo(() => parseSpectrumName(canonical), [canonical])
  const group = selectionMeta?.[canonical]?.group ?? parsed.group ?? ''
  const displayLabel = formatSpectrumDisplayName(parsed, group)
  const longPress = useLongPress(() => onDeselect(canonical))
  const virtual = isVirtualSpectrum(canonical)

  return (
    <li
      {...longPress}
      className={`query-selected-item${hoveredSpectrum === canonical ? ' query-item--hovered' : ''}${virtual ? ' query-selected-item--virtual' : ''}`}
      onDoubleClick={() => onDeselect(canonical)}
      onMouseEnter={() => onHover(canonical)}
      onMouseLeave={() => onHover(null)}
      title={`${displayLabel}\n${DESELECT_ACTION_HINT}`}
    >
      <input
        type="color"
        className="query-selected-color"
        value={color}
        aria-label={`Color for ${parsed.sampleId}`}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onChange={(event) => onColorChange(canonical, event.target.value)}
        onBlur={(event) => onColorCommit(canonical, event.target.value)}
        onPointerUp={(event) => onColorCommit(canonical, event.target.value)}
      />
      <div className="query-selected-body">
        <div className="query-selected-label" style={{ color }}>
          {parsed.archive ? (
            <span className="query-selected-archive">({parsed.archive})</span>
          ) : null}
          <span className="query-selected-group">
            [
            <input
              type="text"
              className="query-selected-group-input"
              value={group}
              aria-label={`Group for ${parsed.sampleId}`}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onChange={(event) => onGroupChange(canonical, event.target.value, parsed.group)}
            />
            ]
          </span>
          <span className="query-selected-sample">{parsed.sampleId}</span>
        </div>
        <label className="query-selected-mix" onClick={(event) => event.stopPropagation()}>
          <span className="query-selected-mix-label">Mix</span>
          <input
            type="text"
            className="query-selected-mix-input"
            inputMode="decimal"
            value={mixPercent}
            aria-label={`Mix weight percent for ${parsed.sampleId}`}
            placeholder="0"
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onChange={(event) => onMixPercentChange(canonical, event.target.value)}
            onBlur={(event) => onMixPercentCommit(canonical, event.target.value)}
          />
          <span className="query-selected-mix-suffix">%</span>
        </label>
      </div>
    </li>
  )
}

export default function Query() {
  const { appState, setQueryState, hoveredSpectrum, setHoveredSpectrum } = useAppState()
  const { status, pyodide, runQueued } = usePyodide()
  const [draftQuery, setDraftQuery] = useState(appState.query)
  const [draftConfidence, setDraftConfidence] = useState(String(appState.confidence))
  const [draftPageSize, setDraftPageSize] = useState(String(appState.pageSize))
  const [searchResults, setSearchResults] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [colorDrafts, setColorDrafts] = useState({})
  const [mixDrafts, setMixDrafts] = useState({})
  const restoredSearchRef = useRef(false)
  const colorTimersRef = useRef({})
  const mixTimersRef = useRef({})
  const selection = appState.selection
  const selectionMeta = appState.selectionMeta ?? {}
  const virtualSpectra = appState.virtualSpectra ?? {}
  const virtualMixRecipes = appState.virtualMixRecipes ?? {}
  const selectionMetaRef = useRef(selectionMeta)
  selectionMetaRef.current = selectionMeta

  useEffect(() => {
    setDraftQuery(appState.query)
  }, [appState.query])

  useEffect(() => {
    setDraftConfidence(String(appState.confidence))
  }, [appState.confidence])

  useEffect(() => {
    setDraftPageSize(String(appState.pageSize))
  }, [appState.pageSize])

  useEffect(() => {
    setColorDrafts({})
    setMixDrafts({})
  }, [selection])

  useEffect(() => () => {
    Object.values(colorTimersRef.current).forEach(clearTimeout)
    Object.values(mixTimersRef.current).forEach(clearTimeout)
  }, [])

  const effectiveColor = useCallback(
    (canonical) => colorDrafts[canonical] ?? selectedColorFor(canonical, selectionMeta),
    [colorDrafts, selectionMeta],
  )

  const effectiveMixPercent = useCallback(
    (canonical) => {
      if (Object.prototype.hasOwnProperty.call(mixDrafts, canonical)) {
        return mixDrafts[canonical]
      }
      return formatMixPercent(mixPercentFor(canonical, selectionMeta))
    },
    [mixDrafts, selectionMeta],
  )

  const resolvedMixPercents = useCallback(() => {
    const percents = {}
    for (const name of selection) {
      const parsed = parseMixPercent(effectiveMixPercent(name))
      if (parsed != null) {
        percents[name] = parsed
      }
    }
    return percents
  }, [effectiveMixPercent, selection])

  useEffect(() => {
    if (status !== 'ready' || !pyodide || restoredSearchRef.current) return
    const query = appState.query.trim()
    if (!query) return

    restoredSearchRef.current = true
    setBusy(true)
    setError('')

    runQueued(async () => {
      const results = await runPythonSearch(pyodide, query, appState.confidence)
      setSearchResults(results)
    })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        setBusy(false)
      })
  }, [status, pyodide, appState.query, appState.confidence, runQueued])

  const total = searchResults?.total ?? 0
  const selectedSet = useMemo(() => new Set(selection), [selection])
  const activeSlice = useMemo(
    () => clampSlice(appState.slice, total, appState.pageSize),
    [appState.slice, appState.pageSize, total],
  )

  const visibleResults = useMemo(() => {
    if (!searchResults || total === 0) return []
    const [start, end] = activeSlice
    return searchResults.names.slice(start, end).map((name, index) => ({
      rank: start + index + 1,
      name,
      score: searchResults.scores[start + index],
    }))
  }, [activeSlice, searchResults, total])

  const resultStyleContext = useMemo(
    () => ({
      ranks: visibleResults.map((result) => result.rank),
      scores: visibleResults.map((result) => result.score),
    }),
    [visibleResults],
  )

  const canGoPrev = activeSlice[0] > 0
  const canGoNext = activeSlice[1] < total

  async function syncPythonQuery(query, slice, nextSelection = selection) {
    if (!pyodide) return
    await applyPythonQueryState(pyodide, { query, slice, selection: nextSelection })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (status !== 'ready' || busy || !pyodide) return

    const query = draftQuery.trim()
    const confidence = parsePositiveNumber(draftConfidence, appState.confidence)
    const pageSize = parsePositiveNumber(draftPageSize, appState.pageSize)

    setBusy(true)
    setError('')

    try {
      await runQueued(async () => {
        if (!query) {
          await clearPythonSearch(pyodide)
          setSearchResults(null)
          const nextState = { query: '', slice: [0, 0], confidence, pageSize }
          setQueryState(nextState)
          await syncPythonQuery('', [0, 0])
          return
        }

        const results = await runPythonSearch(pyodide, query, confidence)
        const slice = initialSlice(results.total, pageSize)
        setSearchResults(results)
        setQueryState({ query, slice, confidence, pageSize })
        await syncPythonQuery(query, slice)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleClear() {
    if (status !== 'ready' || busy || !pyodide) return

    setBusy(true)
    setError('')
    setDraftQuery('')

    try {
      await runQueued(async () => {
        await clearPythonSearch(pyodide)
        setSearchResults(null)
        const nextState = {
          query: '',
          slice: [0, 0],
          confidence: parsePositiveNumber(draftConfidence, appState.confidence),
          pageSize: parsePositiveNumber(draftPageSize, appState.pageSize),
        }
        setQueryState(nextState)
        await syncPythonQuery('', [0, 0])
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handlePrev() {
    if (!canGoPrev || busy || !pyodide) return
    const pageSize = parsePositiveNumber(draftPageSize, appState.pageSize)
    const slice = previousSlice(activeSlice, pageSize, total)
    setQueryState({ slice, pageSize })
    await runQueued(() => syncPythonQuery(appState.query, slice))
  }

  async function handleNext() {
    if (!canGoNext || busy || !pyodide) return
    const pageSize = parsePositiveNumber(draftPageSize, appState.pageSize)
    const slice = nextSlice(activeSlice, pageSize, total)
    setQueryState({ slice, pageSize })
    await runQueued(() => syncPythonQuery(appState.query, slice))
  }

  async function handleSelectResult(name) {
    if (status !== 'ready' || busy || !pyodide || selectedSet.has(name)) return

    try {
      const next = await runQueued(() => addPythonSelection(pyodide, name))
      setQueryState({ selection: next })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDeselect(name) {
    if (status !== 'ready' || busy || !pyodide) return

    try {
      const next = await runQueued(async () => {
        const nextSelection = await removePythonSelection(pyodide, name)
        if (isVirtualSpectrum(name)) {
          await removePythonVirtualSpectrum(pyodide, name)
        }
        const nextVirtual = pruneVirtualSpectra(virtualSpectra, nextSelection)
        const nextRecipes = pruneVirtualMixRecipes(virtualMixRecipes, nextSelection)
        await syncPythonVirtualSpectra(pyodide, nextVirtual)
        return { nextSelection, nextVirtual, nextRecipes }
      })
      setQueryState({
        selection: next.nextSelection,
        selectionMeta: pruneSelectionMeta(selectionMeta, next.nextSelection),
        virtualSpectra: next.nextVirtual,
        virtualMixRecipes: next.nextRecipes,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleGroupChange(canonical, group, originalGroup) {
    setQueryState({
      selectionMeta: setSelectionGroup(selectionMeta, canonical, group, originalGroup),
    })
  }

  function commitSelectionColor(canonical, color) {
    setQueryState({
      selectionMeta: setSelectionColor(selectionMetaRef.current, canonical, color),
    })
    setColorDrafts((prev) => {
      if (prev[canonical] === undefined) return prev
      const next = { ...prev }
      delete next[canonical]
      return next
    })
  }

  function handleColorChange(canonical, color) {
    setColorDrafts((prev) => ({ ...prev, [canonical]: color }))
    const timers = colorTimersRef.current
    clearTimeout(timers[canonical])
    timers[canonical] = setTimeout(() => {
      commitSelectionColor(canonical, color)
      delete timers[canonical]
    }, COLOR_COMMIT_MS)
  }

  function handleColorCommit(canonical, color) {
    clearTimeout(colorTimersRef.current[canonical])
    delete colorTimersRef.current[canonical]
    commitSelectionColor(canonical, color)
  }

  function commitSelectionMixPercent(canonical, value) {
    setQueryState({
      selectionMeta: setSelectionMixPercent(selectionMetaRef.current, canonical, parseMixPercent(value)),
    })
    setMixDrafts((prev) => {
      if (prev[canonical] === undefined) return prev
      const next = { ...prev }
      delete next[canonical]
      return next
    })
  }

  function handleMixPercentChange(canonical, value) {
    setMixDrafts((prev) => ({ ...prev, [canonical]: value }))
    const timers = mixTimersRef.current
    clearTimeout(timers[canonical])
    timers[canonical] = setTimeout(() => {
      commitSelectionMixPercent(canonical, value)
      delete timers[canonical]
    }, MIX_COMMIT_MS)
  }

  function handleMixPercentCommit(canonical, value) {
    clearTimeout(mixTimersRef.current[canonical])
    delete mixTimersRef.current[canonical]
    commitSelectionMixPercent(canonical, value)
  }

  async function handleDownloadSelected() {
    if (status !== 'ready' || busy || !pyodide || selection.length === 0) return

    setBusy(true)
    setError('')

    try {
      await runQueued(() => downloadSelectedSpectra(pyodide, selection, selectionMeta))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleMixSelected() {
    if (status !== 'ready' || busy || !pyodide || selection.length === 0) return

    const mixPercents = resolvedMixPercents()
    const components = buildMixComponents(selection, selectionMeta, mixPercents)
    if (components.length < 2) {
      setError('Set mix weights (> 0) on at least two selected spectra before mixing.')
      return
    }

    const mixName = nextMixSpectrumName(selection, virtualSpectra)
    setBusy(true)
    setError('')

    try {
      const result = await runQueued(async () => {
        const mixed = await createPythonWeightedMixture(pyodide, components, mixName)
        const nextVirtual = {
          ...virtualSpectra,
          [mixName]: {
            wavelengths: mixed.wavelengths,
            reflectance: mixed.reflectance,
          },
        }
        const nextRecipes = {
          ...virtualMixRecipes,
          [mixName]: serializeMixRecipe(components),
        }
        await syncPythonVirtualSpectra(pyodide, nextVirtual)
        const nextSelection = await addPythonSelection(pyodide, mixName)
        return { nextVirtual, nextSelection, nextRecipes }
      })

      setQueryState({
        selection: result.nextSelection,
        virtualSpectra: result.nextVirtual,
        virtualMixRecipes: result.nextRecipes,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const mixComponentCount = buildMixComponents(selection, selectionMeta, resolvedMixPercents()).length

  const rangeLabel =
    total > 0
      ? `${activeSlice[0] + 1}–${activeSlice[1]} of ${total}`
      : appState.query
        ? 'No matches'
        : 'No search'

  return (
    <div className="widget widget-query">
      <form className="query-form" onSubmit={handleSubmit}>
        <label
          className="query-field query-field--search"
          data-tooltip={SEARCH_TOOLTIP}
        >
          <span className="query-label">Search</span>
          <input
            className="query-input"
            type="search"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder='e.g. "2200" or "Clay"'
            disabled={status !== 'ready' || busy}
          />
        </label>

        <div className="query-options">
          <label className="query-field" data-tooltip={CONFIDENCE_TOOLTIP}>
            <span className="query-label">Confidence (± nm)</span>
            <input
              className="query-input query-input--small"
              type="text"
              inputMode="decimal"
              value={draftConfidence}
              onChange={(event) => setDraftConfidence(event.target.value)}
              disabled={status !== 'ready' || busy}
            />
          </label>

          <label className="query-field">
            <span className="query-label">Results per page</span>
            <input
              className="query-input query-input--small"
              type="text"
              inputMode="numeric"
              value={draftPageSize}
              onChange={(event) => setDraftPageSize(event.target.value)}
              disabled={status !== 'ready' || busy}
            />
          </label>

          <button
            type="submit"
            className="query-submit"
            disabled={status !== 'ready' || busy}
          >
            Search
          </button>
        </div>
      </form>

      {error ? <p className="query-status query-status--error">{error}</p> : null}

      <div className="query-panels">
        <div
          className={`query-results-panel query-selected-panel${selection.length === 0 ? ' query-selected-panel--empty' : ''}`}
        >
          <div className="query-results-header">
            <div className="query-results-header-main">
              <h3 className="query-results-title">Selected</h3>
              <span className="query-results-range">
                {selection.length === 0 ? 'None' : `${selection.length} selected`}
              </span>
            </div>
            <div className="query-selected-actions">
              <span data-tooltip={DOWNLOAD_TOOLTIP}>
                <button
                  type="button"
                  className="query-selected-action"
                  onClick={handleDownloadSelected}
                  disabled={busy || status !== 'ready' || selection.length === 0}
                >
                  Download
                </button>
              </span>
              <span data-tooltip={MIX_TOOLTIP}>
                <button
                  type="button"
                  className="query-selected-action"
                  onClick={handleMixSelected}
                  disabled={busy || status !== 'ready' || mixComponentCount < 2}
                >
                  Mix
                </button>
              </span>
            </div>
          </div>

          <ul className="query-results" role="list">
            {selection.length === 0 ? (
              <li className="query-results-empty">Double-click or long-press a result to select it.</li>
            ) : (
              selection.map((name) => (
                <SelectedSpectrumItem
                  key={name}
                  canonical={name}
                  color={effectiveColor(name)}
                  mixPercent={effectiveMixPercent(name)}
                  selectionMeta={selectionMeta}
                  hoveredSpectrum={hoveredSpectrum}
                  onHover={setHoveredSpectrum}
                  onDeselect={handleDeselect}
                  onGroupChange={handleGroupChange}
                  onColorChange={handleColorChange}
                  onColorCommit={handleColorCommit}
                  onMixPercentChange={handleMixPercentChange}
                  onMixPercentCommit={handleMixPercentCommit}
                />
              ))
            )}
          </ul>
        </div>

        <div className="query-results-group">
          <div className="query-results-panel">
            <div className="query-results-header">
              <h3 className="query-results-title">Results</h3>
              <span className="query-results-range">{rangeLabel}</span>
            </div>

            <ul className="query-results" role="list">
              {visibleResults.length === 0 ? (
                <li className="query-results-empty">
                  {appState.query ? 'No matching spectra.' : 'Run a search to see results.'}
                </li>
              ) : (
                visibleResults.map(({ rank, name, score }) => {
                  const isSelected = selectedSet.has(name)
                  const isHovered = hoveredSpectrum === name
                  const nameStyle = resultNameStyle(
                    {
                      rank,
                      score,
                      selected: isSelected,
                      hovered: isHovered,
                      color: isSelected ? effectiveColor(name) : undefined,
                    },
                    resultStyleContext.ranks,
                    resultStyleContext.scores,
                  )

                  return (
                    <QueryResultItem
                      key={`${rank}-${name}`}
                      rank={rank}
                      name={name}
                      score={score}
                      isSelected={isSelected}
                      isHovered={isHovered}
                      nameStyle={nameStyle}
                      onSelect={handleSelectResult}
                      onHover={setHoveredSpectrum}
                    />
                  )
                })
              )}
            </ul>
          </div>

          <div className="query-nav">
            <button
              type="button"
              className="query-nav-button"
              onClick={handlePrev}
              disabled={!canGoPrev || busy || status !== 'ready'}
            >
              Prev
            </button>
            <button
              type="button"
              className="query-nav-button"
              onClick={handleClear}
              disabled={busy || status !== 'ready' || (!appState.query && total === 0)}
            >
              Clear
            </button>
            <button
              type="button"
              className="query-nav-button"
              onClick={handleNext}
              disabled={!canGoNext || busy || status !== 'ready'}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
