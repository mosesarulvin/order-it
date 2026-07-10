import { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Shop } from '@/types'

interface AuthContextValue {
  user: User | null
  session: Session | null
  shop: Shop | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, shopName: string) => Promise<void>
  signOut: () => Promise<void>
  refreshShop: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [shop, setShop] = useState<Shop | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchShop = async (userId: string) => {
    const { data, error } = await supabase
      .from('shops')
      .select('*')
      .eq('owner_id', userId)
      .single()
    if (error) console.error('fetchShop error:', error.message, error.code)
    setShop(data)
  }

  const refreshShop = async () => {
    if (user) await fetchShop(user.id)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) fetchShop(session.user.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchShop(session.user.id)
      } else {
        setShop(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signUp = async (email: string, password: string, shopName: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    if (data.user) {
      const slug = shopName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      const { data: shopData, error: shopError } = await supabase.from('shops').insert({
        owner_id: data.user.id,
        name: shopName,
        slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
        currency: 'INR',
        is_open: true,
        tax_percent: 0,
      }).select().single()
      if (shopError) throw new Error(shopError.message)
      // Set shop immediately after insert — don't wait for onAuthStateChange race
      if (shopData) setShop(shopData)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setShop(null)
  }

  return (
    <AuthContext.Provider value={{ user, session, shop, loading, signIn, signUp, signOut, refreshShop }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
