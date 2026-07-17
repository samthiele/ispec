import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { Brush } from '@visx/brush'
import { localPoint } from '@visx/event'
import { Group } from '@visx/group'
import { LinePath } from '@visx/shape'
import { scaleLinear } from '@visx/scale'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { ClipPath } from '@visx/clip-path'
import { ParentSize } from '@visx/responsive'
import { bisectLeft } from 'd3-array'
import { useCoarsePointer } from '../../app/useCoarsePointer.js'
import { useSpectraPlotGestures } from '../../app/useSpectraPlotGestures.js'
import { spectrumStrokeStyle } from '../../app/spectraStyling.js'
import { ALL_WAVELENGTH_MAX_NM } from '../../app/spectralBands.js'
import { POSITION_GUIDE_LINE_COLOR } from '../../app/spectralExpression.js'
import { Y_AXIS_PAD_FRACTION } from '../../app/spectraSync.js'

const margin = { top: 12, right: 12, bottom: 42, left: 52 }
const HOVER_DISTANCE_PX = 10
const DOUBLE_CLICK_MS = 350
const CURSOR_LINE_COLOR = '#9aa0a6'
/** Break polylines when wavelength sampling has a gap wider than this (nm). */
const MAX_WAVELENGTH_GAP_NM = 50

function formatWavelength(nm) {
  if (!Number.isFinite(nm)) return ''
  const abs = Math.abs(nm)
  if (abs >= 1000) return `${nm.toFixed(0)} nm`
  if (abs >= 100) return `${nm.toFixed(1)} nm`
  return `${nm.toFixed(2)} nm`
}

function chartPoint(event) {
  const point = localPoint(event)
  if (!point) return null
  return {
    x: point.x - margin.left,
    y: point.y - margin.top,
  }
}

function buildSeriesSegments(wavelengths, reflectance) {
  const segments = []
  let current = []
  const n = Math.min(wavelengths.length, reflectance.length)

  for (let i = 0; i < n; i += 1) {
    const x = wavelengths[i]
    const y = reflectance[i]
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue

    if (current.length > 0) {
      const gap = x - current[current.length - 1].x
      if (gap > MAX_WAVELENGTH_GAP_NM) {
        segments.push(current)
        current = []
      }
    }
    current.push({ x, y })
  }

  if (current.length > 0) {
    segments.push(current)
  }

  return segments
}

function CrosshairLabel({ x, y, width, text }) {
  const paddingX = 5
  const labelWidth = Math.max(text.length * 6.2 + paddingX * 2, 48)
  const half = labelWidth / 2
  const labelX = Math.max(half + 2, Math.min(width - half - 2, x))

  return (
    <Group top={y} left={labelX}>
      <rect
        x={-half}
        y={0}
        width={labelWidth}
        height={16}
        rx={3}
        fill="rgba(18, 19, 22, 0.92)"
        stroke={CURSOR_LINE_COLOR}
        strokeWidth={1}
      />
      <text
        y={12}
        textAnchor="middle"
        fill="#e8eaed"
        fontSize={10}
        fontFamily="inherit"
      >
        {text}
      </text>
    </Group>
  )
}

function SpectraPlotInner({
  width,
  height,
  spectra,
  xDomain,
  yDomain,
  hoveredSpectrum,
  onHoverSpectrum,
  onBrushZoom,
  onViewPan,
  onResetZoom,
  applyHull = false,
  selectedColors = {},
  positionGuideWavelengths = [],
}) {
  const clipId = useId().replace(/:/g, '')
  const plotGestureRef = useRef(null)
  const coarsePointer = useCoarsePointer()
  const yAxisLabel = applyHull ? 'Hull corrected reflectance' : 'Reflectance (%)'
  const innerWidth = Math.max(width - margin.left - margin.right, 0)
  const innerHeight = Math.max(height - margin.top - margin.bottom, 0)

  const stylingContext = useMemo(() => {
    const ranks = spectra.map((spectrum) => spectrum.rank).filter((rank) => rank != null)
    const scores = spectra.map((spectrum) => spectrum.score).filter((score) => score != null)
    return { ranks, scores, selectedColors }
  }, [spectra, selectedColors])

  const xScale = useMemo(
    () =>
      scaleLinear({
        domain: xDomain,
        range: [0, innerWidth],
        nice: false,
        clamp: false,
      }),
    [xDomain, innerWidth],
  )

  const yScale = useMemo(
    () =>
      scaleLinear({
        domain: yDomain,
        range: [innerHeight, 0],
        nice: false,
        clamp: false,
      }),
    [yDomain, innerHeight],
  )

  const orderedSpectra = useMemo(() => {
    const hovered = spectra.filter((spectrum) => spectrum.name === hoveredSpectrum)
    const rest = spectra.filter((spectrum) => spectrum.name !== hoveredSpectrum)
    return [...rest, ...hovered]
  }, [spectra, hoveredSpectrum])

  const handleBrushEnd = useCallback(
    (bounds) => {
      if (!bounds) return

      const nextX = [Math.min(Number(bounds.x0), Number(bounds.x1)), Math.max(Number(bounds.x0), Number(bounds.x1))]
      const nextY = [Math.min(Number(bounds.y0), Number(bounds.y1)), Math.max(Number(bounds.y0), Number(bounds.y1))]

      const xSpan = nextX[1] - nextX[0]
      const ySpan = nextY[1] - nextY[0]
      const fullX = xDomain[1] - xDomain[0]
      const fullY = yDomain[1] - yDomain[0]

      if (xSpan < fullX * 0.01 || ySpan < fullY * 0.01) return

      onBrushZoom({ xDomain: nextX, yDomain: nextY })
    },
    [onBrushZoom, xDomain, yDomain],
  )

  useSpectraPlotGestures({
    targetRef: plotGestureRef,
    margin,
    xDomain,
    yDomain,
    innerWidth,
    innerHeight,
    onZoom: onBrushZoom,
    onPan: onViewPan,
    enableWheelZoom: true,
    enableTouchGestures: coarsePointer,
  })

  const [cursor, setCursor] = useState(null)
  const lastHoverRef = useRef(null)

  const handlePointerLeave = useCallback(() => {
    setCursor(null)
    if (lastHoverRef.current !== null) {
      lastHoverRef.current = null
      onHoverSpectrum(null)
    }
  }, [onHoverSpectrum])

  const handlePointerMove = useCallback(
    (event) => {
      const point = chartPoint(event)
      if (!point) return

      const chartX = Math.max(0, Math.min(innerWidth, point.x))
      setCursor({
        x: chartX,
        wavelength: xScale.invert(chartX),
      })

      let nearestName = null
      let nearestDistance = Number.POSITIVE_INFINITY

      for (const spectrum of spectra) {
        const dataX = xScale.invert(point.x)
        const wavelengths = spectrum.wavelengths
        const index = bisectLeft(wavelengths, dataX)
        const candidates = [index - 1, index, index + 1].filter(
          (candidate) => candidate >= 0 && candidate < wavelengths.length,
        )

        for (const candidate of candidates) {
          const px = xScale(wavelengths[candidate]) ?? 0
          const py = yScale(spectrum.reflectance[candidate]) ?? 0
          const distance = Math.hypot(point.x - px, point.y - py)
          if (distance < nearestDistance) {
            nearestDistance = distance
            nearestName = spectrum.name
          }
        }
      }

      const nextHover = nearestDistance <= HOVER_DISTANCE_PX ? nearestName : null
      if (nextHover !== lastHoverRef.current) {
        lastHoverRef.current = nextHover
        onHoverSpectrum(nextHover)
      }
    },
    [innerWidth, onHoverSpectrum, spectra, xScale, yScale],
  )

  const lastClickAtRef = useRef(0)
  const panStateRef = useRef(null)
  const panMovedRef = useRef(false)

  const beginAxisPan = useCallback(
    (axis, event) => {
      event.preventDefault()
      event.stopPropagation()
      panMovedRef.current = false
      event.currentTarget.setPointerCapture(event.pointerId)
      panStateRef.current = {
        axis,
        originX: event.clientX,
        originY: event.clientY,
        xDomain: [...xDomain],
        yDomain: [...yDomain],
      }
    },
    [xDomain, yDomain],
  )

  const moveAxisPan = useCallback(
    (event) => {
      const pan = panStateRef.current
      if (!pan) return

      if (pan.axis === 'x') {
        const dx = event.clientX - pan.originX
        if (Math.abs(dx) > 2) panMovedRef.current = true
        const span = pan.xDomain[1] - pan.xDomain[0]
        if (innerWidth <= 0) return
        const shift = -(dx / innerWidth) * span
        onViewPan({
          xDomain: [pan.xDomain[0] + shift, pan.xDomain[1] + shift],
          yDomain: [...pan.yDomain],
        })
        return
      }

      const dy = event.clientY - pan.originY
      if (Math.abs(dy) > 2) panMovedRef.current = true
      const span = pan.yDomain[1] - pan.yDomain[0]
      if (innerHeight <= 0) return
      const shift = (dy / innerHeight) * span
      onViewPan({
        xDomain: [...pan.xDomain],
        yDomain: [pan.yDomain[0] + shift, pan.yDomain[1] + shift],
      })
    },
    [innerHeight, innerWidth, onViewPan],
  )

  const endAxisPan = useCallback((event) => {
    if (!panStateRef.current) return
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    panStateRef.current = null
  }, [])

  const handlePlotClick = useCallback(() => {
    if (panMovedRef.current) {
      panMovedRef.current = false
      return
    }
    const now = Date.now()
    if (now - lastClickAtRef.current <= DOUBLE_CLICK_MS) {
      lastClickAtRef.current = 0
      onResetZoom()
      return
    }
    lastClickAtRef.current = now
  }, [onResetZoom])

  if (innerWidth <= 0 || innerHeight <= 0) return null

  return (
    <svg
      ref={plotGestureRef}
      width={width}
      height={height}
      className="spectra-svg"
      onClick={handlePlotClick}
    >
      <Group left={margin.left} top={margin.top}>
        <rect
          x={0}
          y={0}
          width={innerWidth}
          height={innerHeight}
          fill="#121316"
          stroke="#3c4043"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onMouseMove={handlePointerMove}
          onMouseLeave={handlePointerLeave}
        />

        <ClipPath id={clipId}>
          <rect x={0} y={0} width={innerWidth} height={innerHeight} />
        </ClipPath>

        <Group clipPath={`url(#${clipId})`}>
          {positionGuideWavelengths.map((wavelength) => (
            <line
              key={`guide-${wavelength}`}
              x1={xScale(wavelength)}
              x2={xScale(wavelength)}
              y1={0}
              y2={innerHeight}
              stroke={POSITION_GUIDE_LINE_COLOR}
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.75}
              pointerEvents="none"
            />
          ))}

          {orderedSpectra.map((spectrum) => {
            const style = spectrumStrokeStyle(spectrum, stylingContext, hoveredSpectrum)
            const segments = buildSeriesSegments(spectrum.wavelengths, spectrum.reflectance)

            return segments.map((points, segmentIndex) => (
              <LinePath
                key={`${spectrum.name}-${segmentIndex}`}
                data={points}
                x={(point) => xScale(point.x) ?? 0}
                y={(point) => yScale(point.y) ?? 0}
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                strokeOpacity={style.strokeOpacity}
                fill="none"
                pointerEvents="none"
              />
            ))
          })}
        </Group>

        {!coarsePointer ? (
          <Brush
            xScale={xScale}
            yScale={yScale}
            width={innerWidth}
            height={innerHeight}
            margin={margin}
            handleSize={8}
            brushDirection="both"
            resetOnEnd
            useWindowMoveEvents
            onBrushEnd={handleBrushEnd}
            onMouseMove={handlePointerMove}
            onMouseLeave={handlePointerLeave}
            selectedBoxStyle={{
              fill: 'rgba(34, 211, 238, 0.12)',
              stroke: '#22d3ee',
              strokeWidth: 1,
            }}
          />
        ) : null}

        {cursor ? (
          <Group pointerEvents="none" aria-hidden="true">
            <line
              x1={cursor.x}
              x2={cursor.x}
              y1={0}
              y2={innerHeight}
              stroke={CURSOR_LINE_COLOR}
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.85}
            />
            <CrosshairLabel x={cursor.x} y={6} width={innerWidth} text={formatWavelength(cursor.wavelength)} />
          </Group>
        ) : null}

        <AxisLeft
          scale={yScale}
          stroke="#9aa0a6"
          tickStroke="#9aa0a6"
          tickLabelProps={{
            fill: '#9aa0a6',
            fontSize: 10,
            textAnchor: 'end',
            dx: -4,
          }}
          label={yAxisLabel}
          labelProps={{
            fill: '#9aa0a6',
            fontSize: 11,
            textAnchor: 'middle',
          }}
          labelOffset={36}
        />

        <AxisBottom
          top={innerHeight}
          scale={xScale}
          stroke="#9aa0a6"
          tickStroke="#9aa0a6"
          tickLabelProps={{
            fill: '#9aa0a6',
            fontSize: 10,
            textAnchor: 'middle',
          }}
          label="Wavelength (nm)"
          labelProps={{
            fill: '#9aa0a6',
            fontSize: 11,
            textAnchor: 'middle',
          }}
          labelOffset={28}
        />

        <rect
          className="spectra-axis-pan spectra-axis-pan--y"
          x={-margin.left}
          y={0}
          width={margin.left}
          height={innerHeight}
          fill="transparent"
          aria-label="Pan reflectance axis"
          onPointerDown={(event) => beginAxisPan('y', event)}
          onPointerMove={moveAxisPan}
          onPointerUp={endAxisPan}
          onPointerCancel={endAxisPan}
          onClick={(event) => event.stopPropagation()}
        />
        <rect
          className="spectra-axis-pan spectra-axis-pan--x"
          x={0}
          y={innerHeight}
          width={innerWidth}
          height={margin.bottom}
          fill="transparent"
          aria-label="Pan wavelength axis"
          onPointerDown={(event) => beginAxisPan('x', event)}
          onPointerMove={moveAxisPan}
          onPointerUp={endAxisPan}
          onPointerCancel={endAxisPan}
          onClick={(event) => event.stopPropagation()}
        />
      </Group>
    </svg>
  )
}

export default function SpectraPlot({
  plotData,
  xDomain,
  yDomain,
  hoveredSpectrum,
  onHoverSpectrum,
  onBrushZoom,
  onViewPan,
  onResetZoom,
  applyHull = false,
  selectedColors = {},
  positionGuideWavelengths = [],
  hostRef,
  overlay = null,
}) {
  const { spectra } = plotData

  if (!spectra.length) {
    return (
      <div className="spectra-plot-host" ref={hostRef}>
        {overlay}
        <div className="spectra-empty">
          Run a search or select spectra to plot reflectance curves.
        </div>
      </div>
    )
  }

  return (
    <div className="spectra-plot-host" ref={hostRef}>
      {overlay}
      <ParentSize debounceTime={10}>
        {({ width, height }) => (
          <SpectraPlotInner
            width={width}
            height={height}
            spectra={spectra}
            xDomain={xDomain}
            yDomain={yDomain}
            hoveredSpectrum={hoveredSpectrum}
            onHoverSpectrum={onHoverSpectrum}
            onBrushZoom={onBrushZoom}
            onViewPan={onViewPan}
            onResetZoom={onResetZoom}
            applyHull={applyHull}
            selectedColors={selectedColors}
            positionGuideWavelengths={positionGuideWavelengths}
          />
        )}
      </ParentSize>
    </div>
  )
}

export function defaultDomainsFromData(spectra) {
  return defaultDomainsFromSpectra(spectra)
}

export function dataWavelengthExtent(spectra) {
  let xMin = Number.POSITIVE_INFINITY
  let xMax = Number.NEGATIVE_INFINITY

  for (const spectrum of spectra) {
    for (const wav of spectrum.wavelengths) {
      if (!Number.isFinite(wav)) continue
      xMin = Math.min(xMin, wav)
      xMax = Math.max(xMax, wav)
    }
  }

  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    return [0, 1]
  }

  return [xMin, xMax]
}

function defaultDomainsFromSpectra(spectra) {
  const [xMin, xMax] = dataWavelengthExtent(spectra)
  const xDomainMax = Math.min(xMax, ALL_WAVELENGTH_MAX_NM)
  let yMin = Number.POSITIVE_INFINITY
  let yMax = Number.NEGATIVE_INFINITY

  for (const spectrum of spectra) {
    for (let i = 0; i < spectrum.wavelengths.length; i += 1) {
      const wav = spectrum.wavelengths[i]
      if (wav < xMin || wav > xDomainMax) continue
      const value = spectrum.reflectance[i]
      if (!Number.isFinite(value)) continue
      yMin = Math.min(yMin, value)
      yMax = Math.max(yMax, value)
    }
  }

  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0
    yMax = 100
  }

  const pad = Math.max((yMax - yMin) * Y_AXIS_PAD_FRACTION, 1)
  return {
    xDomain: [xMin, xDomainMax],
    yDomain: [yMin - pad, yMax + pad],
  }
}
