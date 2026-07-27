import { parseReferenceSearchQuery, formatSearchScore } from './querySync.js'
import { parseSpectrumName } from './selectionMeta.js'
import { triggerTextDownload } from './virtualSpectra.js'

function csvCell(value) {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function rawMatchScore(score, query) {
  const numeric = Number(score)
  if (!Number.isFinite(numeric)) return ''
  const parsed = parseReferenceSearchQuery(query)
  if (parsed?.method === 'SAM') {
    return numeric.toFixed(6)
  }
  return numeric.toFixed(6)
}

export function buildSearchResultsCsv(query, searchResults) {
  const trimmedQuery = String(query ?? '').trim()
  const parsed = parseReferenceSearchQuery(trimmedQuery)
  const method = parsed?.method ?? ''
  const total = searchResults?.total ?? 0
  const header = ['rank', 'library', 'group', 'spectrum_name', 'match_method', 'match_score', 'match_display']
  const rows = [header.join(',')]

  for (let index = 0; index < total; index += 1) {
    const name = searchResults.names[index]
    const score = searchResults.scores[index]
    const { archive, group, sampleId } = parseSpectrumName(name)
    rows.push(
      [
        index + 1,
        archive ?? '',
        group ?? '',
        sampleId,
        method || 'feature',
        rawMatchScore(score, trimmedQuery),
        formatSearchScore(score, trimmedQuery),
      ]
        .map(csvCell)
        .join(','),
    )
  }

  return `${rows.join('\n')}\n`
}

export function downloadSearchResultsCsv(query, searchResults) {
  const trimmedQuery = String(query ?? '').trim()
  if (!trimmedQuery || !searchResults?.total) {
    throw new Error('No search results to download.')
  }

  const csv = buildSearchResultsCsv(trimmedQuery, searchResults)
  const stamp = new Date().toISOString().slice(0, 10)
  const slug = trimmedQuery
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  const suffix = slug || 'results'
  triggerTextDownload(`ispec-search-${suffix}-${stamp}.csv`, csv)
}
