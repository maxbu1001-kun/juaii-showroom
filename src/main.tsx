import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
if (favicon) {
  favicon.href = `${import.meta.env.BASE_URL}favicon.svg`
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
