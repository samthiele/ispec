import CFrame from './CFrame.jsx'
import './BiLayout.css'

export default function BiLayout() {
  return (
    <div className="bi-layout">
      <div className="bi-layout-top">
        <CFrame paneIndex={0} />
      </div>
      <div className="bi-layout-bottom">
        <CFrame paneIndex={1} />
      </div>
    </div>
  )
}
