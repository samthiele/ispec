import { useContext } from 'react'
import { LlmChatContext } from './LlmChatContext.js'

export function useLlmChat() {
  const context = useContext(LlmChatContext)
  if (!context) {
    throw new Error('useLlmChat must be used within LlmChatProvider')
  }
  return context
}
