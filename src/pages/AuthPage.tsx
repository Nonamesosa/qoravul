import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Shield, Eye, EyeOff } from 'lucide-react'
import type { Language, UserRole } from '../types'

export default function AuthPage() {
  const { t, signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<UserRole>('analyst')
  const [language, setLanguage] = useState<Language>('uz')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email || !password || (mode === 'signup' && !fullName)) {
      setError(t('fillAllFields'))
      return
    }

    setLoading(true)
    if (mode === 'signin') {
      const { error: err } = await signIn(email, password)
      if (err) setError(err)
    } else {
      const { error: err } = await signUp(email, password, fullName, role, language)
      if (err) setError(err)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-1 bg-neutral-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-primary-500 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-accent-500 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary-600 flex items-center justify-center">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t('appName')}</h1>
              <p className="text-neutral-400">{t('appSubtitle')}</p>
            </div>
          </div>
          <h2 className="text-3xl font-bold mb-4 leading-tight">
            Real-time fraud detection<br />for banks and MFIs
          </h2>
          <p className="text-neutral-400 text-lg mb-8 leading-relaxed">
            ALLOW / CHALLENGE / BLOCK decisions in under 150ms.
            Rules engine + ML hybrid scoring, case management, and audit trail.
          </p>
          <div className="space-y-3">
            {[
              'Scoring API — REST, idempotent, sync decisions',
              'Rules engine — codeless, shadow/active, 4-eyes approval',
              'ML model — LightGBM, champion/challenger, SHAP reasons',
              'Case management — SLA tracking, feedback labels',
              'Dashboard — fraud rate, FPR, latency, saved amount',
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-neutral-300">
                <div className="w-1.5 h-1.5 bg-primary-400 rounded-full" />
                <span className="text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-neutral-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-neutral-900">{t('appName')}</h1>
              <p className="text-neutral-500 text-sm">{t('appSubtitle')}</p>
            </div>
          </div>

          <div className="card p-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-1">
              {mode === 'signin' ? t('signIn') : t('signUp')}
            </h2>
            <p className="text-neutral-500 text-sm mb-6">
              {mode === 'signin'
                ? t('noAccount')
                : t('haveAccount')}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="label">{t('fullName')}</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="input"
                    placeholder="John Doe"
                  />
                </div>
              )}

              <div>
                <label className="label">{t('email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input"
                  placeholder="you@bank.uz"
                />
              </div>

              <div>
                <label className="label">{t('password')}</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {mode === 'signup' && (
                <>
                  <div className="bg-primary-50 border border-primary-200 rounded-lg p-3 text-xs text-primary-800">
                    <p className="font-medium">{t('defaultRoleNotice')}</p>
                  </div>
                  <div>
                    <label className="label">{t('language')}</label>
                    <select
                      value={language}
                      onChange={e => setLanguage(e.target.value as Language)}
                      className="input"
                    >
                      <option value="uz">O\u2018zbek</option>
                      <option value="ru">Русский</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                </>
              )}

              {error && (
                <div className="bg-danger-50 border border-danger-200 text-danger-700 text-sm rounded-lg px-3 py-2 animate-fade-in">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full"
              >
                {loading
                  ? (mode === 'signin' ? t('signingIn') : t('signingUp'))
                  : (mode === 'signin' ? t('signInButton') : t('signUpButton'))
                }
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin')
                  setError(null)
                }}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                {mode === 'signin' ? t('signUpButton') : t('signInButton')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
