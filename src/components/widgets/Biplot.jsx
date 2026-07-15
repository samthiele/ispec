import { useCallback, useMemo, useState } from 'react'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { Group } from '@visx/group'
import { ParentSize } from '@visx/responsive'
import { scaleLinear } from '@visx/scale'
import { Circle } from '@visx/shape'
import { exportBiplotData } from '../../app/biplotSync.js'
import {
  DEFAULT_BIPLOT_COLOR_MAX,
  DEFAULT_BIPLOT_COLOR_MIN,
  DEFAULT_BIPLOT_OPACITY_MAX,
  DEFAULT_BIPLOT_OPACITY_MIN,
  DEFAULT_BIPLOT_SIZE_MAX,
  DEFAULT_BIPLOT_SIZE_MIN,
  biplotColorbarGradient,
  formatLimitLabel,
  resolveBiplotLimits,
  styleBiplotPoint,
} from '../../app/biplotStyling.js'
import {
  buildLookupMap,
  selectedColorsMap,
  selectionColorsDep,
  selectionGroupDep,
} from '../../app/selectionMeta.js'
import { useAppState } from '../../context/useAppState.js'
import { usePyodide } from '../../context/usePyodide.js'
import './Biplot.css'

const plotMargin = { top: 12, right: 12, bottom: 42, left: 52 }

const ATTRIBUTE_EXPR_TOOLTIP =
  'Band math: HyData.eval (e.g. 2100 / 2200). Features: 2200D/P, ^11500D/P, 2100-2400D/P. D = depth, P = position. ^ selects peak maxima instead of absorption minima.'
const FEATURE_WIDTH_TOOLTIP =
  'Half-width in nm for single-wavelength features (e.g. 2200D). Ignored for explicit ranges like 2200-2400D/P.'
const LIMIT_TOOLTIP = 'Integer limits = percentiles; decimals = absolute values.'

export const DEFAULT_BIPLOT_PANE_STATE = {
  xExpr: '2200-2400P',
  yExpr: '^8500-12000P',
  width: 50,
  colorExpr: '2200-2400D',
  colorMin: DEFAULT_BIPLOT_COLOR_MIN,
  colorMax: DEFAULT_BIPLOT_COLOR_MAX,
  opacityExpr: '',
  opacityMin: DEFAULT_BIPLOT_OPACITY_MIN,
  opacityMax: DEFAULT_BIPLOT_OPACITY_MAX,
  sizeExpr: '^8500-12000D',
  sizeMin: DEFAULT_BIPLOT_SIZE_MIN,
  sizeMax: DEFAULT_BIPLOT_SIZE_MAX,
}

function mergePaneState(paneState) {
  return { ...DEFAULT_BIPLOT_PANE_STATE, ...(paneState ?? {}) }
}

function parseNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function extentWithPadding(values, padFraction = 0.08) {
  const finite = values.filter((value) => Number.isFinite(value))
  if (!finite.length) return [0, 1]
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.1, 0.01)
    return [min - pad, max + pad]
  }
  const pad = (max - min) * padFraction
  return [min - pad, max + pad]
}

function CogIcon() {
  return (
    <svg className="biplot-settings-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Zm8.94 4.66-.98-.56a7.06 7.06 0 0 0 0-2.2l.98-.56a1 1 0 0 0 .37-1.37l-.94-1.62a1 1 0 0 0-1.28-.42l-.98.41a7.18 7.18 0 0 0-1.9-1.1l-.15-1.05A1 1 0 0 0 14.9 2h-1.8a1 1 0 0 0-.99.84l-.15 1.05c-.68.26-1.32.62-1.9 1.1l-.98-.41a1 1 0 0 0-1.28.42L6.06 6.62a1 1 0 0 0 .37 1.37l.98.56a7.06 7.06 0 0 0 0 2.2l-.98.56a1 1 0 0 0-.37 1.37l.94 1.62a1 1 0 0 0 1.28.42l.98-.41c.58.48 1.22.84 1.9 1.1l.15 1.05c.1.66.62 1.14 1.28 1.14h1.8c.66 0 1.18-.48 1.28-1.14l.15-1.05a7.18 7.18 0 0 0 1.9-1.1l.98.41a1 1 0 0 0 1.28-.42l.94-1.62a1 1 0 0 0-.37-1.37Z"
      />
    </svg>
  )
}

function LimitRow({ min, max, onMinChange, onMaxChange, disabled, tooltip }) {
  return (
    <div className="biplot-limit-row" data-tooltip={tooltip}>
      <input
        className="biplot-input biplot-input--compact"
        type="text"
        inputMode="decimal"
        value={min}
        onChange={(event) => onMinChange(event.target.value)}
        disabled={disabled}
        aria-label="Minimum limit"
      />
      <span className="biplot-limit-sep">–</span>
      <input
        className="biplot-input biplot-input--compact"
        type="text"
        inputMode="decimal"
        value={max}
        onChange={(event) => onMaxChange(event.target.value)}
        disabled={disabled}
        aria-label="Maximum limit"
      />
    </div>
  )
}

function BiplotSettingsPanel({
  config,
  limits,
  disabled,
  loading,
  onPatch,
  onUpdate,
}) {
  const [colorLo, colorHi] = limits.color
  const colorbarStyle = useMemo(() => ({ background: biplotColorbarGradient() }), [])

  return (
    <div className="biplot-settings-panel" role="dialog" aria-label="Biplot settings">
      <div className="biplot-settings-grid">
        <label className="biplot-field" data-tooltip={ATTRIBUTE_EXPR_TOOLTIP}>
          <span className="biplot-field-label">X attribute</span>
          <input
            className="biplot-input"
            type="text"
            value={config.xExpr}
            onChange={(event) => onPatch({ xExpr: event.target.value })}
            disabled={disabled}
            spellCheck={false}
          />
        </label>

        <label className="biplot-field" data-tooltip={ATTRIBUTE_EXPR_TOOLTIP}>
          <span className="biplot-field-label">Y attribute</span>
          <input
            className="biplot-input"
            type="text"
            value={config.yExpr}
            onChange={(event) => onPatch({ yExpr: event.target.value })}
            disabled={disabled}
            spellCheck={false}
          />
        </label>

        <label className="biplot-field biplot-settings-span" data-tooltip={FEATURE_WIDTH_TOOLTIP}>
          <span className="biplot-field-label">± width (nm)</span>
          <input
            className="biplot-input biplot-input--compact"
            type="text"
            inputMode="decimal"
            value={config.width}
            onChange={(event) => onPatch({ width: event.target.value })}
            disabled={disabled}
          />
        </label>

        <div className="biplot-settings-section" data-tooltip={ATTRIBUTE_EXPR_TOOLTIP}>
          <span className="biplot-field-label">Color</span>
          <input
            className="biplot-input"
            type="text"
            value={config.colorExpr}
            onChange={(event) => onPatch({ colorExpr: event.target.value })}
            disabled={disabled}
            spellCheck={false}
            placeholder="attribute"
          />
          <div className="biplot-colorbar" style={colorbarStyle} aria-hidden="true" />
          <div className="biplot-colorbar-labels">
            <span>{formatLimitLabel(config.colorMin, colorLo)}</span>
            <span>{formatLimitLabel(config.colorMax, colorHi)}</span>
          </div>
          <LimitRow
            min={config.colorMin}
            max={config.colorMax}
            onMinChange={(value) => onPatch({ colorMin: value })}
            onMaxChange={(value) => onPatch({ colorMax: value })}
            disabled={disabled}
            tooltip={LIMIT_TOOLTIP}
          />
        </div>

        <div className="biplot-settings-section" data-tooltip={ATTRIBUTE_EXPR_TOOLTIP}>
          <span className="biplot-field-label">Size</span>
          <input
            className="biplot-input"
            type="text"
            value={config.sizeExpr}
            onChange={(event) => onPatch({ sizeExpr: event.target.value })}
            disabled={disabled}
            spellCheck={false}
            placeholder="attribute"
          />
          <LimitRow
            min={config.sizeMin}
            max={config.sizeMax}
            onMinChange={(value) => onPatch({ sizeMin: value })}
            onMaxChange={(value) => onPatch({ sizeMax: value })}
            disabled={disabled}
            tooltip={LIMIT_TOOLTIP}
          />
        </div>

        <div className="biplot-settings-section biplot-settings-span" data-tooltip={ATTRIBUTE_EXPR_TOOLTIP}>
          <span className="biplot-field-label">Opacity</span>
          <input
            className="biplot-input"
            type="text"
            value={config.opacityExpr}
            onChange={(event) => onPatch({ opacityExpr: event.target.value })}
            disabled={disabled}
            spellCheck={false}
            placeholder="attribute"
          />
          <LimitRow
            min={config.opacityMin}
            max={config.opacityMax}
            onMinChange={(value) => onPatch({ opacityMin: value })}
            onMaxChange={(value) => onPatch({ opacityMax: value })}
            disabled={disabled}
            tooltip={LIMIT_TOOLTIP}
          />
        </div>
      </div>

      <button
        type="button"
        className="biplot-update"
        onClick={onUpdate}
        disabled={disabled || loading}
      >
        Update
      </button>
    </div>
  )
}

function BiplotScatter({ width, height, points, config, limits, styleContext, onHoverPoint }) {
  const innerWidth = Math.max(width - plotMargin.left - plotMargin.right, 0)
  const innerHeight = Math.max(height - plotMargin.top - plotMargin.bottom, 0)

  const xDomain = useMemo(
    () => extentWithPadding(points.map((point) => point.x)),
    [points],
  )
  const yDomain = useMemo(
    () => extentWithPadding(points.map((point) => point.y)),
    [points],
  )

  const xScale = useMemo(
    () => scaleLinear({ domain: xDomain, range: [0, innerWidth], nice: true }),
    [innerWidth, xDomain],
  )
  const yScale = useMemo(
    () => scaleLinear({ domain: yDomain, range: [innerHeight, 0], nice: true }),
    [innerHeight, yDomain],
  )

  const contextWithLimits = useMemo(
    () => ({ ...styleContext, limits }),
    [limits, styleContext],
  )

  if (innerWidth <= 0 || innerHeight <= 0) return null

  return (
    <svg width={width} height={height} className="biplot-svg">
      <Group left={plotMargin.left} top={plotMargin.top}>
        <rect
          x={0}
          y={0}
          width={innerWidth}
          height={innerHeight}
          fill="#121316"
          stroke="var(--border-color)"
        />
        {points.map((point) => {
          const style = styleBiplotPoint(point, config, contextWithLimits)
          return (
            <Circle
              key={point.name}
              cx={xScale(point.x)}
              cy={yScale(point.y)}
              r={style.radius}
              fill={style.fill}
              fillOpacity={style.opacity}
              stroke={style.stroke}
              strokeWidth={style.strokeWidth}
              onMouseEnter={() => onHoverPoint(point.name)}
              onMouseLeave={() => onHoverPoint(null)}
            />
          )
        })}
        <AxisLeft
          scale={yScale}
          stroke="var(--border-color)"
          tickStroke="var(--border-color)"
          tickLabelProps={() => ({
            fill: 'var(--text-muted)',
            fontSize: 10,
            fontFamily: 'inherit',
            textAnchor: 'end',
            dx: -4,
          })}
        />
        <AxisBottom
          top={innerHeight}
          scale={xScale}
          stroke="var(--border-color)"
          tickStroke="var(--border-color)"
          tickLabelProps={() => ({
            fill: 'var(--text-muted)',
            fontSize: 10,
            fontFamily: 'inherit',
            textAnchor: 'middle',
            dy: 4,
          })}
        />
        <text
          x={innerWidth / 2}
          y={innerHeight + 32}
          fill="var(--text-muted)"
          fontSize={10}
          fontFamily="inherit"
          textAnchor="middle"
        >
          {config.xExpr}
        </text>
        <text
          x={-36}
          y={innerHeight / 2}
          fill="var(--text-muted)"
          fontSize={10}
          fontFamily="inherit"
          textAnchor="middle"
          transform={`rotate(-90, -36, ${innerHeight / 2})`}
        >
          {config.yExpr}
        </text>
      </Group>
    </svg>
  )
}

export default function Biplot({ paneIndex, paneState }) {
  const { appState, hoveredSpectrum, setHoveredSpectrum, updatePane } = useAppState()
  const { status, pyodide, runQueued } = usePyodide()
  const config = useMemo(() => mergePaneState(paneState), [paneState])
  const [plotData, setPlotData] = useState({ points: [], errors: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasPlotted, setHasPlotted] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(true)

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

  const patchPane = useCallback(
    (patch) => {
      updatePane(paneIndex, {
        state: { ...config, ...patch },
      })
    },
    [config, paneIndex, updatePane],
  )

  const limits = useMemo(
    () => resolveBiplotLimits(plotData.points, config),
    [
      config.colorMax,
      config.colorMin,
      config.opacityMax,
      config.opacityMin,
      config.sizeMax,
      config.sizeMin,
      plotData.points,
    ],
  )

  const styleContext = useMemo(
    () => ({
      ranks: plotData.points.map((point) => point.rank),
      scores: plotData.points.map((point) => point.score),
      selectedColors,
      hoveredName: hoveredSpectrum,
    }),
    [hoveredSpectrum, plotData.points, selectedColors],
  )

  const handleUpdate = useCallback(async () => {
    if (status !== 'ready' || !pyodide || loading) return
    if (!config.xExpr.trim() || !config.yExpr.trim()) {
      setError('Both X and Y attribute expressions are required.')
      setPlotData({ points: [], errors: [] })
      setHasPlotted(false)
      return
    }

    setLoading(true)
    setError('')

    try {
      const data = await runQueued(() =>
        exportBiplotData(pyodide, {
          pageStart: pageSlice[0],
          pageEnd: pageSlice[1],
          lookupMap,
          xExpr: config.xExpr,
          yExpr: config.yExpr,
          width: parseNumber(config.width, 50),
          colorExpr: config.colorExpr,
          opacityExpr: config.opacityExpr,
          sizeExpr: config.sizeExpr,
        }),
      )
      setPlotData(data)
      setHasPlotted(true)
      setSettingsOpen(false)
      if (data.errors.length) {
        setError(`${data.errors.length} spectra could not be evaluated.`)
      }
    } catch (err) {
      setPlotData({ points: [], errors: [] })
      setHasPlotted(false)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [config, loading, lookupMap, pageSlice, pyodide, runQueued, status])

  const showPlot = hasPlotted
  const controlsDisabled = status !== 'ready' || loading

  return (
    <div className="widget widget-biplot">
      <div className="biplot-plot-host">
        <button
          type="button"
          className={`biplot-settings-toggle${settingsOpen ? ' biplot-settings-toggle--active' : ''}`}
          onClick={() => setSettingsOpen((open) => !open)}
          aria-label={settingsOpen ? 'Hide biplot settings' : 'Show biplot settings'}
          aria-expanded={settingsOpen}
        >
          <CogIcon />
        </button>

        {settingsOpen ? (
          <BiplotSettingsPanel
            config={config}
            limits={limits}
            disabled={controlsDisabled}
            loading={loading}
            onPatch={patchPane}
            onUpdate={handleUpdate}
          />
        ) : null}

        {!showPlot && !loading ? (
          <p className="biplot-empty">
            {appState.query || appState.selection.length
              ? 'Open settings and click Update to plot query results and selected spectra.'
              : 'Run a search or select spectra, then open settings and click Update.'}
          </p>
        ) : showPlot ? (
          <ParentSize debounceTime={50}>
            {({ width, height }) =>
              width > 0 && height > 0 ? (
                <BiplotScatter
                  width={width}
                  height={height}
                  points={plotData.points}
                  config={config}
                  limits={limits}
                  styleContext={styleContext}
                  onHoverPoint={setHoveredSpectrum}
                />
              ) : null
            }
          </ParentSize>
        ) : (
          <p className="biplot-empty">Evaluating attributes…</p>
        )}
      </div>

      {loading ? <p className="biplot-status">Evaluating attributes…</p> : null}
      {error ? <p className="biplot-status biplot-status--error">{error}</p> : null}
    </div>
  )
}
