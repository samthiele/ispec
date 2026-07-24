import { spectrumStrokeStyle } from './spectraStyling.js'
import { spectrumHoverLabel } from './selectionMeta.js'
import { downloadPlotPng, downloadPlotSvg } from './plotDownload.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const LEGEND_PADDING = 16
const ROW_HEIGHT = 18
const SWATCH_WIDTH = 28
const SECTION_GAP = 12
const TITLE_HEIGHT = 18
const FONT_SIZE = 11
const MAX_WIDTH = 520
const TEXT_COLOR = '#e8eaed'
const MUTED_COLOR = '#9aa0a6'
const BACKGROUND = '#121316'

function stylingContextFromSpectra(spectra, selectedColors) {
  return {
    ranks: spectra.map((spectrum) => spectrum.rank).filter((rank) => rank != null),
    scores: spectra.map((spectrum) => spectrum.score).filter((score) => score != null),
    selectedColors,
  }
}

function legendItemFromSpectrum(spectrum, stylingContext, selectionMeta) {
  const style = spectrumStrokeStyle(spectrum, stylingContext, null)
  return {
    name: spectrum.name,
    label: spectrumHoverLabel(spectrum.name, selectionMeta),
    color: style.stroke,
    opacity: style.strokeOpacity,
  }
}

function sortSelectedItems(items, selection) {
  const order = new Map(selection.map((name, index) => [name, index]))
  return [...items].sort(
    (left, right) => (order.get(left.name) ?? Number.MAX_SAFE_INTEGER)
      - (order.get(right.name) ?? Number.MAX_SAFE_INTEGER),
  )
}

function sortQueryItems(items, spectraByName) {
  return [...items].sort((left, right) => {
    const leftRank = spectraByName.get(left.name)?.rank ?? Number.MAX_SAFE_INTEGER
    const rightRank = spectraByName.get(right.name)?.rank ?? Number.MAX_SAFE_INTEGER
    return leftRank - rightRank
  })
}

export function buildSpectraLegendSections(
  spectra,
  {
    selection = [],
    selectionMeta = {},
    selectedColors = {},
    showSelected = true,
    showQuery = true,
  } = {},
) {
  const stylingContext = stylingContextFromSpectra(spectra, selectedColors)
  const spectraByName = new Map(spectra.map((spectrum) => [spectrum.name, spectrum]))
  const selectedItems = []
  const queryItems = []

  for (const spectrum of spectra) {
    const item = legendItemFromSpectrum(spectrum, stylingContext, selectionMeta)
    if (spectrum.selected && showSelected) {
      selectedItems.push(item)
    } else if (spectrum.rank != null && showQuery) {
      queryItems.push(item)
    }
  }

  const sections = []
  if (selectedItems.length) {
    sections.push({
      title: 'Selected',
      items: sortSelectedItems(selectedItems, selection),
    })
  }
  if (queryItems.length) {
    sections.push({
      title: 'Query results',
      items: sortQueryItems(queryItems, spectraByName),
    })
  }

  return sections
}

function estimateTextWidth(text) {
  return String(text).length * 6.1
}

function truncateLabel(label, maxWidth) {
  const text = String(label)
  if (estimateTextWidth(text) <= maxWidth) return text
  const ellipsis = '…'
  let trimmed = text
  while (trimmed.length > 1 && estimateTextWidth(`${trimmed}${ellipsis}`) > maxWidth) {
    trimmed = trimmed.slice(0, -1)
  }
  return `${trimmed}${ellipsis}`
}

function layoutLegend(sections) {
  const textMax = MAX_WIDTH - LEGEND_PADDING * 2 - SWATCH_WIDTH - 8
  let width = 220

  for (const section of sections) {
    width = Math.max(width, estimateTextWidth(section.title) + LEGEND_PADDING * 2)
    for (const item of section.items) {
      width = Math.max(
        width,
        LEGEND_PADDING * 2 + SWATCH_WIDTH + 8 + Math.min(estimateTextWidth(item.label), textMax),
      )
    }
  }

  width = Math.min(Math.ceil(width), MAX_WIDTH)

  let height = LEGEND_PADDING
  for (const section of sections) {
    height += TITLE_HEIGHT + section.items.length * ROW_HEIGHT + SECTION_GAP
  }
  height += LEGEND_PADDING - SECTION_GAP

  return { width, height, textMax: width - LEGEND_PADDING * 2 - SWATCH_WIDTH - 8 }
}

function createLegendSvgElement(sections) {
  const nonEmpty = sections.filter((section) => section.items.length > 0)
  if (!nonEmpty.length) return null

  const { width, height, textMax } = layoutLegend(nonEmpty)
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('xmlns', SVG_NS)
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.setAttribute('class', 'plot-legend-svg')

  const background = document.createElementNS(SVG_NS, 'rect')
  background.setAttribute('width', String(width))
  background.setAttribute('height', String(height))
  background.setAttribute('fill', BACKGROUND)
  svg.appendChild(background)

  let y = LEGEND_PADDING

  for (const section of nonEmpty) {
    const title = document.createElementNS(SVG_NS, 'text')
    title.setAttribute('x', String(LEGEND_PADDING))
    title.setAttribute('y', String(y + 12))
    title.setAttribute('fill', MUTED_COLOR)
    title.setAttribute('font-size', String(FONT_SIZE))
    title.setAttribute('font-family', 'system-ui, sans-serif')
    title.setAttribute('font-weight', '600')
    title.textContent = section.title
    svg.appendChild(title)
    y += TITLE_HEIGHT

    for (const item of section.items) {
      const rowCenter = y + ROW_HEIGHT / 2

      const swatch = document.createElementNS(SVG_NS, 'line')
      swatch.setAttribute('x1', String(LEGEND_PADDING))
      swatch.setAttribute('x2', String(LEGEND_PADDING + SWATCH_WIDTH))
      swatch.setAttribute('y1', String(rowCenter))
      swatch.setAttribute('y2', String(rowCenter))
      swatch.setAttribute('stroke', item.color)
      swatch.setAttribute('stroke-width', '2.5')
      swatch.setAttribute('stroke-opacity', String(item.opacity ?? 1))
      svg.appendChild(swatch)

      const label = document.createElementNS(SVG_NS, 'text')
      label.setAttribute('x', String(LEGEND_PADDING + SWATCH_WIDTH + 8))
      label.setAttribute('y', String(y + 13))
      label.setAttribute('fill', TEXT_COLOR)
      label.setAttribute('font-size', String(FONT_SIZE))
      label.setAttribute('font-family', 'system-ui, sans-serif')
      const displayLabel = truncateLabel(item.label, textMax)
      label.textContent = displayLabel

      if (displayLabel !== item.label) {
        const tooltip = document.createElementNS(SVG_NS, 'title')
        tooltip.textContent = item.label
        label.appendChild(tooltip)
      }

      svg.appendChild(label)
      y += ROW_HEIGHT
    }

    y += SECTION_GAP
  }

  return svg
}

function downloadDelay(ms = 150) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function downloadLegendSvg(sections, filename) {
  const svg = createLegendSvgElement(sections)
  if (!svg) return false
  downloadPlotSvg(svg, filename)
  return true
}

export async function downloadLegendPng(sections, filename) {
  const svg = createLegendSvgElement(sections)
  if (!svg) return false
  await downloadPlotPng(svg, filename)
  return true
}

export async function downloadLegendForFormat(sections, basename, format) {
  const filename = `${basename}-legend.${format}`
  if (format === 'svg') {
    return downloadLegendSvg(sections, filename)
  }
  return downloadLegendPng(sections, filename)
}

export async function downloadPlotWithLegend(svg, basename, format, legendSections) {
  const plotFilename = `${basename}.${format}`
  if (format === 'svg') {
    downloadPlotSvg(svg, plotFilename)
  } else {
    await downloadPlotPng(svg, plotFilename)
  }

  if (!legendSections?.some((section) => section.items.length > 0)) {
    return
  }

  await downloadDelay()
  await downloadLegendForFormat(legendSections, basename, format)
}
