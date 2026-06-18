export function formatSpectralFeaturesSummary(exported) {
  if (!exported?.spectra?.length) {
    return 'No spectra are currently selected. Ask the user to select spectra in the Query widget first.'
  }

  const sections = []

  for (const spectrum of exported.spectra) {
    if (spectrum.error) {
      sections.push(`## ${spectrum.name}\nError: ${spectrum.error}`)
      continue
    }

    const header = spectrum.label ?? spectrum.name
    const range = spectrum.wavelength_range_nm
    const rangeText = Array.isArray(range)
      ? `${range[0].toFixed(0)}–${range[1].toFixed(0)} nm`
      : 'unknown range'

    const lines = [`## ${header}`, `Archive: ${spectrum.archive}`, `Coverage: ${rangeText}`, '']

    for (const [bandName, band] of Object.entries(spectrum.bands ?? {})) {
      if (!band.available) {
        lines.push(`### ${bandName} — not covered by this spectrum`)
        continue
      }

      const [r0, r1] = band.range_nm
      lines.push(`### ${bandName} (${r0.toFixed(0)}–${r1.toFixed(0)} nm)`)
      lines.push(formatFeatureList('Absorption minima', band.minima))
      lines.push(formatFeatureList('Reflectance maxima', band.maxima))
      lines.push('')
    }

    sections.push(lines.join('\n'))
  }

  return sections.join('\n\n')
}

function formatFeatureList(title, features) {
  if (!features?.length) {
    return `${title}: none detected in range`
  }

  const items = features.map(
    (feature) => `${feature.wavelength_nm.toFixed(1)} nm (prominence ${feature.prominence.toExponential(2)})`,
  )
  return `${title}: ${items.join('; ')}`
}
