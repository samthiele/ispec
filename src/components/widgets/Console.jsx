import { useCallback, useEffect, useRef, useState } from 'react'
import { usePyodide } from '../../context/usePyodide.js'

export default function Console() {
  const { status, error, transcript, execute } = usePyodide()
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const outputRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight })
  }, [transcript])

  const runCode = useCallback(async () => {
    const code = input.trim()
    if (!code || running || status !== 'ready') return

    setRunning(true)
    setInput('')

    try {
      await execute(code, { source: 'console' })
    } finally {
      setRunning(false)
      inputRef.current?.focus()
    }
  }, [input, running, status, execute])

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault()
      runCode()
    }
  }

  const isDisabled = status !== 'ready' || running

  return (
    <div className="widget widget-console">
      <div className="console-output" ref={outputRef}>
        {status === 'loading' && (
          <div className="console-line console-line--system">Initialising Python…</div>
        )}
        {status === 'error' && (
          <div className="console-line console-line--error">
            Failed to load Pyodide: {error}
          </div>
        )}
        {transcript.map((entry, index) => (
          <div key={index} className={`console-line console-line--${entry.kind}`}>
            {entry.kind === 'input' && (
              <span className="console-prompt">
                {entry.source && entry.source !== 'console'
                  ? `[${entry.source}] `
                  : ''}
                &gt;&gt;&gt;{' '}
              </span>
            )}
            <pre>{entry.text}</pre>
          </div>
        ))}
      </div>

      <div className="console-input-row">
        <span className="console-prompt">&gt;&gt;&gt;</span>
        <textarea
          ref={inputRef}
          className="console-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isDisabled ? 'Waiting for Python…' : 'Enter Python code (Shift+Enter to run)'
          }
          rows={2}
          disabled={isDisabled}
          spellCheck={false}
        />
        <button
          type="button"
          className="console-run"
          onClick={runCode}
          disabled={isDisabled || !input.trim()}
        >
          {running ? 'Running…' : 'Run'}
        </button>
      </div>
    </div>
  )
}
