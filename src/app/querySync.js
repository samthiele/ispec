export const DEFAULT_CONFIDENCE = 10
export const DEFAULT_PAGE_SIZE = 15

export async function exportSearchResult(pyodide) {
  const exported = await pyodide.runPythonAsync('export_search_result()')
  return toSearchResult(exported)
}

export async function runPythonSearch(pyodide, query, confidence = DEFAULT_CONFIDENCE) {
  await pyodide.runPythonAsync(
    `run_search(${JSON.stringify(query)}, confidence=${Number(confidence)})`,
  )
  return exportSearchResult(pyodide)
}

export async function clearPythonSearch(pyodide) {
  await pyodide.runPythonAsync('clear_search()')
  return exportSearchResult(pyodide)
}

export async function exportPythonSelection(pyodide) {
  const exported = await pyodide.runPythonAsync('export_selection()')
  return toSelectionList(exported)
}

export async function addPythonSelection(pyodide, name) {
  await pyodide.runPythonAsync(`add_to_selection(${JSON.stringify(name)})`)
  return exportPythonSelection(pyodide)
}

export async function removePythonSelection(pyodide, name) {
  await pyodide.runPythonAsync(`remove_from_selection(${JSON.stringify(name)})`)
  return exportPythonSelection(pyodide)
}

export async function applyPythonQueryState(pyodide, { query, slice, selection }) {
  const payload = {
    query: query ?? '',
    slice: Array.isArray(slice) ? slice : [0, 0],
  }
  if (selection !== undefined) {
    payload.selection = Array.isArray(selection) ? selection.map(String) : []
  }
  await pyodide.runPythonAsync(`state.apply(${JSON.stringify(payload)})`)
}

function toSearchResult(exported) {
  if (!exported) {
    return { names: [], scores: [], total: 0 }
  }

  if (typeof exported.get === 'function') {
    const names = Array.from(exported.get('names') ?? [])
    const scores = Array.from(exported.get('scores') ?? []).map(Number)
    const total = Number(exported.get('total') ?? names.length)
    if (typeof exported.destroy === 'function') {
      exported.destroy()
    }
    return { names, scores, total }
  }

  return {
    names: Array.isArray(exported.names) ? exported.names : [],
    scores: Array.isArray(exported.scores) ? exported.scores.map(Number) : [],
    total: Number(exported.total ?? 0),
  }
}

function toSelectionList(exported) {
  if (!exported) return []
  if (Array.isArray(exported)) {
    return exported.map(String)
  }
  if (typeof exported.toJs === 'function') {
    const list = exported.toJs()
    if (typeof exported.destroy === 'function') {
      exported.destroy()
    }
    return Array.isArray(list) ? list.map(String) : []
  }
  if (typeof exported.get === 'function' && typeof exported.length === 'number') {
    const list = []
    for (let i = 0; i < exported.length; i += 1) {
      list.push(String(exported.get(i)))
    }
    if (typeof exported.destroy === 'function') {
      exported.destroy()
    }
    return list
  }
  return []
}

export function clampSlice(slice, total, pageSize) {
  if (total <= 0) return [0, 0]
  const size = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE)
  let start = Math.max(0, Number(slice?.[0] ?? 0))
  if (start >= total) {
    start = Math.max(0, Math.floor((total - 1) / size) * size)
  }
  const end = Math.min(start + size, total)
  return [start, end]
}

export function previousSlice(slice, pageSize, total) {
  if (total <= 0) return [0, 0]
  const size = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE)
  const start = Math.max(0, Number(slice?.[0] ?? 0) - size)
  return clampSlice([start, start + size], total, pageSize)
}

export function nextSlice(slice, pageSize, total) {
  if (total <= 0) return [0, 0]
  const size = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE)
  const start = Number(slice?.[1] ?? 0)
  if (start >= total) return clampSlice(slice, total, pageSize)
  return clampSlice([start, start + size], total, pageSize)
}

export function initialSlice(total, pageSize) {
  return clampSlice([0, Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE)], total, pageSize)
}
