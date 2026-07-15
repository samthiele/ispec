import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const SHOW_DELAY_MS = 350
const GAP_PX = 6
const VIEWPORT_PAD = 8

function tooltipTarget(node) {
  return node?.closest?.('[data-tooltip]') ?? null
}

function readTooltip(el) {
  const text = el.getAttribute('data-tooltip')?.trim()
  return text || null
}

export default function TooltipLayer() {
  const activeElRef = useRef(null)
  const showTimerRef = useRef(null)
  const layerRef = useRef(null)
  const [tip, setTip] = useState(null)

  useEffect(() => {
    function clearShowTimer() {
      if (showTimerRef.current != null) {
        window.clearTimeout(showTimerRef.current)
        showTimerRef.current = null
      }
    }

    function hide() {
      clearShowTimer()
      activeElRef.current = null
      setTip(null)
    }

    function show(el, { immediate = false } = {}) {
      const text = readTooltip(el)
      if (!text) return

      clearShowTimer()
      activeElRef.current = el

      const reveal = () => {
        if (activeElRef.current !== el) return
        const rect = el.getBoundingClientRect()
        setTip({
          text,
          anchorLeft: rect.left,
          anchorTop: rect.top,
          anchorBottom: rect.bottom,
          anchorWidth: rect.width,
        })
      }

      if (immediate) {
        reveal()
      } else {
        showTimerRef.current = window.setTimeout(reveal, SHOW_DELAY_MS)
      }
    }

    function onMouseOver(event) {
      const from = tooltipTarget(event.relatedTarget)
      const to = tooltipTarget(event.target)
      if (!to || to === from) return
      show(to)
    }

    function onMouseOut(event) {
      const from = tooltipTarget(event.target)
      if (!from) return
      const to = tooltipTarget(event.relatedTarget)
      if (from === to) return
      if (event.relatedTarget && from.contains(event.relatedTarget)) return
      hide()
    }

    function onFocusIn(event) {
      const to = tooltipTarget(event.target)
      if (to) show(to, { immediate: true })
    }

    function onFocusOut(event) {
      const from = tooltipTarget(event.target)
      if (!from) return
      if (event.relatedTarget && from.contains(event.relatedTarget)) return
      if (from.matches(':hover')) return
      hide()
    }

    function reposition() {
      const el = activeElRef.current
      if (!el) return
      const text = readTooltip(el)
      if (!text) return
      const rect = el.getBoundingClientRect()
      setTip({
        text,
        anchorLeft: rect.left,
        anchorTop: rect.top,
        anchorBottom: rect.bottom,
        anchorWidth: rect.width,
      })
    }

    document.addEventListener('mouseover', onMouseOver)
    document.addEventListener('mouseout', onMouseOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)

    return () => {
      clearShowTimer()
      document.removeEventListener('mouseover', onMouseOver)
      document.removeEventListener('mouseout', onMouseOut)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [])

  useLayoutEffect(() => {
    if (!tip || !layerRef.current) return

    const layer = layerRef.current
    const layerRect = layer.getBoundingClientRect()
    let left = tip.anchorLeft
    let top = tip.anchorBottom + GAP_PX

    if (left + layerRect.width > window.innerWidth - VIEWPORT_PAD) {
      left = Math.max(VIEWPORT_PAD, window.innerWidth - layerRect.width - VIEWPORT_PAD)
    }
    if (left < VIEWPORT_PAD) left = VIEWPORT_PAD

    if (top + layerRect.height > window.innerHeight - VIEWPORT_PAD) {
      top = tip.anchorTop - layerRect.height - GAP_PX
    }
    if (top < VIEWPORT_PAD) top = VIEWPORT_PAD

    layer.style.left = `${left}px`
    layer.style.top = `${top}px`
  }, [tip])

  if (!tip) return null

  return createPortal(
    <div ref={layerRef} className="hover-tooltip-layer" role="tooltip">
      {tip.text}
    </div>,
    document.body,
  )
}
