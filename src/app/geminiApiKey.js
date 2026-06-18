const STORAGE_KEY = 'ispec.geminiApiKey'

export function getGeminiApiKey() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(STORAGE_KEY) ?? ''
}

export function setGeminiApiKey(apiKey) {
  localStorage.setItem(STORAGE_KEY, String(apiKey).trim())
}

export function clearGeminiApiKey() {
  localStorage.removeItem(STORAGE_KEY)
}
