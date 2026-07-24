import { useEffect, useState } from 'react'
import { parseHashState, clearHash } from './app/shareState.js'
import { parseLibraryGroupFromHash } from './app/libraries.js'
import { AppStateProvider } from './context/AppStateProvider.jsx'
import ISpec from './components/ISpec.jsx'

function loadInitialAppState() {
  const fromHash = parseHashState()
  if (fromHash) {
    clearHash()
    return { state: fromHash, loadedFromHash: true, libraryGroup: null }
  }

  const libraryGroup = parseLibraryGroupFromHash(window.location.hash)
  return { state: null, loadedFromHash: false, libraryGroup }
}

const INITIAL_LOAD = loadInitialAppState()

export default function App() {
  const [shareNotice, setShareNotice] = useState('')

  // analytics
  useEffect(() => {
    // analytics
    const url = new URL("https://app-analytics.my-app-logs.workers.dev");
    url.searchParams.set("app", "ispec2");
    url.searchParams.set("page", `${window.location.origin}${window.location.pathname}`);
    url.searchParams.set("referrer", document.referrer || "");
    fetch(url, { mode: "cors", keepalive: true }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!shareNotice) return undefined
    const timer = window.setTimeout(() => setShareNotice(''), 2500)
    return () => window.clearTimeout(timer)
  }, [shareNotice])

  return (
    <AppStateProvider
      initialState={INITIAL_LOAD.state}
      loadedFromHash={INITIAL_LOAD.loadedFromHash}
    >
      <ISpec
        bootstrapAppState={INITIAL_LOAD.state}
        libraryGroup={INITIAL_LOAD.libraryGroup}
        shareNotice={shareNotice}
        onShareNotice={setShareNotice}
      />
    </AppStateProvider>
  )
}
