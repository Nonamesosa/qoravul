import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { TeamUser, Language } from '../types'
import { translate, type TranslationKey } from '../i18n/translations'

interface AuthContextValue {
  user: TeamUser | null
  session: Session | null
  loading: boolean
  lang: Language
  setLang: (lang: Language) => void
  t: (key: TranslationKey) => string
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, fullName: string, role: string, language: Language) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<TeamUser | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [lang, setLangState] = useState<Language>('uz')

  async function fetchUser(uid: string) {
    const { data, error } = await supabase
      .from('team_users')
      .select('*')
      .eq('id', uid)
      .maybeSingle()

    if (error) {
      console.error('Error fetching user profile:', error)
      return null
    }

    if (data) {
      setUser(data as TeamUser)
      setLangState((data as TeamUser).language)
    }
    return data
  }

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return
      setSession(s)
      if (s?.user) {
        fetchUser(s.user.id).finally(() => {
          if (mounted) setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, s) => {
      ;(async () => {
        if (!mounted) return
        setSession(s)
        if (s?.user) {
          await fetchUser(s.user.id)
        } else {
          setUser(null)
        }
        setLoading(false)
      })()
    })

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  const setLang = (newLang: Language) => {
    setLangState(newLang)
    if (user) {
      supabase
        .from('team_users')
        .update({ language: newLang })
        .eq('id', user.id)
        .then(() => {
          setUser({ ...user, language: newLang })
        })
    }
  }

  const t = (key: TranslationKey) => translate(lang, key)

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    if (data.user) {
      const profile = await fetchUser(data.user.id)
      if (!profile) {
        return { error: 'Profile not found. Please contact administrator.' }
      }
    }
    return { error: null }
  }

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    role: string,
    language: Language
  ) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return { error: error.message }
    if (data.user) {
      const { error: profileError } = await supabase
        .from('team_users')
        .insert({
          id: data.user.id,
          email,
          full_name: fullName,
          role,
          language,
        })
      if (profileError) {
        return { error: profileError.message }
      }
      await fetchUser(data.user.id)
    }
    return { error: null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
  }

  const refreshUser = async () => {
    if (session?.user) {
      await fetchUser(session.user.id)
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, session, loading, lang, setLang, t, signIn, signUp, signOut, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
