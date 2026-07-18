import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth.tsx'
import { ActiveHorseProvider } from './lib/activeHorse.tsx'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ActiveHorseProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </ActiveHorseProvider>
    </AuthProvider>
  </StrictMode>,
)
