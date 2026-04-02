import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import UploaderApp from './UploaderApp'
import ReceiveApp from './ReceiveApp'

// Simple client-side routing: /receive/:dropId -> ReceiveApp, else -> UploaderApp
const path = window.location.pathname;
const receiveMatch = path.match(/^\/receive\/([a-f0-9-]+)$/i);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="app">
      {receiveMatch ? (
        <ReceiveApp dropId={receiveMatch[1]} />
      ) : (
        <UploaderApp />
      )}

    </div>
  </StrictMode>
)
