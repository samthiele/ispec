export const WHEEL_ZOOM_FACTOR = 1.12
export const MIN_DOMAIN_SPAN_FRACTION = 0.01

export function dataPointAtChartPixel(xDomain, yDomain, chartX, chartY, innerWidth, innerHeight) {
  const [x0, x1] = xDomain
  const [y0, y1] = yDomain
  const dataX = x0 + (chartX / innerWidth) * (x1 - x0)
  const dataY = y1 - (chartY / innerHeight) * (y1 - y0)
  return { dataX, dataY }
}

export function scalePlotDomains({
  xDomain,
  yDomain,
  chartX,
  chartY,
  innerWidth,
  innerHeight,
  factor,
}) {
  if (!Number.isFinite(factor) || factor <= 0) {
    return { xDomain, yDomain }
  }

  const { dataX, dataY } = dataPointAtChartPixel(
    xDomain,
    yDomain,
    chartX,
    chartY,
    innerWidth,
    innerHeight,
  )

  const nextX = [
    dataX - (dataX - xDomain[0]) / factor,
    dataX + (xDomain[1] - dataX) / factor,
  ]
  const nextY = [
    dataY - (dataY - yDomain[0]) / factor,
    dataY + (yDomain[1] - dataY) / factor,
  ]

  return enforceMinimumSpan({ xDomain: nextX, yDomain: nextY }, xDomain, yDomain)
}

export function panPlotDomains({
  xDomain,
  yDomain,
  dx,
  dy,
  innerWidth,
  innerHeight,
}) {
  const xSpan = xDomain[1] - xDomain[0]
  const ySpan = yDomain[1] - yDomain[0]
  const shiftX = -(dx / innerWidth) * xSpan
  const shiftY = (dy / innerHeight) * ySpan

  return {
    xDomain: [xDomain[0] + shiftX, xDomain[1] + shiftX],
    yDomain: [yDomain[0] + shiftY, yDomain[1] + shiftY],
  }
}

function enforceMinimumSpan(next, fullX, fullY) {
  const fullXSpan = fullX[1] - fullX[0]
  const fullYSpan = fullY[1] - fullY[0]
  const minXSpan = fullXSpan * MIN_DOMAIN_SPAN_FRACTION
  const minYSpan = fullYSpan * MIN_DOMAIN_SPAN_FRACTION

  let [x0, x1] = next.xDomain
  let [y0, y1] = next.yDomain

  if (x1 - x0 < minXSpan) {
    const mid = (x0 + x1) / 2
    x0 = mid - minXSpan / 2
    x1 = mid + minXSpan / 2
  }

  if (y1 - y0 < minYSpan) {
    const mid = (y0 + y1) / 2
    y0 = mid - minYSpan / 2
    y1 = mid + minYSpan / 2
  }

  return { xDomain: [x0, x1], yDomain: [y0, y1] }
}

export function wheelZoomFactor(deltaY) {
  return deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR
}

export function chartPointFromGestureOrigin(origin, element, margin) {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  return {
    x: origin[0] - rect.left - margin.left,
    y: origin[1] - rect.top - margin.top,
  }
}

export function isTouchLikeEvent(event) {
  if (!event) return false
  if (event.pointerType === 'touch') return true
  return typeof TouchEvent !== 'undefined' && event instanceof TouchEvent
}
