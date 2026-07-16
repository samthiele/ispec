import { useContext } from 'react'
import { useAppActions } from './useAppActions.js'
import { AppStateContext } from './AppStateContext.js'
import { useInteraction } from './useInteraction.js'

function useAppContext() {
  const app = useContext(AppStateContext)
  if (!app) {
    throw new Error('useAppState must be used within AppStateProvider')
  }
  return app
}

/** App state + actions only (no hover/crosshair). Avoids re-renders on biplot hover. */
export function useCoreAppState() {
  const app = useAppContext()
  const actions = useAppActions()
  return { ...app, ...actions }
}

export function useAppState() {
  const app = useAppContext()
  const actions = useAppActions()
  const interaction = useInteraction()

  return {
    ...app,
    ...actions,
    ...interaction,
  }
}
