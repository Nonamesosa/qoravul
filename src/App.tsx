import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import AuthPage from './pages/AuthPage'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Cases from './pages/Cases'
import CaseDetail from './pages/CaseDetail'
import Rules from './pages/Rules'
import RuleEditor from './pages/RuleEditor'
import Models from './pages/Models'
import AdminPage from './pages/AdminPage'
import AuditLog from './pages/AuditLog'
import Notifications from './pages/Notifications'
import Simulator from './pages/Simulator'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <p className="text-neutral-500 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <AuthPage />
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/cases" element={<Cases />} />
        <Route path="/cases/:id" element={<CaseDetail />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/rules/new" element={<RuleEditor />} />
        <Route path="/rules/:id/edit" element={<RuleEditor />} />
        <Route path="/models" element={<Models />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/simulator" element={<Simulator />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
