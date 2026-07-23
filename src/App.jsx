import { useEffect, useState } from 'react'
import { parseHashState, clearHash } from './app/shareState.js'
import { AppStateProvider } from './context/AppStateProvider.jsx'
import ISpec from './components/ISpec.jsx'

function loadInitialAppState() {
  const fromHash = parseHashState()
  if (fromHash) {
    clearHash()
    return { state: fromHash, loadedFromHash: true }
  }
  return { state: null, loadedFromHash: false }
}

const INITIAL_LOAD = loadInitialAppState()

export default function App() {
  const [shareNotice, setShareNotice] = useState('')

  // analytics
  useEffect(() => {
    const url = new URL("https://app-analytics.my-app-logs.workers.dev");
    url.searchParams.set("app", "ispec");
    url.searchParams.set("page", window.location.origin);
  
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
        shareNotice={shareNotice}
        onShareNotice={setShareNotice}
      />
    </AppStateProvider>
  )
}
