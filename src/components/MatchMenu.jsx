import { useEffect, useId, useRef, useState } from 'react'
import './MatchMenu.css'

const MATCH_OPTIONS = [
  {
    id: 'sam',
    label: 'SAM',
    method: 'SAM',
    tooltip:
      'Spectral Angle Mapper. Ranks library spectra by the angle between reflectance vectors and the most recently selected spectrum over the Spectra plot x-range. Smaller angle means a closer match.',
  },
  {
    id: 'fit',
    label: 'FIT',
    method: 'FIT',
    tooltip:
      'Continuum-removed shape fit (Tetracorder-style). Removes linear continua, scales each library spectrum to the most recently selected spectrum, then scores by correlation of band shape. Sensitive to absorption feature shape.',
  },
  {
    id: 'corr',
    label: 'CORR',
    method: 'CORR',
    tooltip:
      'Pearson correlation of reflectance over the Spectra plot x-range (no continuum removal), compared to the most recently selected spectrum. Higher score means a more linearly similar spectrum.',
  },
  {
    id: 'sid',
    label: 'SID',
    method: 'SID',
    tooltip:
      'Spectral Information Divergence. Compares normalized reflectance as a probability distribution; lower divergence from the most recently selected spectrum yields a higher similarity score.',
  },
]

export default function MatchMenu({
  disabled = false,
  busy = false,
  onMatch,
  className = '',
}) {
  const menuId = useId()
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  async function handleSelect(option) {
    if (disabled || busy) return
    setOpen(false)
    await onMatch(option.method ?? option.id)
  }

  const isDisabled = disabled || busy

  return (
    <div
      ref={rootRef}
      className={`match-menu${className ? ` ${className}` : ''}${open ? ' match-menu--open' : ''}`}
    >
      <button
        type="button"
        className="match-menu-trigger query-selected-action"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={isDisabled}
        onClick={() => setOpen((value) => !value)}
      >
        Match
      </button>
      {open ? (
        <div id={menuId} className="match-menu-dropdown" role="menu" aria-label="Match selected spectrum">
          {MATCH_OPTIONS.map((option) => (
            <span key={option.id} className="match-menu-option-wrap" data-tooltip={option.tooltip}>
              <button
                type="button"
                className="match-menu-option"
                role="menuitem"
                disabled={busy}
                onClick={() => void handleSelect(option)}
              >
                {option.label}
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
