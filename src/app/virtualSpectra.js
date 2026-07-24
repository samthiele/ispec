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

/** User- or LLM-chosen mix label, e.g. `(virtual) [mix] DolTrem`. */
export function formatNamedMixSpectrumName(label) {
  const cleaned = normalizeMixLabel(label)
  if (!cleaned) {
    throw new Error('Mix label must contain letters, numbers, dots, underscores, or hyphens.')
  }
  return `(${VIRTUAL_ARCHIVE}) [${MIX_GROUP}] ${cleaned}`
}

export function normalizeMixLabel(label) {
  return String(label ?? '')
    .trim()
    .replace(/[^\w.-]+/g, '')
    .slice(0, 64)
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
  const groupMatch = /^\[([^\]]+)\]\s+(.*)$/.exec(parsed.rest)
  const sampleId = groupMatch ? groupMatch[2] : parsed.rest
  const match = /^Mix\s+(\d+)$/i.exec(sampleId.trim())
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

/** Virtual spectra stored in share state (uploads, resamples — not recipe-derived mixes). */
export function shareableVirtualSpectra(virtualSpectra, selection, virtualMixRecipes = {}) {
  const mixNames = new Set(Object.keys(virtualMixRecipes ?? {}))
  const normalized = normalizeVirtualSpectra(virtualSpectra, selection)
  const out = {}

  for (const [name, payload] of Object.entries(normalized)) {
    if (!mixNames.has(name)) {
      out[name] = payload
    }
  }

  return out
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

const UPLOAD_GROUP = 'upload'

export function uploadBasenameFromFilename(filename) {
  const base = String(filename)
    .replace(/^.*[/\\]/, '')
    .replace(/\.(txt|csv)$/i, '')
  const cleaned = base
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
  return cleaned || 'spectrum'
}

export function formatUploadSpectrumName(sampleId, index = 1) {
  const suffix = index > 1 ? ` ${index}` : ''
  return `(${VIRTUAL_ARCHIVE}) [${UPLOAD_GROUP}] ${sampleId}${suffix}`
}

export function buildUploadSpectrumNames(filenames, selection = [], virtualSpectra = {}) {
  const reserved = new Set(selection)
  const names = []

  for (const filename of filenames) {
    const sampleId = uploadBasenameFromFilename(filename)
    let index = 1
    let outputName = formatUploadSpectrumName(sampleId, index)
    while (reserved.has(outputName) || virtualSpectra[outputName]) {
      index += 1
      outputName = formatUploadSpectrumName(sampleId, index)
    }
    reserved.add(outputName)
    names.push({ filename, sampleId, outputName })
  }

  return names
}

function normalizeReflectancePercent(reflectance) {
  const finite = reflectance.filter(Number.isFinite)
  if (finite.length === 0) return reflectance
  const max = Math.max(...finite)
  if (max <= 2) {
    return reflectance.map((value) => (Number.isFinite(value) ? value * 100 : value))
  }
  return reflectance
}

function detectSpectrumDelimiter(headerLine) {
  if (headerLine.includes('\t')) return '\t'
  if (headerLine.includes(',')) return ','
  return '\t'
}

function splitSpectrumColumns(line, delimiter) {
  return line.split(delimiter).map((column) => column.trim())
}

export function parseSpectrumText(content) {
  const text = String(content ?? '').replace(/^\uFEFF/, '').trim()
  if (!text) {
    throw new Error('File is empty.')
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))

  if (lines.length < 2) {
    throw new Error('File must contain a header row and at least one data row.')
  }

  const delimiter = detectSpectrumDelimiter(lines[0])
  const headerCols = splitSpectrumColumns(lines[0], delimiter).map((column) => column.toLowerCase())

  let wavelengthIndex = headerCols.findIndex(
    (column) => column === 'wavelength_nm' || column === 'wavelength' || column === 'nm',
  )
  let reflectanceIndex = headerCols.findIndex(
    (column) => column === 'reflectance' || column === 'refl' || column === 'reflectance_pct',
  )

  if (wavelengthIndex < 0 || reflectanceIndex < 0) {
    if (headerCols.length >= 2) {
      wavelengthIndex = 0
      reflectanceIndex = 1
    } else {
      throw new Error('Expected header columns wavelength_nm and reflectance.')
    }
  }

  const wavelengths = []
  const reflectance = []

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const columns = splitSpectrumColumns(lines[lineIndex], delimiter)
    const wavelength = Number(columns[wavelengthIndex])
    const value = Number(columns[reflectanceIndex])
    if (!Number.isFinite(wavelength) || !Number.isFinite(value)) continue
    wavelengths.push(wavelength)
    reflectance.push(value)
  }

  if (wavelengths.length === 0) {
    throw new Error('No valid wavelength/reflectance pairs found.')
  }

  return {
    wavelengths,
    reflectance: normalizeReflectancePercent(reflectance),
  }
}
