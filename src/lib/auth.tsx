import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

// Feste Admin-Adresse statt eines eigenen Rollen-Systems – muss exakt zu den
// "auth.jwt() ->> 'email' = ..."-Policies in supabase/schema.sql passen (Zugangs-Warteliste).
export const ADMIN_EMAIL = 'marschummers@googlemail.com'

interface AuthState {
  session: Session | null
  loading: boolean
  // null, wenn Supabase nicht konfiguriert ist (fehlende Umgebungsvariablen).
  configured: boolean
  // Zugangs-Warteliste (siehe profiles.approved in supabase/schema.sql): null solange
  // unbekannt/ohne Session, sonst der geladene Freigabe-Status. App.tsx zeigt bei false einen
  // Wartebildschirm statt der eigentlichen App.
  approved: boolean | null
  signInWithOtp: (email: string) => Promise<{ error: string | null }>
  // Bestätigt den 6-stelligen Code aus derselben Mail wie der Login-Link. Wichtig für als
  // Home-Bildschirm-App installierte Nutzung auf iOS: die bekommt einen eigenen, von Safari
  // und dem Mail-Mini-Browser komplett getrennten Speicherbereich – ein Login per Link landet
  // dort nie. Der Code wird dagegen direkt in der schon geöffneten App eingegeben, ganz ohne
  // Browser-Wechsel, und bleibt so im richtigen Speicherbereich.
  verifyOtp: (email: string, token: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [approved, setApproved] = useState<boolean | null>(null)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => subscription.subscription.unsubscribe()
  }, [])

  // Lädt den Freigabe-Status separat vom Session-State, da profiles erst nach dem Login lesbar
  // ist (RLS, siehe schema.sql) – läuft bei jedem Account-Wechsel neu.
  useEffect(() => {
    if (!supabase || !session) {
      setApproved(null)
      return
    }
    let cancelled = false
    supabase
      .from('profiles')
      .select('approved')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setApproved(data?.approved ?? false)
      })
    return () => {
      cancelled = true
    }
  }, [session?.user.id])

  async function signInWithOtp(email: string) {
    if (!supabase) return { error: 'Supabase ist nicht konfiguriert.' }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    })
    return { error: error?.message ?? null }
  }

  async function verifyOtp(email: string, token: string) {
    if (!supabase) return { error: 'Supabase ist nicht konfiguriert.' }
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase?.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{ session, loading, configured: !!supabase, approved, signInWithOtp, verifyOtp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden')
  return ctx
}
