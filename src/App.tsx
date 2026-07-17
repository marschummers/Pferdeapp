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
import NavIcon from './components/NavIcon'
import { applyPendingStockDeductions } from './lib/stock'
import './App.css'

function App() {
  useEffect(() => {
    applyPendingStockDeductions()
  }, [])

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

export default App
