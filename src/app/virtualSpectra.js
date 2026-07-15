const VIRTUAL_ARCHIVE = 'virtual'
const MIX_GROUP = 'mix'

export const DEFAULT_VIRTUAL_SELECTED_COLOR = '#cc33ff'

export function isVirtualSpectrum(name) {
  const parsed = parseVirtualName(name)
  return parsed?.archive === VIRTUAL_ARCHIVE
}

export function formatMixSpectrumName(index) {
  return `(${VIRTUAL_ARCHIVE}) [${MIX_GROUP}] Mix ${index}`
}

export function nextMixSpectrumName(selection = [], virtualSpectra = {}) {
  let index = 1
  while (
    selection.includes(formatMixSpectrumName(index))
    || Object.prototype.hasOwnProperty.call(virtualSpectra, formatMixSpectrumName(index))
  ) {
    index += 1
  }
  return formatMixSpectrumName(index)
}

export function parseVirtualName(name) {
  const canonical = String(name).trim()
  const archiveMatch = /^\(([^)]+)\)\s+(.*)$/.exec(canonical)
  if (!archiveMatch) return null
  return { archive: archiveMatch[1], rest: archiveMatch[2], canonical }
}

export function parseMixIndex(name) {
  const parsed = parseVirtualName(name)
  if (!parsed) return Number.POSITIVE_INFINITY
  const match = /Mix\s+(\d+)/i.exec(parsed.rest)
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY
}

export function sortVirtualMixNames(names) {
  return [...names].sort((a, b) => parseMixIndex(a) - parseMixIndex(b))
}

function normalizeMixComponent(raw) {
  if (!raw || typeof raw !== 'object') return null

  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const weight = Number(raw.weight_pct)
  if (!name || !Number.isFinite(weight) || weight <= 0) return null

  const component = { name, weight_pct: weight }
  if (typeof raw.lookup === 'string' && raw.lookup.trim()) {
    component.lookup = raw.lookup.trim()
  }
  return component
}

export function normalizeVirtualMixRecipes(raw, selection = []) {
  if (!raw || typeof raw !== 'object') return {}

  const allowed = new Set(selection.filter(isVirtualSpectrum))
  const out = {}

  for (const [name, value] of Object.entries(raw)) {
    if (!allowed.has(name)) continue
    if (!Array.isArray(value)) continue

    const components = value.map(normalizeMixComponent).filter(Boolean)
    if (components.length >= 2) {
      out[name] = components
    }
  }

  return out
}

export function pruneVirtualMixRecipes(virtualMixRecipes, selection) {
  return normalizeVirtualMixRecipes(virtualMixRecipes, selection)
}

export function serializeMixRecipe(components) {
  return components.map(({ name, weight_pct, lookup }) => {
    const entry = { name, weight_pct }
    if (lookup) entry.lookup = lookup
    return entry
  })
}

export function normalizeVirtualSpectra(raw, selection = []) {
  if (!raw || typeof raw !== 'object') return {}

  const allowed = new Set(selection.filter(isVirtualSpectrum))
  const out = {}

  for (const [name, value] of Object.entries(raw)) {
    if (!allowed.has(name) || !value || typeof value !== 'object') continue

    const wavelengths = Array.isArray(value.wavelengths)
      ? value.wavelengths.map(Number).filter(Number.isFinite)
      : []
    const reflectance = Array.isArray(value.reflectance)
      ? value.reflectance.map(Number).filter(Number.isFinite)
      : []

    if (wavelengths.length === 0 || wavelengths.length !== reflectance.length) continue

    out[name] = { wavelengths, reflectance }
  }

  return out
}

export function pruneVirtualSpectra(virtualSpectra, selection) {
  return normalizeVirtualSpectra(virtualSpectra, selection)
}

export function sanitizeDownloadBasename(name) {
  const parsed = parseVirtualName(name)
  const rest = parsed?.rest ?? name
  const cleaned = rest
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120)
  return cleaned || 'spectrum'
}

export function triggerTextDownload(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function spectrumToTxt(wavelengths, reflectance) {
  const lines = ['wavelength_nm\treflectance']
  for (let i = 0; i < wavelengths.length; i += 1) {
    const wavelength = wavelengths[i]
    let value = reflectance[i]
    if (!Number.isFinite(wavelength) || !Number.isFinite(value)) continue
    if (value > 2) value /= 100
    lines.push(`${wavelength}\t${value}`)
  }
  return `${lines.join('\n')}\n`
}
