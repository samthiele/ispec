import { DEFAULT_VIRTUAL_SELECTED_COLOR, isVirtualSpectrum } from './virtualSpectra.js'

export const DEFAULT_SELECTED_COLOR = '#ffffff'

const ARCHIVE_PREFIX_RE = /^\(([^)]+)\)\s+(.*)$/
const GROUP_PREFIX_RE = /^\[([^\]]+)\]\s+(.*)$/

export function parseSpectrumName(name) {
  const canonical = String(name).trim()
  let archive = null
  let rest = canonical

  const archiveMatch = ARCHIVE_PREFIX_RE.exec(canonical)
  if (archiveMatch) {
    archive = archiveMatch[1]
    rest = archiveMatch[2]
  }

  let group = null
  let sampleId = rest
  const groupMatch = GROUP_PREFIX_RE.exec(rest)
  if (groupMatch) {
    group = groupMatch[1]
    sampleId = groupMatch[2]
  }

  return { archive, group, sampleId, canonical }
}

export function formatSpectrumDisplayName({ archive, group, sampleId }, groupOverride) {
  const groupLabel = groupOverride !== undefined ? groupOverride : group
  let label = sampleId
  if (groupLabel) {
    label = `[${groupLabel}] ${sampleId}`
  }
  if (archive) {
    label = `(${archive}) ${label}`
  }
  return label
}

export function lookupNameForSpectrum(canonical, selectionMeta) {
  const parsed = parseSpectrumName(canonical)
  const entry = selectionMeta?.[canonical]
  if (entry?.group === undefined) return canonical
  if (entry.group === parsed.group) return canonical
  return formatSpectrumDisplayName(parsed, entry.group)
}

export function buildLookupMap(names, selectionMeta) {
  const map = {}
  for (const name of names) {
    const lookup = lookupNameForSpectrum(name, selectionMeta)
    if (lookup !== name) {
      map[name] = lookup
    }
  }
  return map
}

/** Stable dependency key for lookup maps — ignores color-only meta changes. */
export function selectionGroupDep(selection, selectionMeta) {
  return selection.map((name) => `${name}:${selectionMeta?.[name]?.group ?? ''}`).join('|')
}

/** Stable dependency key for selected plot colors. */
export function selectionColorsDep(selection, selectionMeta) {
  return selection.map((name) => `${name}:${selectionMeta?.[name]?.color ?? ''}`).join('|')
}

export function selectedColorFor(canonical, selectionMeta) {
  const color = selectionMeta?.[canonical]?.color
  if (typeof color === 'string') return color
  if (isVirtualSpectrum(canonical)) return DEFAULT_VIRTUAL_SELECTED_COLOR
  return DEFAULT_SELECTED_COLOR
}

export function normalizeSelectionMeta(raw, selection) {
  if (!raw || typeof raw !== 'object') return {}

  const allowed = new Set(selection)
  const out = {}

  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.has(key) || !value || typeof value !== 'object') continue

    const entry = {}
    if (typeof value.group === 'string') {
      entry.group = value.group
    }
    if (typeof value.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.color)) {
      entry.color = value.color.toLowerCase()
    }
    const mixPercent = Number(value.mixPercent)
    if (Number.isFinite(mixPercent) && mixPercent >= 0 && mixPercent <= 100) {
      entry.mixPercent = mixPercent
    }
    if (Object.keys(entry).length) {
      out[key] = entry
    }
  }

  return out
}

export function pruneSelectionMeta(selectionMeta, selection) {
  return normalizeSelectionMeta(selectionMeta, selection)
}

export function setSelectionGroup(selectionMeta, canonical, group, originalGroup) {
  const meta = { ...selectionMeta }
  const entry = { ...(meta[canonical] ?? {}) }

  if (group === originalGroup) {
    delete entry.group
  } else {
    entry.group = group
  }

  if (Object.keys(entry).length === 0) {
    delete meta[canonical]
  } else {
    meta[canonical] = entry
  }

  return meta
}

export function setSelectionColor(selectionMeta, canonical, color) {
  const meta = { ...selectionMeta }
  const entry = { ...(meta[canonical] ?? {}) }
  const normalized = String(color).toLowerCase()
  const defaultColor = isVirtualSpectrum(canonical)
    ? DEFAULT_VIRTUAL_SELECTED_COLOR
    : DEFAULT_SELECTED_COLOR

  if (normalized === defaultColor) {
    delete entry.color
  } else {
    entry.color = normalized
  }

  if (Object.keys(entry).length === 0) {
    delete meta[canonical]
  } else {
    meta[canonical] = entry
  }

  return meta
}

export function setSelectionMixPercent(selectionMeta, canonical, mixPercent) {
  const meta = { ...selectionMeta }
  const entry = { ...(meta[canonical] ?? {}) }

  if (mixPercent == null || mixPercent === '') {
    delete entry.mixPercent
  } else {
    const parsed = Number(mixPercent)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      delete entry.mixPercent
    } else {
      entry.mixPercent = parsed
    }
  }

  if (Object.keys(entry).length === 0) {
    delete meta[canonical]
  } else {
    meta[canonical] = entry
  }

  return meta
}

export function mixPercentFor(canonical, selectionMeta) {
  const value = selectionMeta?.[canonical]?.mixPercent
  return Number.isFinite(value) ? value : null
}

export function selectedColorsMap(selection, selectionMeta) {
  const colors = {}
  for (const name of selection) {
    const color = selectionMeta?.[name]?.color
    if (typeof color === 'string') {
      colors[name] = color
    } else if (isVirtualSpectrum(name)) {
      colors[name] = DEFAULT_VIRTUAL_SELECTED_COLOR
    }
  }
  return colors
}
