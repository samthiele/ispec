import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clearGeminiApiKey, getGeminiApiKey, setGeminiApiKey } from '../../app/geminiApiKey.js'
import { createGeminiChat, sendGeminiMessage } from '../../app/geminiClient.js'
import { GEMINI_MODELS, geminiModelLabel, getGeminiModel, setGeminiModel } from '../../app/geminiModels.js'
import { formatSpectralFeaturesSummary, NO_SELECTION_SUMMARY } from '../../app/llmFeatures.js'
import {
  exportSelectionSpectralFeatures,
  loadSkillDocument,
} from '../../app/llmSync.js'
import { buildLookupMap } from '../../app/selectionMeta.js'
import { useAppState } from '../../context/useAppState.js'
import { usePyodide } from '../../context/usePyodide.js'
import './LLM.css'

function buildSystemInstruction(skillText, spectralSummary) {
  return `${skillText.trim()}

---

## Current selection — spectral feature summary

${spectralSummary}

Interpret user questions in light of this summary. Cite wavelengths (nm) from the summary when reasoning about minerals or mixtures.`
}

function toGeminiHistory(messages) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.text }],
    }))
}

function ApiKeyModal({ draft, onDraftChange, onSave, onClose }) {
  return (
    <div className="llm-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="llm-modal"
        role="dialog"
        aria-labelledby="llm-api-key-title"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="llm-api-key-title" className="llm-modal-title">
          Gemini API key
        </h2>
        <p className="llm-modal-copy">
          iSpec uses your own Google Gemini API key (BYOK). The key is stored locally in this
          browser only and is sent directly to Google when you chat.
        </p>
        <p className="llm-modal-copy">
          Create a key at{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
            Google AI Studio
          </a>
          .
        </p>
        <label className="llm-modal-label" htmlFor="llm-api-key-input">
          API key
        </label>
        <input
          id="llm-api-key-input"
          className="llm-modal-input"
          type="password"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="AIza…"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="llm-modal-actions">
          <button type="button" className="llm-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="llm-button llm-button--primary"
            onClick={onSave}
            disabled={!draft.trim()}
          >
            Save key
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LLM() {
  const { appState } = useAppState()
  const { status, pyodide, runQueued } = usePyodide()
  const [apiKey, setApiKeyState] = useState(() => getGeminiApiKey())
  const [model, setModelState] = useState(() => getGeminiModel())
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [skillText, setSkillText] = useState('')
  const [skillError, setSkillError] = useState(null)
  const [spectralSummary, setSpectralSummary] = useState('')
  const [featureError, setFeatureError] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [chatError, setChatError] = useState(null)
  const chatRef = useRef(null)
  const transcriptRef = useRef(null)
  const messagesRef = useRef(messages)
  const selectionMeta = appState.selectionMeta

  messagesRef.current = messages

  const lookupMap = useMemo(
    () => buildLookupMap(appState.selection, selectionMeta),
    [appState.selection, selectionMeta],
  )

  const selectionDep = useMemo(
    () => JSON.stringify({ selection: appState.selection, lookupMap }),
    [appState.selection, lookupMap],
  )

  useEffect(() => {
    let cancelled = false
    loadSkillDocument()
      .then((text) => {
        if (!cancelled) {
          setSkillText(text)
          setSkillError(null)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSkillError(error instanceof Error ? error.message : String(error))
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (status !== 'ready' || !pyodide) return undefined

    let cancelled = false
    runQueued(async () => {
      if (!appState.selection.length) {
        if (!cancelled) {
          setSpectralSummary(NO_SELECTION_SUMMARY)
          setFeatureError(null)
          console.info('[iSpec LLM] spectral features — no selection')
        }
        return
      }

      try {
        const exported = await exportSelectionSpectralFeatures(
          pyodide,
          appState.selection,
          lookupMap,
        )
        const summary = formatSpectralFeaturesSummary(exported)
        console.info('[iSpec LLM] spectral features export', exported)
        console.info('[iSpec LLM] spectral features summary\n', summary)
        if (cancelled) return
        setSpectralSummary(summary)
        setFeatureError(null)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[iSpec LLM] spectral feature export failed', error)
        if (!cancelled) {
          setFeatureError(message)
        }
      }
    })

    return () => {
      cancelled = true
    }
  }, [status, pyodide, runQueued, selectionDep, appState.selection, lookupMap])

  useEffect(() => {
    if (!apiKey || !skillText) {
      chatRef.current = null
      return
    }
    chatRef.current = createGeminiChat({
      apiKey,
      model,
      systemInstruction: buildSystemInstruction(skillText, spectralSummary),
      history: toGeminiHistory(messagesRef.current),
    })
  }, [apiKey, model, skillText, spectralSummary])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight })
  }, [messages, busy])

  const saveApiKey = useCallback(() => {
    const trimmed = keyDraft.trim()
    if (!trimmed) return
    setGeminiApiKey(trimmed)
    setApiKeyState(trimmed)
    setShowKeyModal(false)
    setKeyDraft('')
    setChatError(null)
  }, [keyDraft])

  const openKeyModal = useCallback(() => {
    setKeyDraft(apiKey)
    setShowKeyModal(true)
  }, [apiKey])

  const clearKey = useCallback(() => {
    clearGeminiApiKey()
    setApiKeyState('')
    setKeyDraft('')
    chatRef.current = null
  }, [])

  const handleModelChange = useCallback((event) => {
    const nextModel = event.target.value
    setGeminiModel(nextModel)
    setModelState(nextModel)
    setChatError(null)
  }, [])

  const startNewChat = useCallback(() => {
    setMessages([])
    setChatError(null)
  }, [])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || busy) return
    if (!apiKey) {
      setKeyDraft('')
      setShowKeyModal(true)
      return
    }
    if (!skillText) {
      setChatError(skillError ?? 'Skill document still loading.')
      return
    }
    if (!chatRef.current) {
      chatRef.current = createGeminiChat({
        apiKey,
        model,
        systemInstruction: buildSystemInstruction(skillText, spectralSummary),
        history: toGeminiHistory(messagesRef.current),
      })
    }

    setBusy(true)
    setChatError(null)
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', kind: 'chat', text }])

    try {
      const reply = await sendGeminiMessage(chatRef.current, text)
      setMessages((prev) => [...prev, { role: 'assistant', kind: 'chat', text: reply }])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setChatError(message)
      setMessages((prev) => prev.slice(0, -1))
      setInput(text)
    } finally {
      setBusy(false)
    }
  }, [apiKey, busy, input, model, skillError, skillText, spectralSummary])

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  const isDisabled = status !== 'ready' || busy

  return (
    <div className="widget widget-llm">
      <div className="llm-toolbar">
        <div className="llm-toolbar-left">
          <span className="llm-toolbar-label">
            {appState.selection.length
              ? `${appState.selection.length} selected`
              : 'No selection'}
          </span>
        </div>
        <div className="llm-toolbar-actions">
          <label className="llm-model-picker">
            <span className="llm-model-picker-label">Model</span>
            <select
              className="llm-model-select"
              value={model}
              onChange={handleModelChange}
              disabled={busy}
              title={GEMINI_MODELS.find(({ id }) => id === model)?.hint}
            >
              {GEMINI_MODELS.map(({ id, label, hint }) => (
                <option key={id} value={id} title={hint}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="llm-button llm-button--small" onClick={startNewChat}>
            New chat
          </button>
          <button type="button" className="llm-button llm-button--small" onClick={openKeyModal}>
            API key
          </button>
          {apiKey ? (
            <button type="button" className="llm-button llm-button--small" onClick={clearKey}>
              Clear key
            </button>
          ) : null}
        </div>
      </div>

      {skillError ? <div className="llm-banner llm-banner--error">Skill load failed: {skillError}</div> : null}
      {featureError ? (
        <div className="llm-banner llm-banner--error">Feature export failed: {featureError}</div>
      ) : null}
      {chatError ? <div className="llm-banner llm-banner--error">{chatError}</div> : null}

      <div className="llm-transcript" ref={transcriptRef}>
        {status === 'loading' ? (
          <div className="llm-line llm-line--system">Initialising Python…</div>
        ) : null}
        {messages.length === 0 && status === 'ready' ? (
          <div className="llm-line llm-line--system">
            Ask general hyperspectral questions, or select spectra in Query for sample-specific
            interpretation (e.g. &ldquo;Which minerals are likely in my selection?&rdquo;). A Gemini
            API key is requested when you send your first message.
          </div>
        ) : null}
        {messages.map((message, index) => (
          <div key={index} className={`llm-line llm-line--${message.role}`}>
            <div className="llm-role-label">
              {message.role === 'user' ? 'You' : geminiModelLabel(model)}
            </div>
            <pre>{message.text}</pre>
          </div>
        ))}
        {busy ? <div className="llm-line llm-line--system">Thinking…</div> : null}
      </div>

      <div className="llm-input-row">
        <textarea
          className="llm-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isDisabled
              ? 'Waiting for Python…'
              : 'Ask about spectra or general hyperspectral topics (Enter to send, Shift+Enter for newline)'
          }
          rows={2}
          disabled={isDisabled}
          spellCheck={true}
        />
        <button
          type="button"
          className="llm-button llm-button--primary"
          onClick={sendMessage}
          disabled={isDisabled || !input.trim()}
        >
          Send
        </button>
      </div>

      {showKeyModal ? (
        <ApiKeyModal
          draft={keyDraft}
          onDraftChange={setKeyDraft}
          onSave={saveApiKey}
          onClose={() => setShowKeyModal(false)}
        />
      ) : null}
    </div>
  )
}
