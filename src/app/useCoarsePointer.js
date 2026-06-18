import { useEffect, useState } from 'react'

export function useCoarsePointer() {
  const [coarse, setCoarse] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(pointer: coarse)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const media = window.matchMedia('(pointer: coarse)')
    const update = () => setCoarse(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return coarse
}
