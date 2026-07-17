import { parseSpectrumName } from './selectionMeta.js'
import { isVirtualSpectrum } from './virtualSpectra.js'

export const SATELLITE_SENSORS = ['ASTER', 'SENTINEL-2', 'PRISMA', 'ENMAP', 'EMIT']

const VIRTUAL_ARCHIVE = 'virtual'

const RESAMPLED_SENSOR_GROUPS = new Set(
  SATELLITE_SENSORS.map((sensor) => normalizeSensorToken(sensor)),
)

function normalizeSensorToken(value) {
  return String(value).toUpperCase().replace(/[\s_-]/g, '')
}

export function isResampledVirtualSpectrum(name) {
  if (!isVirtualSpectrum(name)) return false
  const { group } = parseSpectrumName(name)
  if (!group) return false
  return RESAMPLED_SENSOR_GROUPS.has(normalizeSensorToken(group))
}

export function resampleSourceSelection(selection) {
  return selection.filter((name) => !isResampledVirtualSpectrum(name))
}

export function formatResampleSpectrumName(sensor, sampleId, index = 1) {
  const suffix = index > 1 ? ` ${index}` : ''
  return `(${VIRTUAL_ARCHIVE}) [${sensor}] ${sampleId}${suffix}`
}

export function buildResampleOutputNames(selection, sensor, virtualSpectra = {}) {
  const reserved = new Set(selection)
  const names = []

  for (const sourceName of selection) {
    const { sampleId } = parseSpectrumName(sourceName)
    let index = 1
    let outputName = formatResampleSpectrumName(sensor, sampleId, index)
    while (reserved.has(outputName) || virtualSpectra[outputName]) {
      index += 1
      outputName = formatResampleSpectrumName(sensor, sampleId, index)
    }
    reserved.add(outputName)
    names.push({ sourceName, outputName })
  }

  return names
}
