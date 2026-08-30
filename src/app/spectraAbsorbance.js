import { applyHullCorrections, clipSpectraToXRange } from './spectraSync.js'

/** Kubelka–Munk pseudo-absorbance (matches hylite.transform.convertToAbsorbance). */

/** Before KM, each spectrum is linearly rescaled so its minimum reflectance is at least this (%). */
export const KM_DISPLAY_FLOOR_PCT = 2.5

/** Omit points whose KM still exceeds this after the floor lift (safety net). */
const KM_MAX_ABSORBANCE = 50

/**
 * Linearly remap [R_min, R_max] → [floorPct, R_max] so band shape is preserved
 * but very low reflectance does not blow up in Kubelka–Munk.
 */
export function liftReflectanceFloorPercent(reflectance, floorPct = KM_DISPLAY_FLOOR_PCT) {
  const values = reflectance.filter(Number.isFinite)
  if (values.length === 0) return reflectance

  let rMin = values[0]
  let rMax = values[0]
  for (const value of values) {
    if (value < rMin) rMin = value
    if (value > rMax) rMax = value
  }

  if (rMin >= floorPct) return reflectance

  if (rMax <= rMin) {
    return reflectance.map((value) => (Number.isFinite(value) ? floorPct : value))
  }

  const scale = (rMax - floorPct) / (rMax - rMin)
  return reflectance.map((value) => {
    if (!Number.isFinite(value)) return value
    return floorPct + (value - rMin) * scale
  })
}

export function reflectancePercentToKubelkaMunk(value) {
  if (!Number.isFinite(value)) return Number.NaN

  let fraction = value
  if (fraction > 2) {
    fraction /= 100
  }

  if (fraction <= 0) return Number.NaN

  const clipped = Math.min(fraction, 1)
  const km = ((1 - clipped) ** 2) / (2 * clipped)
  if (km > KM_MAX_ABSORBANCE) return Number.NaN
  return km
}

export function applyAbsorbanceToSpectra(spectra) {
  return spectra.map((spectrum) => ({
    ...spectrum,
    reflectance: liftReflectanceFloorPercent(spectrum.reflectance).map(
      reflectancePercentToKubelkaMunk,
    ),
  }))
}

export function buildDisplaySpectra(
  visibleSpectra,
  { applyHull, hullPlotData, hullCalcRange, showAbsorbance },
) {
  let spectra = visibleSpectra

  if (applyHull) {
    if (!hullPlotData || !hullCalcRange) return []
    const corrected = applyHullCorrections(visibleSpectra, hullPlotData.spectra)
    spectra = clipSpectraToXRange(corrected, hullCalcRange[0], hullCalcRange[1])
  }

  if (showAbsorbance) {
    spectra = applyAbsorbanceToSpectra(spectra)
  }

  return spectra
}
