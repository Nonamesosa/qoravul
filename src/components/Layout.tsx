import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  LayoutDashboard,
  FolderOpen,
  Gavel,
  Brain,
  Settings,
  ScrollText,
  Bell,
  LogOut,
  Shield,
  PlayCircle,
  Globe,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'
import type { Language, UserRole } from '../types'

const navItems: { path: string; key: 'dashboard' | 'cases' | 'rules' | 'models' | 'admin_panel' | 'auditLog' | 'notifications' | 'simulator'; icon: typeof Shield; roles?: UserRole[] }[] = [
  { path: '/dashboard', key: 'dashboard', icon: LayoutDashboard },
  { path: '/cases', key: 'cases', icon: FolderOpen },
  { path: '/rules', key: 'rules', icon: Gavel, roles: ['admin', 'fraud_manager', 'analyst', 'auditor'] },
  { path: '/models', key: 'models', icon: Brain, roles: ['admin', 'data_scientist', 'fraud_manager'] },
  { path: '/simulator', key: 'simulator' as any, icon: PlayCircle },
  { path: '/admin', key: 'admin_panel', icon: Settings, roles: ['admin'] },
  { path: '/audit', key: 'auditLog', icon: ScrollText, roles: ['admin', 'auditor', 'fraud_manager'] },
  { path: '/notifications', key: 'notifications', icon: Bell, roles: ['admin', 'fraud_manager', 'analyst'] },
]

export default function Layout() {
  const { user, t, signOut, lang, setLang } = useAuth()
  const navigate = useNavigate()
  const [langOpen, setLangOpen] = useState(false)
  const langRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const visibleItems = navItems.filter(item => !item.roles || (user && item.roles.includes(user.role)))

  return (
    <div className="flex min-h-screen bg-neutral-100">
      {/* Sidebar */}
      <aside className="w-64 bg-neutral-900 text-neutral-300 flex flex-col fixed h-screen z-20">
        <div className="px-5 py-5 border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">{t('appName')}</h1>
              <p className="text-neutral-500 text-xs">{t('appSubtitle')}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleItems.map(item => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
                  )
                }
              >
                <Icon className="w-5 h-5" />
                <span>{item.key === 'simulator' ? 'Simulator' : t(item.key)}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="px-3 py-4 border-t border-neutral-800">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-9 h-9 rounded-full bg-neutral-700 flex items-center justify-center text-white text-sm font-medium">
              {user?.full_name?.charAt(0).toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{user?.full_name}</p>
              <p className="text-neutral-500 text-xs truncate">{user ? t(user.role as any) : ''}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white transition-all w-full"
          >
            <LogOut className="w-5 h-5" />
            <span>{t('logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 ml-64">
        {/* Top bar */}
        <header className="bg-white border-b border-neutral-200 px-6 py-3.5 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-neutral-900">{t('appSubtitle')}</h2>
            <span className="px-2 py-0.5 bg-success-100 text-success-700 text-xs font-medium rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-success-500 rounded-full animate-pulse-soft" />
              MVP
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Language switcher */}
            <div className="relative" ref={langRef}>
              <button
                onClick={() => setLangOpen(!langOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-neutral-600 hover:bg-neutral-100 transition-colors"
              >
                <Globe className="w-4 h-4" />
                <span className="uppercase">{lang}</span>
              </button>
              {langOpen && (
                <div className="absolute right-0 mt-1 w-32 bg-white border border-neutral-200 rounded-lg shadow-lg overflow-hidden animate-fade-in">
                  {(['uz', 'ru', 'en'] as Language[]).map(l => (
                    <button
                      key={l}
                      onClick={() => { setLang(l); setLangOpen(false) }}
                      className={clsx(
                        'flex items-center gap-2 px-3 py-2 text-sm w-full text-left hover:bg-neutral-50 transition-colors',
                        lang === l ? 'text-primary-600 font-medium' : 'text-neutral-600'
                      )}
                    >
                      <span className="uppercase text-xs w-6">{l}</span>
                      {l === 'uz' && 'O\u2018zbek'}
                      {l === 'ru' && 'Русский'}
                      {l === 'en' && 'English'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
