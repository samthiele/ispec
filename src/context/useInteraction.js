import { useContext } from 'react'
import { InteractionContext } from './InteractionContext.js'

export function useInteraction() {
  const context = useContext(InteractionContext)
  if (!context) {
    throw new Error('useInteraction must be used within AppStateProvider')
  }
  return context
}
