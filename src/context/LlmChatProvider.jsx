import { useMemo, useState } from 'react'
import { LlmChatContext } from './LlmChatContext.js'

export function LlmChatProvider({ children }) {
  const [messages, setMessages] = useState([])

  const value = useMemo(
    () => ({
      messages,
      setMessages,
    }),
    [messages],
  )

  return <LlmChatContext.Provider value={value}>{children}</LlmChatContext.Provider>
}
