import { buildLookupMap } from './selectionMeta.js'

export const DEFAULT_CONFIDENCE = 10
export const DEFAULT_PAGE_SIZE = 15

const SEARCH_RANGE_RE = /^\d+(?:\.\d+)?-\d+(?:\.\d+)?$/
const SEARCH_NUMBER_RE = /^\d+(?:\.\d+)?$/
const REFERENCE_SEARCH_METHODS = ['SAM', 'FIT', 'CORR', 'SID']
const REFERENCE_SEARCH_QUERY_RE =
  /^(SAM|FIT|CORR|SID)\s*\(\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*\)\s*$/i

export function parseReferenceSearchQuery(query) {
  const match = REFERENCE_SEARCH_QUERY_RE.exec(String(query ?? '').trim())
  if (!match) return null
  const method = String(match[1]).toUpperCase()
  const lo = Number(match[2])
  const hi = Number(match[3])
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null
  return { method, wavMin: lo, wavMax: hi }
}

export function parseSamQuery(query) {
  const parsed = parseReferenceSearchQuery(query)
  if (!parsed || parsed.method !== 'SAM') return null
  return [parsed.wavMin, parsed.wavMax]
}

export function isReferenceSearchQuery(query) {
  return parseReferenceSearchQuery(query) != null
}

export function referenceSpectrumName(selection) {
  if (!Array.isArray(selection) || selection.length === 0) return null
  return String(selection[selection.length - 1])
}

export function referenceSearchRunOptions(query, selection, selectionMeta) {
  if (!isReferenceSearchQuery(query)) return {}
  return {
    referenceName: referenceSpectrumName(selection),
    lookupMap: buildLookupMap(selection, selectionMeta ?? {}),
  }
}

export function isSamQuery(query) {
  return parseSamQuery(query) != null
}

export function buildReferenceSearchQuery(method, wavMin, wavMax) {
  const normalizedMethod = String(method ?? '').trim().toUpperCase()
  if (!REFERENCE_SEARCH_METHODS.includes(normalizedMethod)) {
    throw new Error(`Unknown reference search method ${method}.`)
  }
  const lo = Math.round(Number(wavMin))
  const hi = Math.round(Number(wavMax))
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) {
    throw new Error(`Invalid wavelength range for ${normalizedMethod} search.`)
  }
  return `${normalizedMethod}(${lo}-${hi})`
}

export function buildSamQuery(wavMin, wavMax) {
  return buildReferenceSearchQuery('SAM', wavMin, wavMax)
}

export function buildFitQuery(wavMin, wavMax) {
  return buildReferenceSearchQuery('FIT', wavMin, wavMax)
}

export function buildCorrQuery(wavMin, wavMax) {
  return buildReferenceSearchQuery('CORR', wavMin, wavMax)
}

export function buildSidQuery(wavMin, wavMax) {
  return buildReferenceSearchQuery('SID', wavMin, wavMax)
}

export function formatSearchScore(score, query) {
  if (!Number.isFinite(score)) return '—'
  const parsed = parseReferenceSearchQuery(query)
  if (parsed?.method === 'SAM') {
    const radians = Math.acos(Math.max(-1, Math.min(1, score)))
    return `${((radians * 180) / Math.PI).toFixed(1)}°`
  }
  if (parsed?.method === 'FIT' || parsed?.method === 'CORR' || parsed?.method === 'SID') {
    return `${(Number(score) * 100).toFixed(1)}%`
  }
  return `${(Number(score) * 100).toFixed(1)}%`
}

/** Wavelengths (nm) referenced by numeric tokens in a spectral search query. */
export function parseSearchQueryWavelengths(query) {
  const trimmed = String(query ?? '').trim()
  if (!trimmed) return []

  const wavelengths = []
  for (const subQuery of trimmed.split('|')) {
    for (const rawToken of subQuery.trim().split(/\s+/)) {
      let token = rawToken
      if (!token) continue
      if (token.startsWith('!')) token = token.slice(1)
      if (token.startsWith('^')) token = token.slice(1)
      if (!token) continue

      if (SEARCH_RANGE_RE.test(token)) {
        const [loText, hiText] = token.split('-')
        const lo = Number(loText)
        const hi = Number(hiText)
        if (Number.isFinite(lo) && lo > 0) wavelengths.push(lo)
        if (Number.isFinite(hi) && hi > 0) wavelengths.push(hi)
      } else if (SEARCH_NUMBER_RE.test(token)) {
        const wavelength = Number(token)
        if (Number.isFinite(wavelength) && wavelength > 0) {
          wavelengths.push(wavelength)
        }
      }
    }
  }

  return [...new Set(wavelengths)].sort((left, right) => left - right)
}

export async function exportSearchResult(pyodide) {
  const exported = await pyodide.runPythonAsync('export_search_result()')
  return toSearchResult(exported)
}

export async function runPythonSearch(
  pyodide,
  query,
  confidence = DEFAULT_CONFIDENCE,
  { referenceName = null, lookupMap = null } = {},
) {
  const lookupPayload =
    lookupMap && typeof lookupMap === 'object' ? lookupMap : {}
  const referencePayload =
    referenceName != null && String(referenceName).trim()
      ? JSON.stringify(String(referenceName))
      : 'None'

  await pyodide.runPythonAsync(
    `run_search(${JSON.stringify(query)}, confidence=${Number(confidence)}, reference_name=${referencePayload}, lookup_map=${JSON.stringify(lookupPayload)})`,
  )
  return exportSearchResult(pyodide)
}

export async function clearPythonSearch(pyodide) {
  await pyodide.runPythonAsync('clear_search()')
  return exportSearchResult(pyodide)
}

export async function exportPythonSelection(pyodide) {
  const exported = await pyodide.runPythonAsync('export_selection()')
  return toSelectionList(exported)
}

export async function addPythonSelection(pyodide, name) {
  await pyodide.runPythonAsync(`add_to_selection(${JSON.stringify(name)})`)
  return exportPythonSelection(pyodide)
}

export async function removePythonSelection(pyodide, name) {
  await pyodide.runPythonAsync(`remove_from_selection(${JSON.stringify(name)})`)
  return exportPythonSelection(pyodide)
}

export async function applyPythonQueryState(pyodide, { query, slice, selection }) {
  const payload = {
    query: query ?? '',
    slice: Array.isArray(slice) ? slice : [0, 0],
  }
  if (selection !== undefined) {
    payload.selection = Array.isArray(selection) ? selection.map(String) : []
  }
  await pyodide.runPythonAsync(`state.apply(${JSON.stringify(payload)})`)
}

function toSearchResult(exported) {
  if (!exported) {
    return { names: [], scores: [], total: 0 }
  }

  if (typeof exported.get === 'function') {
    const names = Array.from(exported.get('names') ?? [])
    const scores = Array.from(exported.get('scores') ?? []).map(Number)
    const total = Number(exported.get('total') ?? names.length)
    if (typeof exported.destroy === 'function') {
      exported.destroy()
    }
    return { names, scores, total }
  }

  return {
    names: Array.isArray(exported.names) ? exported.names : [],
    scores: Array.isArray(exported.scores) ? exported.scores.map(Number) : [],
    total: Number(exported.total ?? 0),
  }
}

function toSelectionList(exported) {
  if (!exported) return []
  if (Array.isArray(exported)) {
    return exported.map(String)
  }
  if (typeof exported.toJs === 'function') {
    const list = exported.toJs()
    if (typeof exported.destroy === 'function') {
      exported.destroy()
    }
    return Array.isArray(list) ? list.map(String) : []
  }
  if (typeof exported.get === 'function' && typeof exported.length === 'number') {
    const list = []
    for (let i = 0; i < exported.length; i += 1) {
      list.push(String(exported.get(i)))
    }
    if (typeof exported.destroy === 'function') {
      exported.destroy()
    }
    return list
  }
  return []
}

export function clampSlice(slice, total, pageSize) {
  if (total <= 0) return [0, 0]
  const size = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE)
  let start = Math.max(0, Number(slice?.[0] ?? 0))
  if (start >= total) {
    start = Math.max(0, Math.floor((total - 1) / size) * size)
  }
  const end = Math.min(start + size, total)
  return [start, end]
}

export function previousSlice(slice, pageSize, total) {
  if (total <= 0) return [0, 0]
  const size = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE)
  const start = Math.max(0, Number(slice?.[0] ?? 0) - size)
  return clampSlice([start, start + size], total, pageSize)
}

export function nextSlice(slice, pageSize, total) {
  if (total <= 0) return [0, 0]
  const size = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE)
  const start = Number(slice?.[1] ?? 0)
  if (start >= total) return clampSlice(slice, total, pageSize)
  return clampSlice([start, start + size], total, pageSize)
}

export function initialSlice(total, pageSize) {
  return clampSlice([0, Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE)], total, pageSize)
}
