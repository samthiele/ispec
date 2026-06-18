import { useCallback, useEffect, useMemo, useRef } from 'react'

export const LONG_PRESS_MS = 500
export const LONG_PRESS_MOVE_THRESHOLD_PX = 10

function isInteractiveTarget(target) {
  return Boolean(target?.closest?.('input, button, select, textarea, label'))
}

export function useLongPress(onLongPress, {
  delay = LONG_PRESS_MS,
  moveThreshold = LONG_PRESS_MOVE_THRESHOLD_PX,
  disabled = false,
  touchOnly = true,
} = {}) {
  const callbackRef = useRef(onLongPress)
  callbackRef.current = onLongPress

  const timerRef = useRef(null)
  const originRef = useRef({ x: 0, y: 0 })
  const firedRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => () => clearTimer(), [clearTimer])

  return useMemo(
    () => ({
      onPointerDown: (event) => {
        if (disabled) return
        if (touchOnly && event.pointerType !== 'touch') return
        if (isInteractiveTarget(event.target)) return

        firedRef.current = false
        originRef.current = { x: event.clientX, y: event.clientY }
        clearTimer()
        timerRef.current = window.setTimeout(() => {
          firedRef.current = true
          callbackRef.current(event)
        }, delay)
      },
      onPointerMove: (event) => {
        if (!timerRef.current) return
        const dx = event.clientX - originRef.current.x
        const dy = event.clientY - originRef.current.y
        if (Math.hypot(dx, dy) > moveThreshold) {
          clearTimer()
        }
      },
      onPointerUp: () => {
        clearTimer()
      },
      onPointerCancel: () => {
        clearTimer()
      },
      onContextMenu: (event) => {
        if (firedRef.current) {
          event.preventDefault()
        }
      },
    }),
    [clearTimer, delay, disabled, moveThreshold, touchOnly],
  )
}
