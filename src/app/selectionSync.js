import { buildLookupMap, lookupNameForSpectrum } from './selectionMeta.js'
import { addPythonSelection } from './querySync.js'
import {
  buildUploadSpectrumNames,
  parseSpectrumText,
  sanitizeDownloadBasename,
  sortVirtualMixNames,
  spectrumToTxt,
  triggerTextDownload,
} from './virtualSpectra.js'

function enrichMixRecipesWithLookups(recipes, selection, selectionMeta) {
  if (!recipes || typeof recipes !== 'object') return {}

  const lookupMap = buildLookupMap(selection, selectionMeta)
  const out = {}

  for (const [mixName, components] of Object.entries(recipes)) {
    if (!Array.isArray(components)) continue
    out[mixName] = components.map((component) => {
      if (!component || typeof component !== 'object') return component
      const name = typeof component.name === 'string' ? component.name.trim() : ''
      const lookup = component.lookup ?? lookupMap[name]
      if (!lookup || lookup === name) return component
      return { ...component, lookup }
    })
  }

  return out
}

function toSpectrumSeriesPayload(exported) {
  if (!exported) return { spectra: [] }

  if (typeof exported.get === 'function') {
    const spectraRaw = exported.get('spectra')
    const spectra = []
    if (spectraRaw && typeof spectraRaw.get === 'function') {
      for (let i = 0; i < spectraRaw.length; i += 1) {
        const item = spectraRaw.get(i)
        spectra.push(parseSeriesEntry(item))
        item.destroy?.()
      }
    } else if (Array.isArray(spectraRaw)) {
      for (const item of spectraRaw) {
        spectra.push(parseSeriesEntry(item))
      }
    }
    exported.destroy?.()
    return { spectra }
  }

  return {
    spectra: Array.isArray(exported.spectra) ? exported.spectra.map(parseSeriesEntry) : [],
  }
}

function parseSeriesEntry(item) {
  if (item && typeof item.get === 'function') {
    return {
      name: String(item.get('name')),
      error: item.get('error') == null ? null : String(item.get('error')),
      wavelengths: Array.from(item.get('wavelengths') ?? []).map(Number),
      reflectance: Array.from(item.get('reflectance') ?? []).map(Number),
    }
  }

  return {
    name: String(item.name),
    error: item.error == null ? null : String(item.error),
    wavelengths: Array.isArray(item.wavelengths) ? item.wavelengths.map(Number) : [],
    reflectance: Array.isArray(item.reflectance) ? item.reflectance.map(Number) : [],
  }
}

function toMixturePayload(exported) {
  if (!exported) {
    throw new Error('Mixture creation returned no data.')
  }

  if (typeof exported.get === 'function') {
    const payload = {
      name: String(exported.get('name')),
      wavelengths: Array.from(exported.get('wavelengths') ?? []).map(Number),
      reflectance: Array.from(exported.get('reflectance') ?? []).map(Number),
    }
    exported.destroy?.()
    return payload
  }

  return {
    name: String(exported.name),
    wavelengths: Array.isArray(exported.wavelengths) ? exported.wavelengths.map(Number) : [],
    reflectance: Array.isArray(exported.reflectance) ? exported.reflectance.map(Number) : [],
  }
}

export async function syncPythonVirtualSpectra(pyodide, virtualSpectra = {}) {
  await pyodide.runPythonAsync(`sync_virtual_spectra(${JSON.stringify(virtualSpectra)})`)
}

export async function removePythonVirtualSpectrum(pyodide, name) {
  await pyodide.runPythonAsync(`remove_virtual_spectrum(${JSON.stringify(name)})`)
}

export async function exportSelectionSpectrumSeries(pyodide, names, lookupMap = {}) {
  const exported = await pyodide.runPythonAsync(
    `export_selection_spectrum_series(${JSON.stringify(names)}, ${JSON.stringify(lookupMap)})`,
  )
  return toSpectrumSeriesPayload(exported)
}

export async function createPythonWeightedMixture(pyodide, components, outputName) {
  const exported = await pyodide.runPythonAsync(
    `create_weighted_mixture(${JSON.stringify(components)}, ${JSON.stringify(outputName)})`,
  )
  return toMixturePayload(exported)
}

function toResampleBatchPayload(exported) {
  if (!exported) {
    throw new Error('Resampling returned no data.')
  }

  const readList = (value) => {
    if (!value) return []
    if (typeof value.get === 'function') {
      const items = []
      for (let i = 0; i < value.length; i += 1) {
        items.push(value.get(i))
      }
      return items
    }
    return Array.isArray(value) ? value : []
  }

  const parseSpectrum = (item) => {
    if (item && typeof item.get === 'function') {
      return {
        sourceName: String(item.get('source_name')),
        name: String(item.get('name')),
        wavelengths: Array.from(item.get('wavelengths') ?? []).map(Number),
        reflectance: Array.from(item.get('reflectance') ?? []).map(Number),
      }
    }
    return {
      sourceName: String(item.source_name),
      name: String(item.name),
      wavelengths: Array.isArray(item.wavelengths) ? item.wavelengths.map(Number) : [],
      reflectance: Array.isArray(item.reflectance) ? item.reflectance.map(Number) : [],
    }
  }

  const parseFailure = (item) => {
    if (item && typeof item.get === 'function') {
      return {
        sourceName: String(item.get('source_name')),
        error: String(item.get('error')),
      }
    }
    return {
      sourceName: String(item.source_name),
      error: String(item.error),
    }
  }

  if (typeof exported.get === 'function') {
    const payload = {
      spectra: readList(exported.get('spectra')).map(parseSpectrum),
      failures: readList(exported.get('failures')).map(parseFailure),
    }
    exported.destroy?.()
    return payload
  }

  return {
    spectra: Array.isArray(exported.spectra) ? exported.spectra.map(parseSpectrum) : [],
    failures: Array.isArray(exported.failures) ? exported.failures.map(parseFailure) : [],
  }
}

export async function resamplePythonSelection(pyodide, items, sensor) {
  const exported = await pyodide.runPythonAsync(
    `resample_selection_spectra(${JSON.stringify(items)}, ${JSON.stringify(sensor)})`,
  )
  return toResampleBatchPayload(exported)
}

export async function rebuildVirtualSpectraFromRecipes(
  pyodide,
  recipes = {},
  { selection = [], selectionMeta = {} } = {},
) {
  const mixNames = sortVirtualMixNames(Object.keys(recipes))
  if (!mixNames.length) {
    return {}
  }

  const enrichedRecipes = enrichMixRecipesWithLookups(recipes, selection, selectionMeta)
  const virtualSpectra = {}
  for (const mixName of mixNames) {
    const mixed = await createPythonWeightedMixture(pyodide, enrichedRecipes[mixName], mixName)
    virtualSpectra[mixName] = {
      wavelengths: mixed.wavelengths,
      reflectance: mixed.reflectance,
    }
  }

  return virtualSpectra
}

export function buildMixComponents(selection, selectionMeta, mixPercents, excludeName = null) {
  const lookupMap = buildLookupMap(selection, selectionMeta)
  const components = []

  for (const name of selection) {
    if (excludeName && name === excludeName) continue
    const weight = Number(mixPercents[name])
    if (!Number.isFinite(weight) || weight <= 0) continue

    const lookup = lookupNameForSpectrum(name, selectionMeta)
    const component = { name, weight_pct: weight }
    if (lookup !== name) {
      component.lookup = lookup
    }
    components.push(component)
  }

  return components
}

export async function downloadSelectedSpectra(pyodide, selection, selectionMeta) {
  if (!selection.length) return

  const lookupMap = buildLookupMap(selection, selectionMeta)
  const { spectra } = await exportSelectionSpectrumSeries(pyodide, selection, lookupMap)
  const failures = []

  for (let index = 0; index < spectra.length; index += 1) {
    const spectrum = spectra[index]
    if (spectrum.error) {
      failures.push(`${spectrum.name}: ${spectrum.error}`)
      continue
    }
    const basename = sanitizeDownloadBasename(spectrum.name)
    const content = spectrumToTxt(spectrum.wavelengths, spectrum.reflectance)
    triggerTextDownload(`${basename}.txt`, content)
    if (index < spectra.length - 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, 150)
      })
    }
  }

  if (failures.length) {
    throw new Error(failures.join('\n'))
  }
}

function isUploadableSpectrumFile(file) {
  return /\.(txt|csv)$/i.test(String(file?.name ?? ''))
}

export async function uploadSpectrumFiles(pyodide, files, selection, virtualSpectra) {
  const uploadFiles = Array.from(files).filter(isUploadableSpectrumFile)
  if (uploadFiles.length === 0) {
    throw new Error('Choose one or more .txt or .csv spectrum files.')
  }

  const mappings = buildUploadSpectrumNames(
    uploadFiles.map((file) => file.name),
    selection,
    virtualSpectra,
  )
  const parsed = []
  const failures = []

  for (let index = 0; index < uploadFiles.length; index += 1) {
    const file = uploadFiles[index]
    const { outputName } = mappings[index]
    try {
      const content = await file.text()
      const series = parseSpectrumText(content)
      parsed.push({
        name: outputName,
        wavelengths: series.wavelengths,
        reflectance: series.reflectance,
      })
    } catch (err) {
      failures.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (parsed.length === 0) {
    throw new Error(failures.join('\n') || 'No spectra could be loaded.')
  }

  const nextVirtual = { ...virtualSpectra }
  for (const spectrum of parsed) {
    nextVirtual[spectrum.name] = {
      wavelengths: spectrum.wavelengths,
      reflectance: spectrum.reflectance,
    }
  }

  await syncPythonVirtualSpectra(pyodide, nextVirtual)

  let nextSelection = [...selection]
  for (const spectrum of parsed) {
    if (!nextSelection.includes(spectrum.name)) {
      nextSelection = await addPythonSelection(pyodide, spectrum.name)
    }
  }

  return { nextVirtual, nextSelection, failures }
}
