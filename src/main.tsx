import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AppErrorBoundary } from './ErrorBoundary'
import './style.css'

function BootReady() {
  useEffect(() => { document.getElementById('load-fallback')?.remove() }, [])
  return null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BootReady/><AppErrorBoundary><App/></AppErrorBoundary></React.StrictMode>,
)
