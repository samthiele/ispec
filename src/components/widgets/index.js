import Query from './Query.jsx'
import Spectra from './Spectra.jsx'
import Biplot from './Biplot.jsx'
import Console from './Console.jsx'
import LLM from './LLM.jsx'
import Library from './Library.jsx'

export const WIDGET_TYPES = [
  { id: 'query', label: 'Query', Component: Query },
  { id: 'spectra', label: 'Spectra', Component: Spectra },
  { id: 'biplot', label: 'Biplot', Component: Biplot },
  { id: 'llm', label: 'Chat', Component: LLM },
  { id: 'console', label: 'Console', Component: Console },
  { id: 'library', label: 'Library', Component: Library },
]

export const WIDGET_MAP = Object.fromEntries(
  WIDGET_TYPES.map(({ id, Component }) => [id, Component]),
)
