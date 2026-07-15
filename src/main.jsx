import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './components/HoverTooltip.css'
import TooltipLayer from './components/TooltipLayer.jsx'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TooltipLayer />
    <App />
  </StrictMode>,
)
