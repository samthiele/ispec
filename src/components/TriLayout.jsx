import CFrame from './CFrame.jsx'
import './TriLayout.css'

export default function TriLayout() {
  return (
    <div className="tri-layout">
      <div className="tri-layout-left">
        <CFrame paneIndex={0} />
      </div>
      <div className="tri-layout-right">
        <div className="tri-layout-right-top">
          <CFrame paneIndex={1} />
        </div>
        <div className="tri-layout-right-bottom">
          <CFrame paneIndex={2} />
        </div>
      </div>
    </div>
  )
}
