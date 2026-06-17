import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchLibraryCatalog } from '../app/libraries.js'
import {
  addPythonLibrary,
  applyPythonUiLibraries,
  removePythonLibrary,
  syncPythonLibraries,
} from '../app/librarySync.js'
import { applyPythonQueryState } from '../app/querySync.js'
import { useAppState } from './useAppState.js'
import { initPyodide } from '../python/initPyodide.js'
import { PyodideContext } from './PyodideContext.js'

function formatResult(value) {
  if (value === undefined) return ''
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

export function PyodideProvider({ children }) {
  const { appState } = useAppState()
  const [pyodide, setPyodide] = useState(null)
  const [status, setStatus] = useState('loading')
  const [loadingMessage, setLoadingMessage] = useState('Loading Python runtime…')
  const [error, setError] = useState(null)
  const [transcript, setTranscript] = useState([])
  const queueRef = useRef(Promise.resolve())
  const pyodideRef = useRef(null)
  const catalogRef = useRef(null)
  const bootstrapRef = useRef(false)
  const initialAppStateRef = useRef(appState)

  const enqueue = useCallback((task) => {
    const job = async () => task()
    const next = queueRef.current.then(job, job)
    queueRef.current = next
    return next
  }, [])

  const getCatalog = useCallback(async () => {
    if (catalogRef.current) return catalogRef.current
    catalogRef.current = await fetchLibraryCatalog()
    return catalogRef.current
  }, [])

  const appendTranscript = useCallback((entries) => {
    setTranscript((prev) => [...prev, ...entries])
  }, [])

  const syncLibrariesImpl = useCallback(
    async (loadedIds, { echo = false } = {}) => {
      const instance = pyodideRef.current
      if (!instance) return undefined

      const catalog = await getCatalog()
      const result = await syncPythonLibraries(instance, catalog, loadedIds)
      await applyPythonUiLibraries(instance)
      if (echo) {
        appendTranscript([
          {
            kind: 'system',
            source: 'library',
            text: `Spectral libraries synced (${result.n_hy_fourier} HyFourier entries).`,
          },
        ])
      }
      return result
    },
    [appendTranscript, getCatalog],
  )

  useEffect(() => {
    let cancelled = false

    initPyodide((message) => {
      if (!cancelled) setLoadingMessage(message)
    })
      .then(async (instance) => {
        if (cancelled || bootstrapRef.current) return
        bootstrapRef.current = true

        pyodideRef.current = instance
        setPyodide(instance)

        setLoadingMessage('Loading spectral libraries…')
        const initial = initialAppStateRef.current
        await syncLibrariesImpl(initial.libraries, { echo: true })
        await applyPythonQueryState(instance, {
          query: initial.query ?? '',
          slice: initial.slice,
          selection: initial.selection ?? [],
        })

        if (cancelled) return

        setStatus('ready')
        setTranscript([
          {
            kind: 'system',
            text: 'Python environment ready (numpy, gfit, tqdm, hylite).',
          },
        ])
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [syncLibrariesImpl])

  const execute = useCallback(
    (code, { source = 'console', echo = true } = {}) => {
      const trimmed = code.trim()
      if (!trimmed || !pyodideRef.current) {
        return Promise.resolve(undefined)
      }

      return enqueue(async () => {
        const instance = pyodideRef.current
        if (echo) {
          appendTranscript([
            {
              kind: 'input',
              source,
              text: trimmed,
            },
          ])
        }

        let stdout = ''
        let stderr = ''
        instance.setStdout({ batched: (msg) => { stdout += msg } })
        instance.setStderr({ batched: (msg) => { stderr += msg } })

        try {
          const result = await instance.runPythonAsync(trimmed)
          const next = []

          if (stdout) next.push({ kind: 'output', source, text: stdout })
          if (stderr) next.push({ kind: 'error', source, text: stderr })

          const formatted = formatResult(result)
          if (formatted) next.push({ kind: 'result', source, text: formatted })

          if (next.length === 0 && echo) {
            next.push({ kind: 'system', source, text: '(no output)' })
          }

          if (next.length > 0) appendTranscript(next)
          return result
        } catch (err) {
          appendTranscript([
            {
              kind: 'error',
              source,
              text: err instanceof Error ? err.message : String(err),
            },
          ])
          throw err
        }
      })
    },
    [appendTranscript, enqueue],
  )

  const syncLibraries = useCallback(
    (loadedIds, options) => enqueue(() => syncLibrariesImpl(loadedIds, options)),
    [enqueue, syncLibrariesImpl],
  )

  const loadLibrary = useCallback(
    (catalogEntry, { echo = true } = {}) =>
      enqueue(async () => {
        const instance = pyodideRef.current
        if (!instance) return undefined

        if (echo) {
          appendTranscript([
            {
              kind: 'system',
              source: 'library',
              text: `Loading library ${catalogEntry.name}…`,
            },
          ])
        }
        const result = await addPythonLibrary(instance, catalogEntry)
        await applyPythonUiLibraries(instance)
        if (echo) {
          appendTranscript([
            {
              kind: 'output',
              source: 'library',
              text: `Loaded ${catalogEntry.name} (${result.n_hy_fourier} HyFourier entries in archive).`,
            },
          ])
        }
        return result
      }),
    [appendTranscript, enqueue],
  )

  const unloadLibrary = useCallback(
    (libId, { echo = true } = {}) =>
      enqueue(async () => {
        const instance = pyodideRef.current
        if (!instance) return undefined

        const result = await removePythonLibrary(instance, libId)
        await applyPythonUiLibraries(instance)
        if (echo) {
          appendTranscript([
            {
              kind: 'output',
              source: 'library',
              text: `Removed library ${libId} (${result.n_hy_fourier} HyFourier entries remain).`,
            },
          ])
        }
        return result
      }),
    [appendTranscript, enqueue],
  )

  const value = useMemo(
    () => ({
      pyodide,
      status,
      loadingMessage,
      error,
      transcript,
      execute,
      runQueued: enqueue,
      syncLibraries,
      loadLibrary,
      unloadLibrary,
    }),
    [
      pyodide,
      status,
      loadingMessage,
      error,
      transcript,
      execute,
      enqueue,
      syncLibraries,
      loadLibrary,
      unloadLibrary,
    ],
  )

  return <PyodideContext.Provider value={value}>{children}</PyodideContext.Provider>
}
