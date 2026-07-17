import { clampSlice } from './querySync.js'
import { formatSpectrumDisplayName, parseSpectrumName } from './selectionMeta.js'

export const NO_SELECTION_SUMMARY =
  'No spectra selected. Answer general hyperspectral / mineralogy questions; suggest Query selection for sample-specific interpretation.'

function formatScorePercent(score) {
  return `${(Number(score) * 100).toFixed(1)}%`
}

export function formatVisibleSearchResults({
  query,
  searchResults,
  slice,
  pageSize,
  selection = [],
}) {
  const trimmedQuery = String(query ?? '').trim()
  if (!trimmedQuery || !searchResults?.total) {
    return 'No active search.'
  }

  const selectedSet = new Set(selection)
  const total = searchResults.total
  const [start, end] = clampSlice(slice, total, pageSize)
  const lines = [
    `Query: \`${trimmedQuery}\``,
    `Showing ranks ${start + 1}–${end} of ${total} matches`,
    '',
  ]

  for (let index = start; index < end; index += 1) {
    const name = searchResults.names[index]
    const score = searchResults.scores[index]
    const rank = index + 1
    const parsed = parseSpectrumName(name)
    const label = formatSpectrumDisplayName(parsed)
    const selectedNote = selectedSet.has(name) ? ' — selected (spectral features below)' : ''
    lines.push(`${rank}. ${label} — match ${formatScorePercent(score)}${selectedNote}`)
    lines.push(`   Canonical name: ${name}`)
  }

  return lines.join('\n')
}

export function formatSpectralFeaturesSummary(exported) {
  if (!exported?.spectra?.length) {
    return 'No spectra selected.'
  }

  const sections = []

  for (const spectrum of exported.spectra) {
    if (spectrum.error) {
      sections.push(`## ${spectrum.name}\nError: ${spectrum.error}`)
      continue
    }

    const header = spectrum.label ?? spectrum.name
    const range = spectrum.wavelength_range_nm
    const rangeText = Array.isArray(range)
      ? `${range[0].toFixed(0)}–${range[1].toFixed(0)} nm`
      : 'unknown range'

    const lines = [`## ${header}`, `Archive: ${spectrum.archive}`, `Coverage: ${rangeText}`, '']
    if (spectrum.virtual) {
      lines.push('Virtual mixture (HyFourier features not computed).')
      lines.push('')
    }

    for (const [bandName, band] of Object.entries(spectrum.bands ?? {})) {
      if (!band.available) {
        lines.push(`### ${bandName} — not covered`)
        continue
      }

      const [r0, r1] = band.range_nm
      lines.push(`### ${bandName} (${r0.toFixed(0)}–${r1.toFixed(0)} nm)`)
      lines.push(formatFeatureList('Min', band.minima))
      lines.push(formatFeatureList('Max', band.maxima))
      lines.push('')
    }

    sections.push(lines.join('\n'))
  }

  return sections.join('\n\n')
}

export function buildLlmSpectralContext({
  selectionExport,
  query,
  searchResults,
  slice,
  pageSize,
  selection = [],
}) {
  const resultsText = formatVisibleSearchResults({
    query,
    searchResults,
    slice,
    pageSize,
    selection,
  })

  const selectionText = formatSpectralFeaturesSummary(selectionExport)

  return [
    '## Current search results',
    '',
    resultsText,
    '',
    'Use canonical names from this list when proposing selection in `ispec-state` blocks.',
    '',
    '---',
    '',
    '## Selected spectra — spectral features',
    '',
    selectionText,
  ].join('\n')
}

function formatFeatureList(title, features) {
  if (!features?.length) {
    return `${title}: none`
  }

  const items = features.map(
    (feature) => `${feature.wavelength_nm.toFixed(0)} nm (prom. ${formatProminence(feature.prominence)})`,
  )
  return `${title}: ${items.join('; ')}`
}

/** Decimal prominence for LLM context (no scientific notation). */
export function formatProminence(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '?'
  if (n === 0) return '0'

  const abs = Math.abs(n)
  let text
  if (abs >= 10) {
    text = n.toFixed(1)
  } else if (abs >= 1) {
    text = n.toFixed(2)
  } else if (abs >= 0.01) {
    text = n.toFixed(2)
  } else {
    const decimals = Math.min(6, Math.ceil(-Math.log10(abs)) + 2)
    text = n.toFixed(decimals)
  }

  return text.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}
