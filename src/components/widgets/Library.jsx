import { useEffect, useMemo, useState } from 'react'
import { fetchLibraryCatalog, findLibraryById } from '../../app/libraries.js'
import { useAppState } from '../../context/useAppState.js'
import { usePyodide } from '../../context/usePyodide.js'
import './Library.css'

function LibraryList({ title, items, selectedId, emptyLabel, onSelect, onActivate }) {
  return (
    <section className="library-list-panel">
      <h3 className="library-list-title">{title}</h3>
      <ul className="library-list" role="listbox" aria-label={title}>
        {items.length === 0 ? (
          <li className="library-list-empty">{emptyLabel}</li>
        ) : (
          items.map((library) => (
            <li key={library.id}>
              <button
                type="button"
                className={`library-list-item${selectedId === library.id ? ' library-list-item--selected' : ''}`}
                role="option"
                aria-selected={selectedId === library.id}
                onClick={() => onSelect(library.id)}
                onDoubleClick={() => onActivate(library.id)}
              >
                {library.name}
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  )
}

export default function Library() {
  const { appState, setLibraries } = useAppState()
  const { status: pyodideStatus, loadLibrary, unloadLibrary } = usePyodide()
  const [catalog, setCatalog] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [selectionSource, setSelectionSource] = useState(null)

  useEffect(() => {
    let cancelled = false

    fetchLibraryCatalog()
      .then((libraries) => {
        if (cancelled) return
        setCatalog(libraries)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const loadedIds = useMemo(() => new Set(appState.libraries), [appState.libraries])

  const available = useMemo(
    () => catalog.filter((library) => !loadedIds.has(library.id)),
    [catalog, loadedIds],
  )

  const loaded = useMemo(
    () => catalog.filter((library) => loadedIds.has(library.id)),
    [catalog, loadedIds],
  )

  const selectedLibrary = useMemo(() => {
    const pool = selectionSource === 'loaded' ? loaded : available
    return pool.find((library) => library.id === selectedId) ?? null
  }, [available, loaded, selectedId, selectionSource])

  function selectFromList(source, id) {
    setSelectionSource(source)
    setSelectedId(id)
  }

  async function addLibrary(id) {
    if (loadedIds.has(id) || pyodideStatus !== 'ready') return

    const entry = findLibraryById(catalog, id)
    if (!entry) return

    setBusyId(id)
    try {
      await loadLibrary(entry)
      setLibraries([...appState.libraries, id])
      setSelectionSource('loaded')
      setSelectedId(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  async function removeLibrary(id) {
    if (!loadedIds.has(id) || pyodideStatus !== 'ready') return

    setBusyId(id)
    try {
      await unloadLibrary(id)
      setLibraries(appState.libraries.filter((libraryId) => libraryId !== id))
      setSelectionSource('available')
      setSelectedId(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  function handleActivate(source, id) {
    if (busyId) return
    if (source === 'available') {
      addLibrary(id)
    } else {
      removeLibrary(id)
    }
  }

  const canAdd = selectionSource === 'available' && selectedLibrary && !busyId
  const canRemove = selectionSource === 'loaded' && selectedLibrary && !busyId

  if (status === 'loading') {
    return (
      <div className="widget widget-library">
        <p className="library-status">Loading library catalog…</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="widget widget-library">
        <p className="library-status library-status--error">{error}</p>
      </div>
    )
  }

  return (
    <div className="widget widget-library">
      <div className="library-lists">
        <LibraryList
          title="Available"
          items={available}
          selectedId={selectionSource === 'available' ? selectedId : null}
          emptyLabel="No libraries available"
          onSelect={(id) => selectFromList('available', id)}
          onActivate={(id) => handleActivate('available', id)}
        />
        <LibraryList
          title="Loaded"
          items={loaded}
          selectedId={selectionSource === 'loaded' ? selectedId : null}
          emptyLabel="No libraries loaded"
          onSelect={(id) => selectFromList('loaded', id)}
          onActivate={(id) => handleActivate('loaded', id)}
        />
      </div>

      <div className="library-details">
        {selectedLibrary ? (
          <>
            <h3 className="library-details-title">{selectedLibrary.name}</h3>
            <p className="library-details-description">{selectedLibrary.description}</p>
            <p className="library-details-meta">
              <span className="library-details-label">Source</span>
              <a href={selectedLibrary.source} target="_blank" rel="noreferrer">
                {selectedLibrary.source}
              </a>
            </p>
            <p className="library-details-meta">
              <span className="library-details-label">File</span>
              <code>{selectedLibrary.file}</code>
            </p>
            {selectedLibrary.default ? (
              <p className="library-details-meta">
                <span className="library-details-label">Default</span>
                Loaded automatically on startup
              </p>
            ) : null}
            <div className="library-details-actions">
              {canAdd ? (
                <button type="button" className="library-action" onClick={() => addLibrary(selectedLibrary.id)}>
                  Add
                </button>
              ) : null}
              {canRemove ? (
                <button
                  type="button"
                  className="library-action library-action--remove"
                  onClick={() => removeLibrary(selectedLibrary.id)}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <p className="library-details-placeholder">Select a library to view details</p>
        )}
      </div>
    </div>
  )
}
