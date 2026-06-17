export const ALL_WAVELENGTH_MAX_NM = 14000

export const SPECTRAL_BANDS = {
  ALL: { label: 'All', min: null, max: ALL_WAVELENGTH_MAX_NM },
  VNIR: { label: 'VNIR', min: 400, max: 1000 },
  SWIR: { label: 'SWIR', min: 1000, max: 2500 },
  MWIR: { label: 'MWIR', min: 2500, max: 5000 },
  LWIR: { label: 'LWIR', min: 5000, max: 14500 },
}

export const SPECTRAL_BAND_KEYS = ['VNIR', 'SWIR', 'MWIR', 'LWIR', 'ALL']
