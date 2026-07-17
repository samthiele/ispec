import { useEffect, useId, useRef, useState } from 'react'
import { SATELLITE_SENSORS } from '../app/satelliteResample.js'
import './SensorResampleMenu.css'

export default function SensorResampleMenu({
  disabled = false,
  busy = false,
  onResample,
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

  async function handleSelect(sensor) {
    if (disabled || busy) return
    setOpen(false)
    await onResample(sensor)
  }

  const isDisabled = disabled || busy

  return (
    <div
      ref={rootRef}
      className={`sensor-resample-menu${className ? ` ${className}` : ''}${open ? ' sensor-resample-menu--open' : ''}`}
    >
      <button
        type="button"
        className="sensor-resample-menu-trigger query-selected-action"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={isDisabled}
        onClick={() => setOpen((value) => !value)}
      >
        Resample
      </button>
      {open ? (
        <div id={menuId} className="sensor-resample-menu-dropdown" role="menu" aria-label="Resample to sensor">
          {SATELLITE_SENSORS.map((sensor) => (
            <button
              key={sensor}
              type="button"
              className="sensor-resample-menu-option"
              role="menuitem"
              disabled={busy}
              onClick={() => void handleSelect(sensor)}
            >
              {sensor}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
