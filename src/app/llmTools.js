import { createPartFromFunctionResponse } from '@google/genai'
import {
  applyPythonQueryState,
  clearPythonSearch,
  DEFAULT_CONFIDENCE,
  formatSearchScore,
  referenceSearchRunOptions,
  runPythonSearch,
} from './querySync.js'
import { formatSpectrumDisplayName, parseSpectrumName } from './selectionMeta.js'
import { formatWavelengthRange } from './llmFeatures.js'
import { exportSpectrumWavelengthRanges } from './llmSync.js'

export const SEARCH_SPECTRA_TOOL_NAME = 'search_spectra'

export const ISPEC_LLM_TOOL_DECLARATIONS = [
  {
    name: SEARCH_SPECTRA_TOOL_NAME,
    description:
      'Run a read-only spectral library search to discover canonical spectrum names before proposing selection or virtual mixtures. This tool does not change what the user sees in Query until they Apply an ispec-state block. Call it whenever you need exact canonical names that are not already listed in the current search results or selection.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Feature search query (e.g. "tremolite", "2200", "^8000P", "kaolinite|dolomite", "SAM(2000-2500)", "FIT(2160-2200)", "CORR(2000-2500)", "SID(2000-2500)"). Same syntax as the Query widget.',
        },
        confidence: {
          type: 'number',
          description: 'Search band uncertainty in nm. Default 10.',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of matches to return (default 20, max 50).',
        },
      },
      required: ['query'],
    },
  },
]

function formatScorePercent(score, query) {
  return formatSearchScore(score, query)
}

export function formatSearchToolMatches(searchResults, { query, limit = 20, wavelengthRanges = {} } = {}) {
  const max = Math.min(Math.max(1, Number(limit) || 20), 50)
  const total = searchResults?.total ?? 0
  const matches = []

  for (let index = 0; index < Math.min(total, max); index += 1) {
    const name = searchResults.names[index]
    const score = searchResults.scores[index]
    const parsed = parseSpectrumName(name)
    const range = wavelengthRanges[name] ?? null
    const [start, end] = Array.isArray(range) ? range.map(Number) : [null, null]
    matches.push({
      rank: index + 1,
      name,
      label: formatSpectrumDisplayName(parsed),
      score: Number(score),
      score_percent: formatScorePercent(score, query),
      wavelength_range_nm: Array.isArray(range) ? range : null,
      wavelength_start_nm: Number.isFinite(start) ? start : null,
      wavelength_end_nm: Number.isFinite(end) ? end : null,
      coverage: formatWavelengthRange(range),
    })
  }

  return {
    query: String(query ?? '').trim(),
    total,
    returned: matches.length,
    matches,
  }
}

export async function restorePythonSearchContext(pyodide, appSnapshot) {
  await applyPythonQueryState(pyodide, {
    query: appSnapshot?.query ?? '',
    slice: appSnapshot?.slice,
    selection: appSnapshot?.selection,
  })

  const query = String(appSnapshot?.query ?? '').trim()
  if (query) {
    await runPythonSearch(
      pyodide,
      query,
      appSnapshot?.confidence ?? DEFAULT_CONFIDENCE,
      referenceSearchRunOptions(
        query,
        appSnapshot?.selection,
        appSnapshot?.selectionMeta,
      ),
    )
  } else {
    await clearPythonSearch(pyodide)
  }
}

export async function executeSearchSpectraTool(pyodide, args, appSnapshot) {
  const query = String(args?.query ?? '').trim()
  if (!query) {
    return { error: 'query is required.' }
  }

  const confidence = Number(args?.confidence ?? appSnapshot?.confidence ?? DEFAULT_CONFIDENCE)
  if (!Number.isFinite(confidence) || confidence <= 0) {
    return { error: 'confidence must be a positive number.' }
  }

  try {
    const searchResults = await runPythonSearch(pyodide, query, confidence, {
      ...referenceSearchRunOptions(
        query,
        appSnapshot?.selection,
        appSnapshot?.selectionMeta,
      ),
    })
    const limit = Math.min(Math.max(1, Number(args?.limit) || 20), 50)
    const names = searchResults.names.slice(0, Math.min(searchResults.total, limit))
    const wavelengthRanges = await exportSpectrumWavelengthRanges(pyodide, names)
    const payload = formatSearchToolMatches(searchResults, {
      query,
      limit: args?.limit,
      wavelengthRanges,
    })
    await restorePythonSearchContext(pyodide, appSnapshot)
    return payload
  } catch (error) {
    await restorePythonSearchContext(pyodide, appSnapshot)
    const message = error instanceof Error ? error.message : String(error)
    return { error: message }
  }
}

export async function executeLlmToolCall(pyodide, name, args, appSnapshot) {
  if (name === SEARCH_SPECTRA_TOOL_NAME) {
    return executeSearchSpectraTool(pyodide, args, appSnapshot)
  }
  return { error: `Unknown tool: ${name}` }
}

export function buildFunctionResponseParts(calls, resultsByIndex) {
  return calls.map((call, index) =>
    createPartFromFunctionResponse(
      call.id ?? `call-${index}`,
      call.name ?? 'unknown',
      resultsByIndex[index] ?? { error: 'No tool result.' },
    ),
  )
}
