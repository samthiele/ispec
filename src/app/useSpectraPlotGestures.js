import { useGesture } from '@use-gesture/react'
import { useMemo } from 'react'
import { localPoint } from '@visx/event'
import {
  chartPointFromGestureOrigin,
  isTouchLikeEvent,
  panPlotDomains,
  scalePlotDomains,
  wheelZoomFactor,
} from './spectraPlotZoom.js'

function chartPointFromEvent(event, margin) {
  const point = localPoint(event)
  if (!point) return null
  return {
    x: point.x - margin.left,
    y: point.y - margin.top,
  }
}

export function useSpectraPlotGestures({
  targetRef,
  margin,
  xDomain,
  yDomain,
  innerWidth,
  innerHeight,
  onZoom,
  onPan,
  enableWheelZoom = true,
  enableTouchGestures = true,
}) {
  const gestureConfig = useMemo(
    () => ({
      target: targetRef,
      eventOptions: { passive: false },
      drag: {
        filterTaps: true,
      },
      pinch: {
        scaleBounds: { min: 0.05, max: 50 },
      },
    }),
    [targetRef],
  )

  useGesture(
    {
      onWheel: ({ event, active, pinching }) => {
        if (!enableWheelZoom || pinching || !active) return
        if (innerWidth <= 0 || innerHeight <= 0) return

        event.preventDefault()
        const point = chartPointFromEvent(event, margin)
        if (!point) return

        const factor = wheelZoomFactor(event.deltaY)
        onZoom(
          scalePlotDomains({
            xDomain,
            yDomain,
            chartX: point.x,
            chartY: point.y,
            innerWidth,
            innerHeight,
            factor,
          }),
        )
      },
      onPinch: ({ origin, offset: [scale], first, memo }) => {
        if (!enableTouchGestures) return
        if (innerWidth <= 0 || innerHeight <= 0) return

        const element = targetRef.current
        const point = chartPointFromGestureOrigin(origin, element, margin)
        if (!point) return

        if (first || !memo) {
          return { xDomain, yDomain, startScale: scale }
        }

        const factor = scale / memo.startScale
        if (!Number.isFinite(factor) || Math.abs(factor - 1) < 0.001) {
          return memo
        }

        onZoom(
          scalePlotDomains({
            xDomain: memo.xDomain,
            yDomain: memo.yDomain,
            chartX: point.x,
            chartY: point.y,
            innerWidth,
            innerHeight,
            factor,
          }),
        )

        return memo
      },
      onDrag: ({ event, movement: [mx, my], first, memo, pinching, tap }) => {
        if (!enableTouchGestures || pinching || tap) return
        if (!isTouchLikeEvent(event)) return
        if (innerWidth <= 0 || innerHeight <= 0) return

        if (first || !memo) {
          return { xDomain, yDomain }
        }

        onPan(
          panPlotDomains({
            xDomain: memo.xDomain,
            yDomain: memo.yDomain,
            dx: mx,
            dy: my,
            innerWidth,
            innerHeight,
          }),
        )

        return memo
      },
    },
    gestureConfig,
  )
}
