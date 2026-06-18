export async function exportSelectionSpectralFeatures(pyodide, selection, lookupMap = {}) {
  const exported = await pyodide.runPythonAsync(
    `export_selection_spectral_features(${JSON.stringify(selection)}, ${JSON.stringify(lookupMap)})`,
  )

  if (exported && typeof exported.toJs === 'function') {
    const payload = exported.toJs({ dict_converter: Object.fromEntries })
    exported.destroy?.()
    return payload
  }

  return exported
}

export function skillDocumentUrl() {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return `${base}llm/ispec-skill.md`
}

export async function loadSkillDocument() {
  const response = await fetch(skillDocumentUrl())
  if (!response.ok) {
    throw new Error(`Failed to load iSpec skill document (${response.status})`)
  }
  return response.text()
}
