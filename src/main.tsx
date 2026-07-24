import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Register the service worker so the app is installable. Only in production:
// in dev it would cache the shell and serve stale files between rebuilds.
const isProd = (import.meta as { env?: { PROD?: boolean } }).env?.PROD === true

if (isProd && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Install prompt just won't appear; the site itself works regardless.
    })
  })
}
