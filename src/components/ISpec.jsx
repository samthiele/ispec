import { useEffect, useRef, useState } from 'react'
import { normalizeAppState, normalizeLoadedLibraries, loadedLibrariesEqual } from '../app/appState.js'
import { getPythonLoadedLibraryIds } from '../app/librarySync.js'
import { copyShareUrl } from '../app/shareState.js'
import { useCoreAppState } from '../context/useAppState.js'
import { PyodideProvider } from '../context/PyodideProvider.jsx'
import { LlmChatProvider } from '../context/LlmChatProvider.jsx'
import { usePyodide } from '../context/usePyodide.js'
import BiLayout from './BiLayout.jsx'
import LoadingScreen from './LoadingScreen.jsx'
import QuadLayout from './QuadLayout.jsx'
import TriLayout from './TriLayout.jsx'
import './ISpec.css'

const LAYOUTS = {
  tri: TriLayout,
  bi: BiLayout,
  quad: QuadLayout,
}

function ISpecShell({ shareNotice, onShareNotice }) {
  const { appState, setViewMode, setLibraries, hydratedFromHash } = useCoreAppState()
  const { status, loadingMessage, error, pyodide, runQueued } = usePyodide()
  const [viewModeLocked, setViewModeLocked] = useState(hydratedFromHash)
  const Layout = LAYOUTS[appState.viewMode] ?? TriLayout

  useEffect(() => {
    if (viewModeLocked) return undefined

    function handleResize() {
      const next = window.innerHeight > window.innerWidth ? 'bi' : 'tri'
      setViewMode(next)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [viewModeLocked, setViewMode])

  async function handleShare() {
    try {
      let libraries = normalizeLoadedLibraries(appState.libraries, { fallbackToDefault: false })
      if (pyodide) {
        const fromPython = normalizeLoadedLibraries(
          await runQueued(() => getPythonLoadedLibraryIds(pyodide)),
          { fallbackToDefault: false },
        )
        if (fromPython.length > 0) {
          libraries = fromPython
        }
      }
      if (libraries.length === 0) {
        onShareNotice('No libraries loaded to share')
        return
      }
      if (!loadedLibrariesEqual(libraries, appState.libraries)) {
        setLibraries(libraries)
      }
      await copyShareUrl({ ...appState, libraries })
      onShareNotice('Share link copied to clipboard')
    } catch {
      onShareNotice('Could not copy share link')
    }
  }

  function handleViewModeChange(event) {
    setViewModeLocked(true)
    setViewMode(event.target.value)
  }

  if (status === 'loading') {
    return <LoadingScreen message={loadingMessage} />
  }

  if (status === 'error') {
    return <LoadingScreen message={loadingMessage} error={error} />
  }

  return (
    <div className="ispec">
      <header className="ispec-header">
        <h1 className="ispec-title">iSpec</h1>
        <div className="ispec-header-right">
          <label className="ispec-view-mode">
            <span className="ispec-view-mode-label">View Mode</span>
            <select
              className="ispec-view-mode-select"
              value={appState.viewMode}
              onChange={handleViewModeChange}
            >
              <option value="tri">Tri</option>
              <option value="bi">Bi</option>
              <option value="quad">Quad</option>
            </select>
          </label>
          {shareNotice ? (
            <span className="ispec-share-notice" role="status">
              {shareNotice}
            </span>
          ) : null}
          <button type="button" className="ispec-share" onClick={handleShare}>
            Share
          </button>
        </div>
      </header>
      <main className="ispec-main">
        <Layout />
      </main>
      <footer className="ispec-footer">
        <div className="ispec-footer-spacer" aria-hidden="true" />
        <a
          className="ispec-footer-link ispec-footer-center"
          href="https://www.iexplo.space/"
          target="_blank"
          rel="noopener noreferrer"
        >
          www.iexplo.space
        </a>
        <p className="ispec-footer-right">
          <a
            className="ispec-footer-link"
            href="https://www.samthiele.science/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Sam Thiele 2026
          </a>
        </p>
      </footer>
    </div>
  )
}

export default function ISpec({ bootstrapAppState, ...props }) {
  const pyodideBootstrapRef = useRef(
    normalizeAppState(bootstrapAppState ?? undefined),
  )

  return (
    <PyodideProvider initialAppState={pyodideBootstrapRef.current}>
      <LlmChatProvider>
        <ISpecShell {...props} />
      </LlmChatProvider>
    </PyodideProvider>
  )
}
