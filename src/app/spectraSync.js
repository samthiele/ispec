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
export const HULL_Y_MAX = 1.1

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

export function defaultPlotDomains(spectra, xDomain = null, { hullYAxis = false } = {}) {
  if (xDomain) {
    const { xDomain: x, yDomain } = computePlotExtents(spectra, xDomain, null, { hullYAxis })
    return { xDomain: x, yDomain }
  }
  return computePlotExtents(spectra, null, null, { hullYAxis })
}

export function computePlotExtents(spectra, xDomain = null, yDomain = null, { hullYAxis = false } = {}) {
  if (!spectra.length) {
    return {
      xDomain: [0, 1],
      yDomain: hullYAxis ? [0, HULL_Y_MAX] : [0, 100],
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
      yMax = hullYAxis ? 1 : 100
    }
    if (hullYAxis) {
      const pad = Math.max((HULL_Y_MAX - yMin) * Y_AXIS_PAD_FRACTION, 0.01)
      yMin = Math.max(0, yMin - pad)
      yMax = HULL_Y_MAX
    } else {
      const pad = Math.max((yMax - yMin) * Y_AXIS_PAD_FRACTION, 1)
      yMin -= pad
      yMax += pad
    }
  }

  return {
    xDomain: [xMin, xMax],
    yDomain: [yMin, yMax],
  }
}

export function defaultDomainsFromSpectra(spectra) {
  return computePlotExtents(spectra)
}
