import { useContext } from 'react'
import { PyodideContext } from './PyodideContext.js'

export function usePyodide() {
  const context = useContext(PyodideContext)
  if (!context) {
    throw new Error('usePyodide must be used within PyodideProvider')
  }
  return context
}
