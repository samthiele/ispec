function toPlotPayload(exported) {
  if (!exported) {
    return { spectra: [] }
  }

  if (typeof exported.get === 'function') {
    const spectraRaw = exported.get('spectra')
    const spectra = []

    if (spectraRaw && typeof spectraRaw.get === 'function') {
      for (let i = 0; i < spectraRaw.length; i += 1) {
        const item = spectraRaw.get(i)
        spectra.push(parseSpectrumEntry(item))
        if (typeof item.destroy === 'function') item.destroy()
      }
    } else if (Array.isArray(spectraRaw)) {
      for (const item of spectraRaw) {
        spectra.push(parseSpectrumEntry(item))
      }
    }

    if (typeof exported.destroy === 'function') exported.destroy()
    return { spectra }
  }

  return {
    spectra: Array.isArray(exported.spectra) ? exported.spectra.map(parseSpectrumEntry) : [],
  }
}

function parseSpectrumEntry(item) {
  if (item && typeof item.get === 'function') {
    return {
      name: String(item.get('name')),
      rank: item.get('rank') == null ? null : Number(item.get('rank')),
      score: item.get('score') == null ? null : Number(item.get('score')),
      selected: Boolean(item.get('selected')),
      wavelengths: Array.from(item.get('wavelengths') ?? []).map(Number),
      reflectance: Array.from(item.get('reflectance') ?? []).map(Number),
    }
  }

  return {
    name: String(item.name),
    rank: item.rank == null ? null : Number(item.rank),
    score: item.score == null ? null : Number(item.score),
    selected: Boolean(item.selected),
    wavelengths: Array.isArray(item.wavelengths) ? item.wavelengths.map(Number) : [],
    reflectance: Array.isArray(item.reflectance) ? item.reflectance.map(Number) : [],
  }
}

export async function exportSpectraPlotData(pyodide, pageStart, pageEnd, lookupMap = {}) {
  const lookupJson = JSON.stringify(lookupMap)
  const exported = await pyodide.runPythonAsync(
    `export_spectra_plot_data(${Number(pageStart)}, ${Number(pageEnd)}, ${lookupJson})`,
  )
  return toPlotPayload(exported)
}

export async function applyHullToSpectra(pyodide, names, xMin, xMax, lookupMap = {}) {
  if (!names.length) {
    return { spectra: [] }
  }

  const namesJson = JSON.stringify(names)
  const lookupJson = JSON.stringify(lookupMap)
  const exported = await pyodide.runPythonAsync(
    `apply_hull_to_spectra(${namesJson}, ${Number(xMin)}, ${Number(xMax)}, ${lookupJson})`,
  )
  return toPlotPayload(exported)
}

export const HULL_BAND_THRESH_NM = 25
export const Y_AXIS_PAD_FRACTION = 0.1
export const HULL_Y_MAX_PCT = 105
export const HULL_Y_DOMAIN = [0, HULL_Y_MAX_PCT]

/** Reflectance axes are percentages; never show values below zero. */
export function clampPlotYDomainMin(yDomain) {
  if (!Array.isArray(yDomain) || yDomain.length !== 2) return yDomain
  const lo = Number(yDomain[0])
  const hi = Number(yDomain[1])
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return yDomain
  return [Math.max(0, lo), hi]
}

/** Drop saved y-axis limits that used the legacy 0–1 hull scale (reflectance/hull only). */
export function normalizePlotYDomain(yDomain, { absorbanceAxis = false } = {}) {
  if (!Array.isArray(yDomain) || yDomain.length !== 2) return null
  const lo = Number(yDomain[0])
  const hi = Number(yDomain[1])
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null
  if (!absorbanceAxis && hi <= 2 && lo >= 0 && hi - lo <= 1.05) return null
  return clampPlotYDomainMin([lo, hi])
}

function yAxisPadding(yMin, yMax, { hullYAxis = false, absorbanceAxis = false } = {}) {
  const span = yMax - yMin
  if (hullYAxis) {
    return Math.max((HULL_Y_MAX_PCT - yMin) * Y_AXIS_PAD_FRACTION, 1)
  }
  if (absorbanceAxis) {
    if (!Number.isFinite(span) || span <= 0) return 1e-4
    return Math.max(span * Y_AXIS_PAD_FRACTION, span * 0.01, 1e-6)
  }
  return Math.max(span * Y_AXIS_PAD_FRACTION, 1)
}

export function spansWavelengthRange(spectrum, xMin, xMax, thresh = HULL_BAND_THRESH_NM) {
  const { wavelengths } = spectrum
  if (!wavelengths.length) return false

  let wavMin = Number.POSITIVE_INFINITY
  let wavMax = Number.NEGATIVE_INFINITY
  for (const wav of wavelengths) {
    if (!Number.isFinite(wav)) continue
    wavMin = Math.min(wavMin, wav)
    wavMax = Math.max(wavMax, wav)
  }

  if (!Number.isFinite(wavMin) || !Number.isFinite(wavMax)) return false
  return wavMin <= xMin + thresh && wavMax >= xMax - thresh
}

export function filterSpectraBySpan(spectra, xMin, xMax) {
  return spectra.filter((spectrum) => spansWavelengthRange(spectrum, xMin, xMax))
}

export function filterPlotSpectra(spectra, { showSelected, showQuery }) {
  return spectra.filter((spectrum) => {
    const isQuery = spectrum.rank != null
    const isSelected = spectrum.selected
    return (showSelected && isSelected) || (showQuery && isQuery)
  })
}

export function applyHullCorrections(spectra, hullSpectra) {
  if (!hullSpectra.length) return []

  const hullByName = new Map(hullSpectra.map((spectrum) => [spectrum.name, spectrum]))
  return spectra
    .filter((spectrum) => hullByName.has(spectrum.name))
    .map((spectrum) => {
      const hull = hullByName.get(spectrum.name)
      return {
        ...spectrum,
        wavelengths: hull.wavelengths ?? spectrum.wavelengths,
        reflectance: hull.reflectance,
      }
    })
}

/** Keep only points inside [xMin, xMax] for display (e.g. hull-corrected range). */
export function clipSpectraToXRange(spectra, xMin, xMax) {
  return spectra.flatMap((spectrum) => {
    const wavelengths = []
    const reflectance = []
    for (let i = 0; i < spectrum.wavelengths.length; i += 1) {
      const wav = spectrum.wavelengths[i]
      if (wav < xMin || wav > xMax) continue
      wavelengths.push(wav)
      reflectance.push(spectrum.reflectance[i])
    }
    if (!wavelengths.length) return []
    return [{ ...spectrum, wavelengths, reflectance }]
  })
}

export function defaultPlotDomains(spectra, xDomain = null, { hullYAxis = false } = {}) {
  if (xDomain) {
    const { xDomain: x, yDomain } = computePlotExtents(spectra, xDomain, null, { hullYAxis })
    return { xDomain: x, yDomain }
  }
  return computePlotExtents(spectra, null, null, { hullYAxis })
}

export function computePlotExtents(
  spectra,
  xDomain = null,
  yDomain = null,
  { hullYAxis = false, absorbanceAxis = false } = {},
) {
  if (!spectra.length) {
    return {
      xDomain: [0, 1],
      yDomain: hullYAxis ? [0, HULL_Y_MAX_PCT] : absorbanceAxis ? [0, 1] : [0, 100],
    }
  }

  let globalXMin = Number.POSITIVE_INFINITY
  let globalXMax = Number.NEGATIVE_INFINITY
  for (const spectrum of spectra) {
    for (const wav of spectrum.wavelengths) {
      if (!Number.isFinite(wav)) continue
      globalXMin = Math.min(globalXMin, wav)
      globalXMax = Math.max(globalXMax, wav)
    }
  }

  const xMin = xDomain?.[0] ?? globalXMin
  const xMax = xDomain?.[1] ?? globalXMax

  const explicitY = normalizePlotYDomain(yDomain, { absorbanceAxis }) != null

  if (hullYAxis && !explicitY) {
    return {
      xDomain: [xMin, xMax],
      yDomain: [...HULL_Y_DOMAIN],
    }
  }

  let yMin = yDomain?.[0]
  let yMax = yDomain?.[1]

  if (yMin == null || yMax == null) {
    yMin = Number.POSITIVE_INFINITY
    yMax = Number.NEGATIVE_INFINITY
    for (const spectrum of spectra) {
      for (let i = 0; i < spectrum.wavelengths.length; i += 1) {
        const wav = spectrum.wavelengths[i]
        if (wav < xMin || wav > xMax) continue
        const value = spectrum.reflectance[i]
        if (!Number.isFinite(value)) continue
        yMin = Math.min(yMin, value)
        yMax = Math.max(yMax, value)
      }
    }
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
      yMin = 0
      yMax = hullYAxis ? HULL_Y_MAX_PCT : absorbanceAxis ? 1 : 100
    }
    if (hullYAxis) {
      const pad = yAxisPadding(yMin, yMax, { hullYAxis: true })
      yMin = Math.max(0, yMin - pad)
    } else {
      const pad = yAxisPadding(yMin, yMax, { absorbanceAxis })
      yMin = Math.max(0, yMin - pad)
      yMax += pad
    }
  }

  if (hullYAxis) {
    if (!explicitY) {
      yMax = HULL_Y_MAX_PCT
    }
    if (!Number.isFinite(yMin)) yMin = 0
    yMin = Math.max(0, yMin)
  } else {
    yMin = Math.max(0, yMin)
  }

  return {
    xDomain: [xMin, xMax],
    yDomain: clampPlotYDomainMin([yMin, yMax]),
  }
}

export function defaultDomainsFromSpectra(spectra) {
  return computePlotExtents(spectra)
}
