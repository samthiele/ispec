const STORAGE_KEY = 'ispec.geminiModel'

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite'

/** Curated chat models for iSpec (excludes deprecated / zero-quota routes). */
export const GEMINI_MODELS = [
  {
    id: 'gemini-2.5-flash-lite',
    label: '2.5 Flash-Lite',
    hint: 'Highest free-tier daily quota',
  },
  {
    id: 'gemini-2.5-flash',
    label: '2.5 Flash',
    hint: 'Balanced quality and speed',
  },
  {
    id: 'gemini-2.5-pro',
    label: '2.5 Pro',
    hint: 'Best reasoning, lowest free quota',
  },
  {
    id: 'gemini-3-flash-preview',
    label: '3 Flash (preview)',
    hint: 'Newer preview model',
  },
  {
    id: 'gemini-3.1-flash-lite-preview',
    label: '3.1 Flash-Lite (preview)',
    hint: 'Lightweight preview model',
  },
]

const MODEL_IDS = new Set(GEMINI_MODELS.map(({ id }) => id))

export function getGeminiModel() {
  if (typeof window === 'undefined') return DEFAULT_GEMINI_MODEL
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored && MODEL_IDS.has(stored) ? stored : DEFAULT_GEMINI_MODEL
}

export function setGeminiModel(modelId) {
  if (!MODEL_IDS.has(modelId)) {
    throw new Error(`Unknown Gemini model: ${modelId}`)
  }
  localStorage.setItem(STORAGE_KEY, modelId)
}

export function geminiModelLabel(modelId) {
  return GEMINI_MODELS.find(({ id }) => id === modelId)?.label ?? modelId
}
