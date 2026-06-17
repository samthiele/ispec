import { WIDGET_TYPES } from './widgets/index.js'
import { useAppState } from '../context/useAppState.js'
import './CFrame.css'

export default function CFrame({ paneIndex }) {
  const { appState, updatePane } = useAppState()
  const pane = appState.panes[paneIndex]
  const widget =
    WIDGET_TYPES.find(({ id }) => id === pane?.type) ?? WIDGET_TYPES[0]
  const Widget = widget.Component

  if (!pane) return null

  return (
    <section className="cframe">
      <header className="cframe-header">
        <h2 className="cframe-title">{widget.label}</h2>
        <label className="cframe-select-label">
          <span className="sr-only">Widget type</span>
          <select
            className="cframe-select"
            value={pane.type}
            onChange={(event) =>
              updatePane(paneIndex, { type: event.target.value, state: {} })
            }
          >
            {WIDGET_TYPES.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="cframe-body">
        <Widget paneIndex={paneIndex} paneState={pane.state} />
      </div>
    </section>
  )
}
