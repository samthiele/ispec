export default function LoadingScreen({ message, error }) {
  return (
    <div className="loading-screen">
      <div className="loading-screen-card">
        <h1 className="loading-screen-title">iSpec</h1>
        {error ? (
          <>
            <p className="loading-screen-error">Failed to initialise Python environment.</p>
            <pre className="loading-screen-detail">{error}</pre>
          </>
        ) : (
          <>
            <p className="loading-screen-message">{message}</p>
            <div className="loading-screen-spinner" aria-hidden="true" />
          </>
        )}
      </div>
    </div>
  )
}
