import { GoogleGenAI } from '@google/genai'
import { DEFAULT_GEMINI_MODEL } from './geminiModels.js'

export function createGeminiChat({
  apiKey,
  model = DEFAULT_GEMINI_MODEL,
  systemInstruction,
  history = [],
}) {
  const ai = new GoogleGenAI({ apiKey })

  return ai.chats.create({
    model,
    config: {
      systemInstruction,
    },
    history,
  })
}

export async function sendGeminiMessage(chat, message) {
  const response = await chat.sendMessage({ message })
  return response.text ?? ''
}
