const STORAGE_KEY = 'ispec.geminiModel'

/** Used when models.json cannot be loaded (offline, deploy error). Keep in sync with public/llm/models.json. */
export const FALLBACK_GEMINI_MODELS_CATALOG = {
  default: 'gemini-3.1-flash-lite',
  models: [
    {
      id: 'gemini-3.1-flash-lite',
      label: '3.1 Flash-Lite',
      hint: 'Default — high free-tier quota, good for chat',
    },
    {
      id: 'gemini-3.5-flash',
      label: '3.5 Flash',
      hint: 'Newer Flash with stronger reasoning',
    },
    {
      id: 'gemini-3-flash-preview',
      label: '3 Flash (preview)',
      hint: 'Gemini 3 preview model',
    },
    {
      id: 'gemini-2.5-flash',
      label: '2.5 Flash',
      hint: 'Prior-generation Flash',
    },
    {
      id: 'gemini-2.5-pro',
      label: '2.5 Pro',
      hint: 'Stronger reasoning; lower free-tier quota',
    },
  ],
}

export const DEFAULT_GEMINI_MODEL = FALLBACK_GEMINI_MODELS_CATALOG.default

let catalogCache = null
let catalogPromise = null

export function geminiModelsDocumentUrl() {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return `${base}llm/models.json`
}

function normalizeCatalog(raw) {
  if (!raw || !Array.isArray(raw.models) || raw.models.length === 0) {
    return normalizeCatalog(FALLBACK_GEMINI_MODELS_CATALOG)
  }

  const models = raw.models
    .map((entry) => ({
      id: String(entry.id ?? '').trim(),
      label: String(entry.label ?? entry.id ?? '').trim(),
      hint: String(entry.hint ?? '').trim(),
    }))
    .filter((entry) => entry.id && entry.label)

  if (models.length === 0) {
    return normalizeCatalog(FALLBACK_GEMINI_MODELS_CATALOG)
  }

  const modelIds = new Set(models.map(({ id }) => id))
  const defaultModel =
    typeof raw.default === 'string' && modelIds.has(raw.default)
      ? raw.default
      : models[0].id

  return { default: defaultModel, models }
}

export function normalizeGeminiModelsCatalog(raw) {
  return normalizeCatalog(raw)
}

export async function loadGeminiModelsCatalog() {
  if (catalogCache) return catalogCache
  if (!catalogPromise) {
    catalogPromise = fetch(geminiModelsDocumentUrl())
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load Gemini models (${response.status})`)
        }
        return response.json()
      })
      .then((raw) => normalizeCatalog(raw))
      .catch((error) => {
        console.warn('[iSpec LLM] using fallback Gemini model catalog', error)
        return normalizeCatalog(FALLBACK_GEMINI_MODELS_CATALOG)
      })
  }

  catalogCache = await catalogPromise
  return catalogCache
}

export function getGeminiModelsCatalogSync() {
  return catalogCache ?? normalizeCatalog(FALLBACK_GEMINI_MODELS_CATALOG)
}

export function resolveGeminiModel(modelId, catalog = getGeminiModelsCatalogSync()) {
  const ids = new Set(catalog.models.map(({ id }) => id))
  if (typeof modelId === 'string' && ids.has(modelId)) {
    return modelId
  }
  return catalog.default
}

export function getGeminiModel(catalog = getGeminiModelsCatalogSync()) {
  if (typeof window === 'undefined') return catalog.default
  const stored = localStorage.getItem(STORAGE_KEY)
  return resolveGeminiModel(stored, catalog)
}

export function setGeminiModel(modelId, catalog = getGeminiModelsCatalogSync()) {
  if (!catalog.models.some(({ id }) => id === modelId)) {
    throw new Error(`Unknown Gemini model: ${modelId}`)
  }
  localStorage.setItem(STORAGE_KEY, modelId)
}

export function geminiModelLabel(modelId, catalog = getGeminiModelsCatalogSync()) {
  return catalog.models.find(({ id }) => id === modelId)?.label ?? modelId
}

/** @deprecated Use catalog from loadGeminiModelsCatalog() */
export const GEMINI_MODELS = FALLBACK_GEMINI_MODELS_CATALOG.models
