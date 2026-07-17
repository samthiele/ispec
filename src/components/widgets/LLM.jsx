import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toShareableState } from '../../app/appState.js'
import { clearGeminiApiKey, getGeminiApiKey, setGeminiApiKey } from '../../app/geminiApiKey.js'
import { createGeminiChat, sendGeminiMessage } from '../../app/geminiClient.js'
import {
  geminiModelLabel,
  getGeminiModel,
  loadGeminiModelsCatalog,
  resolveGeminiModel,
  setGeminiModel,
} from '../../app/geminiModels.js'
import { buildLlmSpectralContext } from '../../app/llmFeatures.js'
import {
  exportSelectionSpectralFeatures,
  loadSkillDocument,
} from '../../app/llmSync.js'
import {
  extractStateBlocks,
  formatStateProposalPreview,
  mergeStateProposal,
} from '../../app/llmStateBlocks.js'
import { buildLookupMap, selectionGroupDep } from '../../app/selectionMeta.js'
import { buildShareUrl } from '../../app/shareState.js'
import { useCoreAppState } from '../../context/useAppState.js'
import { useLlmChat } from '../../context/useLlmChat.js'
import { usePyodide } from '../../context/usePyodide.js'
import LlmMarkdown from './LlmMarkdown.jsx'
import './LLM.css'

function buildSystemInstruction(skillText, spectralSummary, currentStateJson) {
  return `${skillText.trim()}

---

## Current app state (shareable JSON)

${currentStateJson}

When proposing configuration changes, emit a \`\`\`ispec-state fenced JSON block with only the fields to change (or a full object for complete reconfiguration). Do not produce compressed share URLs — the app builds those from JSON.

---

## Query, results & selection context

${spectralSummary}

Interpret user questions in light of this context. Cite wavelengths (nm) from selected-spectra features when reasoning about minerals or mixtures. Use canonical names from search results when proposing selection updates.`
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

function StateProposalCard({
  proposal,
  mergedState,
  disabled,
  applied,
  applying,
  applyError,
  onApply,
  onCopyLink,
}) {
  const previewLines = formatStateProposalPreview(mergedState)

  return (
    <div className={`llm-state-proposal${applied ? ' llm-state-proposal--applied' : ''}`}>
      <div className="llm-state-proposal-title">Suggested app configuration</div>
      <ul className="llm-state-proposal-list">
        {previewLines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {applyError ? <div className="llm-state-proposal-error">{applyError}</div> : null}
      <div className="llm-state-proposal-actions">
        <button
          type="button"
          className="llm-button llm-button--primary llm-button--small"
          onClick={onApply}
          disabled={disabled || applied || applying}
        >
          {applied ? 'Applied' : applying ? 'Applying…' : 'Apply'}
        </button>
        <button
          type="button"
          className="llm-button llm-button--small"
          onClick={onCopyLink}
          disabled={disabled}
        >
          Copy share link
        </button>
      </div>
      {proposal.source === 'url' ? (
        <div className="llm-state-proposal-source">From share link</div>
      ) : null}
    </div>
  )
}

export default function LLM() {
  const { appState, searchResults } = useCoreAppState()
  const { messages, setMessages } = useLlmChat()
  const { status, pyodide, runQueued, applySharedState } = usePyodide()
  const [apiKey, setApiKeyState] = useState(() => getGeminiApiKey())
  const [model, setModelState] = useState(() => getGeminiModel())
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [skillText, setSkillText] = useState('')
  const [skillError, setSkillError] = useState(null)
  const [modelsCatalog, setModelsCatalog] = useState(null)
  const [modelsError, setModelsError] = useState(null)
  const [spectralSummary, setSpectralSummary] = useState('')
  const [featureError, setFeatureError] = useState(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [chatError, setChatError] = useState(null)
  const [applyErrors, setApplyErrors] = useState({})
  const [applyingKey, setApplyingKey] = useState(null)
  const chatRef = useRef(null)
  const transcriptRef = useRef(null)
  const messagesRef = useRef(messages)
  const selectionMeta = appState.selectionMeta ?? {}
  const groupDep = selectionGroupDep(appState.selection, selectionMeta)

  messagesRef.current = messages

  const currentStateJson = useMemo(
    () => JSON.stringify(toShareableState(appState), null, 2),
    [appState],
  )

  const lookupMap = useMemo(
    () => buildLookupMap(appState.selection, selectionMeta),
    [appState.selection, groupDep],
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
    let cancelled = false
    loadGeminiModelsCatalog()
      .then((catalog) => {
        if (cancelled) return
        setModelsCatalog(catalog)
        setModelsError(null)
        const stored = typeof window !== 'undefined' ? localStorage.getItem('ispec.geminiModel') : null
        const resolved = resolveGeminiModel(stored, catalog)
        setModelState(resolved)
        if (stored !== resolved) {
          setGeminiModel(resolved, catalog)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setModelsError(error instanceof Error ? error.message : String(error))
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const searchContextDep = useMemo(
    () =>
      JSON.stringify({
        query: appState.query,
        slice: appState.slice,
        pageSize: appState.pageSize,
        total: searchResults?.total ?? 0,
        names: searchResults?.names ?? [],
        scores: searchResults?.scores ?? [],
      }),
    [appState.pageSize, appState.query, appState.slice, searchResults],
  )

  useEffect(() => {
    if (status !== 'ready' || !pyodide) return undefined

    let cancelled = false
    runQueued(async () => {
      try {
        let selectionExport = { spectra: [] }
        if (appState.selection.length) {
          selectionExport = await exportSelectionSpectralFeatures(
            pyodide,
            appState.selection,
            lookupMap,
          )
        }

        const summary = buildLlmSpectralContext({
          selectionExport,
          query: appState.query,
          searchResults,
          slice: appState.slice,
          pageSize: appState.pageSize,
          selection: appState.selection,
        })
        if (cancelled) return
        setSpectralSummary(summary)
        setFeatureError(null)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!cancelled) {
          setFeatureError(message)
        }
      }
    })

    return () => {
      cancelled = true
    }
  }, [status, pyodide, runQueued, selectionDep, searchContextDep, lookupMap])

  useEffect(() => {
    if (!apiKey || !skillText) {
      chatRef.current = null
      return
    }
    chatRef.current = createGeminiChat({
      apiKey,
      model,
      systemInstruction: buildSystemInstruction(skillText, spectralSummary, currentStateJson),
      history: toGeminiHistory(messagesRef.current),
    })
  }, [apiKey, model, skillText, spectralSummary, currentStateJson])

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

  const handleModelChange = useCallback(
    (event) => {
      const nextModel = event.target.value
      if (modelsCatalog) {
        setGeminiModel(nextModel, modelsCatalog)
      }
      setModelState(nextModel)
      setChatError(null)
    },
    [modelsCatalog],
  )

  const startNewChat = useCallback(() => {
    setMessages([])
    setApplyErrors({})
    setChatError(null)
  }, [])

  const handleApplyProposal = useCallback(
    async (messageIndex, proposalIndex, proposal) => {
      const errorKey = `${messageIndex}:${proposalIndex}`
      setApplyErrors((prev) => {
        const next = { ...prev }
        delete next[errorKey]
        return next
      })
      setApplyingKey(errorKey)

      try {
        await applySharedState(proposal.parsed)
        setMessages((prev) =>
          prev.map((message, index) =>
            index === messageIndex
              ? {
                  ...message,
                  appliedProposals: {
                    ...(message.appliedProposals ?? {}),
                    [proposalIndex]: true,
                  },
                }
              : message,
          ),
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setApplyErrors((prev) => ({ ...prev, [errorKey]: message }))
      } finally {
        setApplyingKey(null)
      }
    },
    [applySharedState],
  )

  const handleCopyProposalLink = useCallback(async (proposal) => {
    const merged = mergeStateProposal(appState, proposal.parsed)
    const url = buildShareUrl(merged)
    await navigator.clipboard.writeText(url)
  }, [appState])

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
        systemInstruction: buildSystemInstruction(skillText, spectralSummary, currentStateJson),
        history: toGeminiHistory(messagesRef.current),
      })
    }

    setBusy(true)
    setChatError(null)
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', kind: 'chat', text }])

    try {
      const reply = await sendGeminiMessage(chatRef.current, text)
      const { displayText, blocks } = extractStateBlocks(reply)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          kind: 'chat',
          text: reply,
          displayText,
          stateProposals: blocks,
          appliedProposals: {},
        },
      ])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setChatError(message)
      setMessages((prev) => prev.slice(0, -1))
      setInput(text)
    } finally {
      setBusy(false)
    }
  }, [apiKey, busy, currentStateJson, input, model, skillError, skillText, spectralSummary])

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  const isDisabled = status !== 'ready' || busy
  const availableModels = modelsCatalog?.models ?? []

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
              disabled={busy || availableModels.length === 0}
              title={availableModels.find(({ id }) => id === model)?.hint}
            >
              {availableModels.map(({ id, label, hint }) => (
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

      {modelsError ? <div className="llm-banner llm-banner--error">Models load failed: {modelsError}</div> : null}
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
        {messages.map((message, messageIndex) => (
          <div key={messageIndex} className={`llm-line llm-line--${message.role}`}>
            <div className="llm-role-label">
              {message.role === 'user' ? 'You' : geminiModelLabel(model, modelsCatalog ?? undefined)}
            </div>
            <LlmMarkdown>{message.displayText ?? message.text}</LlmMarkdown>
            {message.stateProposals?.map((proposal, proposalIndex) => {
              const mergedState = mergeStateProposal(appState, proposal.parsed)
              const errorKey = `${messageIndex}:${proposalIndex}`
              return (
                <StateProposalCard
                  key={errorKey}
                  proposal={proposal}
                  mergedState={mergedState}
                  disabled={isDisabled}
                  applied={Boolean(message.appliedProposals?.[proposalIndex])}
                  applying={applyingKey === errorKey}
                  applyError={applyErrors[errorKey]}
                  onApply={() => handleApplyProposal(messageIndex, proposalIndex, proposal)}
                  onCopyLink={() => handleCopyProposalLink(proposal)}
                />
              )
            })}
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
