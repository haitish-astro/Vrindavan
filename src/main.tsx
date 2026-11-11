import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

const root = document.getElementById('root')!

// Refuse to run inside someone else's page (protects against "clickjacking":
// a hostile site invisibly framing ours to trick taps). GitHub Pages cannot send
// the usual header for this, so the app checks for itself.
if (window.self !== window.top) {
  root.textContent = 'Our Little Vrindavan can only be opened directly.'
} else {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
