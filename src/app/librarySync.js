import {
  fetchLibraryCatalog,
  findLibraryById,
  libraryFileUrl,
} from './libraries.js'

async function fetchLibraryBytes(file) {
  const response = await fetch(libraryFileUrl(file))
  if (!response.ok) {
    throw new Error(`Failed to load library file ${file} (${response.status})`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

function libraryTempPath(libId) {
  return `/tmp/ispec-${libId}.fda`
}

async function runPythonBytes(pyodide, libId, bytes, fnName) {
  const path = libraryTempPath(libId)
  pyodide.FS.writeFile(path, bytes)
  await pyodide.runPythonAsync(`
with open(${JSON.stringify(path)}, "rb") as fh:
    _lib_bytes = fh.read()
${fnName}(${JSON.stringify(libId)}, _lib_bytes)
`)
}

export async function getPythonLoadedLibraryIds(pyodide) {
  return pyodide.runPythonAsync('[str(x) for x in _loaded_ids]')
}

export async function addPythonLibrary(pyodide, catalogEntry) {
  const bytes = await fetchLibraryBytes(catalogEntry.file)
  await runPythonBytes(pyodide, catalogEntry.id, bytes, 'add_library_from_bytes')
  return pyodide.runPythonAsync('export_library_state()')
}

export async function removePythonLibrary(pyodide, libId) {
  await pyodide.runPythonAsync(`remove_library(${JSON.stringify(libId)})`)
  return pyodide.runPythonAsync('export_library_state()')
}

export async function syncPythonLibraries(pyodide, catalog, loadedIds) {
  const loadedSet = new Set(loadedIds)
  const currentIds = await getPythonLoadedLibraryIds(pyodide)

  for (const libId of currentIds) {
    if (!loadedSet.has(libId)) {
      await removePythonLibrary(pyodide, libId)
    }
  }

  const currentSet = new Set(await getPythonLoadedLibraryIds(pyodide))
  for (const libId of loadedIds) {
    if (currentSet.has(libId)) continue
    const entry = findLibraryById(catalog, libId)
    if (!entry) {
      throw new Error(`Unknown library id: ${libId}`)
    }
    await addPythonLibrary(pyodide, entry)
  }

  return pyodide.runPythonAsync('export_library_state()')
}

export async function applyPythonUiLibraries(pyodide) {
  await pyodide.runPythonAsync('state.apply({"libraries": list(_loaded_ids)})')
}
