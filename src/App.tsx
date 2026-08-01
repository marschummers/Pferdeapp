import { useEffect } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import WeekPage from './pages/WeekPage'
import FeedingPage from './pages/FeedingPage'
import MealDetailPage from './pages/MealDetailPage'
import HealthPage from './pages/HealthPage'
import WeightHistoryPage from './pages/WeightHistoryPage'
import HealthCategoryPage from './pages/HealthCategoryPage'
import StockPage from './pages/StockPage'
import ManagementPage from './pages/ManagementPage'
import LoginPage from './pages/LoginPage'
import NavIcon from './components/NavIcon'
import { applyPendingStockDeductions } from './lib/stock'
import { useAuth } from './lib/auth'
import './App.css'

function AppShell() {
  return (
    <div className="app">
      <main className="app-content">
        <div className="app-content-scroll">
          <Routes>
            <Route path="/" element={<WeekPage />} />
            <Route path="/fuetterung" element={<FeedingPage />} />
            <Route path="/fuetterung/:mealId" element={<MealDetailPage />} />
            <Route path="/gesundheit" element={<HealthPage />} />
            <Route path="/gesundheit/gewicht" element={<WeightHistoryPage />} />
            <Route path="/gesundheit/:category" element={<HealthCategoryPage />} />
            <Route path="/vorrat" element={<StockPage />} />
            <Route path="/verwaltung" element={<ManagementPage />} />
          </Routes>
        </div>
      </main>
      <nav className="bottom-nav">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          <NavIcon name="plan" />
          Plan
        </NavLink>
        <NavLink to="/fuetterung" className={({ isActive }) => (isActive ? 'active' : '')}>
          <NavIcon name="feeding" />
          Fütterung
        </NavLink>
        <NavLink to="/gesundheit" className={({ isActive }) => (isActive ? 'active' : '')}>
          <NavIcon name="health" />
          Gesundheit
        </NavLink>
        <NavLink to="/vorrat" className={({ isActive }) => (isActive ? 'active' : '')}>
          <NavIcon name="stock" />
          Vorrat
        </NavLink>
        <NavLink to="/verwaltung" className={({ isActive }) => (isActive ? 'active' : '')}>
          <NavIcon name="management" />
          Verwaltung
        </NavLink>
      </nav>
    </div>
  )
}

function App() {
  const { configured, loading, session, approved, signOut } = useAuth()

  useEffect(() => {
    applyPendingStockDeductions()
  }, [])

  // Ohne Supabase-Konfiguration (z.B. lokal ohne .env.local, oder solange der Nutzer sein
  // Projekt noch nicht angelegt hat) bleibt die App wie bisher rein lokal nutzbar – erst
  // sobald Supabase konfiguriert ist, greift das Login.
  if (!configured) return <AppShell />

  if (loading) {
    return (
      <div className="app">
        <div className="auth-loading">Lädt…</div>
      </div>
    )
  }

  if (!session) return <LoginPage />

  // Zugangs-Warteliste (siehe profiles.approved in supabase/schema.sql): erst nach Freigabe
  // durch die Stallverwaltung sieht der Account irgendwelche Pferde-Daten. `null` = Freigabe-
  // Status wird noch geladen, unterscheidet sich bewusst von `false` (noch nicht freigegeben).
  if (approved === null) {
    return (
      <div className="app">
        <div className="auth-loading">Lädt…</div>
      </div>
    )
  }

  if (!approved) {
    return (
      <div className="login-screen">
        <h1>Warte auf Freigabe</h1>
        <div className="edit-panel login-panel">
          <p className="hint">
            Deine Anmeldung (<strong>{session.user.email}</strong>) ist eingegangen. Sobald die Stallverwaltung dich
            freigibt, kannst du hier loslegen.
          </p>
          <button className="secondary-button login-alt-email" onClick={() => signOut()}>
            Abmelden
          </button>
        </div>
      </div>
    )
  }

  return <AppShell />
}

export default App
