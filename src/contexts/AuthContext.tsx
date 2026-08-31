import { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Shop } from '@/types'

export type UserRole = 'owner' | 'manager' | 'staff' | null

interface AuthContextValue {
  user: User | null
  session: Session | null
  shop: Shop | null
  userRole: UserRole
  isSuperAdmin: boolean
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, shopName: string, customSlug?: string) => Promise<void>
  signOut: () => Promise<void>
  refreshShop: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [shop, setShop] = useState<Shop | null>(null)
  const [loading, setLoading] = useState(true)

  const [userRole, setUserRole] = useState<UserRole>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  const fetchShop = async (userId: string) => {
    try {
      // 1. Check if super admin
      const { data: profile } = await supabase.from('user_profiles').select('is_super_admin').eq('id', userId).maybeSingle()
      setIsSuperAdmin(profile?.is_super_admin ?? false)

      // 2. Fetch role from shop_staff
      const { data: staffData } = await supabase.from('shop_staff').select('role, shop_id').eq('user_id', userId).maybeSingle()

      let currentShop = null
      let currentRole: UserRole = null

      if (staffData) {
        currentRole = staffData.role as UserRole
        const { data: shopData } = await supabase.from('shops').select('*').eq('id', staffData.shop_id).maybeSingle()
        currentShop = shopData
      } else {
        // Fallback for existing owners before migration
        const { data: shopData } = await supabase.from('shops').select('*').eq('owner_id', userId).maybeSingle()
        if (shopData) {
          currentShop = shopData
          currentRole = 'owner'
        }
      }

      setShop(currentShop)
      setUserRole(currentRole)
    } catch (err) {
      console.error('fetchShop error:', err)
      setShop(null)
      setUserRole(null)
      setIsSuperAdmin(false)
    }
  }

  const refreshShop = async () => {
    if (user) await fetchShop(user.id)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) await fetchShop(session.user.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        await fetchShop(session.user.id)
      } else {
        setShop(null)
        setUserRole(null)
        setIsSuperAdmin(false)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signUp = async (email: string, password: string, shopName: string, customSlug?: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    if (data.user) {
      const baseSlug = shopName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      const slug = customSlug ?? `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
      const { data: shopData, error: shopError } = await supabase.from('shops').insert({
        owner_id: data.user.id,
        name: shopName,
        slug,
        currency: 'INR',
        is_open: true,
        tax_percent: 0,
      }).select().single()
      if (shopError) throw new Error(shopError.message)
      if (shopData) setShop(shopData)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setShop(null)
    setUserRole(null)
    setIsSuperAdmin(false)
  }

  return (
    <AuthContext.Provider value={{ user, session, shop, userRole, isSuperAdmin, loading, signIn, signUp, signOut, refreshShop }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
