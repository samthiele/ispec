import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string'
import { normalizeAppState, toShareableState } from './appState.js'

const HASH_PREFIX = '#s='

export function parseHashState() {
  const hash = window.location.hash
  if (!hash.startsWith(HASH_PREFIX)) return null

  try {
    const compressed = hash.slice(HASH_PREFIX.length)
    const json = decompressFromEncodedURIComponent(compressed)
    if (!json) return null
    const parsed = JSON.parse(json)
    console.info('[iSpec share] loaded state from URL hash:', parsed)
    return normalizeAppState(parsed)
  } catch (error) {
    console.warn('[iSpec share] failed to parse URL hash state', error)
    return null
  }
}

export function clearHash() {
  const url = `${window.location.pathname}${window.location.search}`
  window.history.replaceState(null, '', url)
}

export function buildShareUrl(appState) {
  const payload = JSON.stringify(toShareableState(appState))
  const compressed = compressToEncodedURIComponent(payload)
  return `${window.location.origin}${window.location.pathname}${window.location.search}${HASH_PREFIX}${compressed}`
}

export async function copyShareUrl(appState) {
  const url = buildShareUrl(appState)
  await navigator.clipboard.writeText(url)
  return url
}
