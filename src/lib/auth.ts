import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

export const EMAIL_DOMAIN = '@xperience.group'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  return { session, ready }
}

export async function login(username: string, password: string): Promise<string | null> {
  const email = username.includes('@') ? username.trim() : `${username.trim()}${EMAIL_DOMAIN}`
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? 'Usuario o contraseña incorrectos.' : null
}

export function logout() {
  return supabase.auth.signOut()
}
