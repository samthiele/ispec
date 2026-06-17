import { DEFAULT_LIBRARY_ID } from '../python/ispecBootstrap.js'

export function librariesIndexUrl() {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return `${base}libraries/index.json`
}

export function libraryFileUrl(file) {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return `${base}libraries/${file}`
}

export async function fetchLibraryCatalog() {
  const response = await fetch(librariesIndexUrl())
  if (!response.ok) {
    throw new Error(`Failed to load library catalog (${response.status})`)
  }

  const data = await response.json()
  if (!Array.isArray(data?.libraries)) {
    throw new Error('Library catalog is missing a libraries array')
  }

  return data.libraries
}

export function findLibraryById(catalog, id) {
  return catalog.find((entry) => entry.id === id) ?? null
}

export function getDefaultLibraryIds(catalog) {
  const defaults = catalog.filter((entry) => entry.default).map((entry) => entry.id)
  if (defaults.length > 0) return defaults
  return catalog.length === 1 ? [catalog[0].id] : []
}

export { DEFAULT_LIBRARY_ID }
