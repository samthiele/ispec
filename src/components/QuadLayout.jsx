import CFrame from './CFrame.jsx'
import './QuadLayout.css'

export default function QuadLayout() {
  return (
    <div className="quad-layout">
      <div className="quad-layout-top-left">
        <CFrame paneIndex={0} />
      </div>
      <div className="quad-layout-top-right">
        <CFrame paneIndex={1} />
      </div>
      <div className="quad-layout-bottom-left">
        <CFrame paneIndex={2} />
      </div>
      <div className="quad-layout-bottom-right">
        <CFrame paneIndex={3} />
      </div>
    </div>
  )
}
