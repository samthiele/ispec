import { loadPyodide, version } from 'pyodide'
import { PYTHON_INIT_CODE, PYTHON_PACKAGES } from './ispecBootstrap.js'

function pyodideIndexURL() {
  return `https://cdn.jsdelivr.net/pyodide/v${version}/full/`
}

async function installFromSpec(pyodide, spec, deps) {
  await pyodide.runPythonAsync(`
import micropip
await micropip.install(${JSON.stringify(spec)}, deps=${deps ? 'True' : 'False'})
`)
}

async function installPackage(pyodide, { spec, deps }) {
  const candidates = Array.isArray(spec) ? spec : [spec]
  let lastError
  for (const candidate of candidates) {
    try {
      await installFromSpec(pyodide, candidate, deps)
      return
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

async function ensureMicropip(pyodide) {
  try {
    await pyodide.runPythonAsync('import micropip')
    return
  } catch {
    // Fall through and load explicitly.
  }

  await pyodide.loadPackage('micropip')
  await pyodide.runPythonAsync('import micropip')
}

let pyodideInitPromise = null

export function initPyodide(onProgress) {
  if (!pyodideInitPromise) {
    pyodideInitPromise = bootstrap(onProgress)
  }
  return pyodideInitPromise
}

async function bootstrap(onProgress) {
  onProgress('Loading Python runtime…')

  const instance = await loadPyodide({
    indexURL: pyodideIndexURL(),
    packages: ['micropip'],
  })

  onProgress('Loading package manager…')
  await ensureMicropip(instance)

  for (const pkg of PYTHON_PACKAGES) {
    onProgress(`Installing ${pkg.label}…`)
    await installPackage(instance, pkg)
  }

  onProgress('Initialising iSpec environment…')
  await instance.runPythonAsync(PYTHON_INIT_CODE)

  return instance
}
