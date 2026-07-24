import { useEffect, useId, useRef, useState } from 'react'
import { findPlotSvg } from '../app/plotDownload.js'
import { downloadPlotWithLegend } from '../app/plotLegend.js'
import './PlotSaveMenu.css'

export default function PlotSaveMenu({
  containerRef,
  basename,
  disabled = false,
  className = '',
  legendSections = null,
}) {
  const menuId = useId()
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

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

  async function handleDownload(format) {
    const svg = findPlotSvg(containerRef?.current)
    if (!svg || busy) return

    setBusy(true)
    try {
      await downloadPlotWithLegend(svg, basename, format, legendSections)
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const isDisabled = disabled || busy

  return (
    <div
      ref={rootRef}
      className={`plot-save-menu${className ? ` ${className}` : ''}${open ? ' plot-save-menu--open' : ''}`}
    >
      <button
        type="button"
        className="plot-save-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={isDisabled}
        onClick={() => setOpen((value) => !value)}
      >
        Save
      </button>
      {open ? (
        <div id={menuId} className="plot-save-menu-dropdown" role="menu" aria-label="Save plot as">
          <button
            type="button"
            className="plot-save-menu-option"
            role="menuitem"
            disabled={busy}
            onClick={() => void handleDownload('png')}
          >
            PNG
          </button>
          <button
            type="button"
            className="plot-save-menu-option"
            role="menuitem"
            disabled={busy}
            onClick={() => void handleDownload('svg')}
          >
            SVG
          </button>
        </div>
      ) : null}
    </div>
  )
}
