import { GoogleGenAI } from '@google/genai'
import { DEFAULT_GEMINI_MODEL } from './geminiModels.js'
import { buildFunctionResponseParts, ISPEC_LLM_TOOL_DECLARATIONS } from './llmTools.js'

const DEFAULT_MAX_TOOL_TURNS = 6

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
      tools: [{ functionDeclarations: ISPEC_LLM_TOOL_DECLARATIONS }],
    },
    history,
  })
}

export async function sendGeminiMessage(chat, message) {
  return sendGeminiMessageWithTools(chat, message)
}

export async function sendGeminiMessageWithTools(
  chat,
  message,
  { executeTool, maxTurns = DEFAULT_MAX_TOOL_TURNS } = {},
) {
  let response = await chat.sendMessage({ message })

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const calls = response.functionCalls
    if (!calls?.length || !executeTool) {
      break
    }

    const results = []
    for (const call of calls) {
      const result = await executeTool(call.name, call.args ?? {})
      results.push(result)
    }

    response = await chat.sendMessage({
      message: {
        role: 'user',
        parts: buildFunctionResponseParts(calls, results),
      },
    })
  }

  return response.text ?? ''
}
