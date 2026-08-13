import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Tag, ShoppingBag, Gift, User, UtensilsCrossed, ChevronRight, LogOut, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useCustomerOrderNotifications } from '@/hooks/useCustomerOrderNotifications'
import { useCartStore } from '@/store/cartStore'
import type { CustomerProfile, ProfileCoupon, Order, CartItem } from '@/types'
import toast from 'react-hot-toast'

export default function ProfileDashboardPage() {
  const { slug, profileId } = useParams<{ slug: string; profileId: string }>()
  const navigate = useNavigate()
  useCustomerOrderNotifications(slug)
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [coupons, setCoupons] = useState<ProfileCoupon[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'history' | 'coupons'>('history')
  const { setCart } = useCartStore()
  const [reorderingId, setReorderingId] = useState<string | null>(null)

  useEffect(() => {
    if (!profileId) return
    fetchAll()
  }, [profileId])

  const fetchAll = async () => {
    setLoading(true)

    const [profileRes, couponsRes] = await Promise.all([
      supabase.from('customer_profiles').select('*').eq('id', profileId!).single(),
      supabase.from('profile_coupons').select('*').eq('profile_id', profileId!).order('assigned_at', { ascending: false }),
    ])

    if (profileRes.error || !profileRes.data) {
      toast.error('Profile not found')
      navigate(`/order/${slug}`)
      return
    }

    const p = profileRes.data as CustomerProfile
    setProfile(p)
    setCoupons((couponsRes.data ?? []) as ProfileCoupon[])

    // Fetch order history by phone + shop
    const { data: shopData } = await supabase.from('shops').select('id').eq('slug', slug!).single()
    if (shopData) {
      const { data: ordersData } = await supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .eq('shop_id', shopData.id)
        .eq('customer_phone', p.phone)
        .order('created_at', { ascending: false })
        .limit(20)
      setOrders((ordersData ?? []) as Order[])
    }

    setLoading(false)
  }

  const handleSignOut = () => {
    localStorage.removeItem(`profile-${slug}`)
    toast.success('Signed out of profile')
    navigate(`/order/${slug}`)
  }

  const handleReorder = async (e: React.MouseEvent, order: Order) => {
    e.stopPropagation()
    if (!order.items || order.items.length === 0) {
      toast.error('No items found in this order')
      return
    }

    setReorderingId(order.id)
    try {
      const itemIds = order.items.map((i) => i.menu_item_id)
      
      const { data: menuItems, error } = await supabase
        .from('menu_items')
        .select('*')
        .in('id', itemIds)
        .eq('is_available', true)
        
      if (error) throw error
      if (!menuItems || menuItems.length === 0) {
        toast.error('These items are no longer available')
        return
      }

      const newCartItems: CartItem[] = []
      
      for (const orderItem of order.items) {
        const menuItem = menuItems.find(m => m.id === orderItem.menu_item_id)
        if (menuItem) {
          newCartItems.push({
            menu_item: menuItem,
            quantity: orderItem.quantity,
            customizations: orderItem.customizations || []
          })
        }
      }

      if (newCartItems.length === 0) {
        toast.error('None of these items are currently available')
        return
      }

      setCart(newCartItems, slug)
      
      if (newCartItems.length < order.items.length) {
        toast.success('Some items were unavailable, added the rest to your cart!')
      } else {
        toast.success('Order added to cart!')
      }
      
      navigate(`/order/${slug}/checkout`)
    } catch (error: any) {
      toast.error('Failed to reorder: ' + error.message)
    } finally {
      setReorderingId(null)
    }
  }

  const unusedCoupons = coupons.filter((c) => !c.used_at)
  const usedCoupons = coupons.filter((c) => !!c.used_at)

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-blue-100 text-blue-700',
    preparing: 'bg-orange-100 text-orange-700',
    ready: 'bg-green-100 text-green-700',
    completed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-600',
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950">
        <div className="w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!profile) return null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 transition-colors">
      {/* Header */}
      <div className="gradient-brand-header text-white px-4 pt-safe pb-10">
        <div className="max-w-lg mx-auto pt-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => navigate(`/order/${slug}`)} className="flex items-center gap-2 text-white/80 hover:text-white text-sm">
              <ArrowLeft size={16} /> Back to menu
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-semibold backdrop-blur-sm transition-all active:scale-95 shadow-sm"
              title="Sign out of profile"
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
              <User size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{profile.name}</h1>
              <p className="text-white/80 text-sm">{profile.phone}</p>
              {profile.email && <p className="text-white/60 text-xs">{profile.email}</p>}
            </div>
          </div>

          {/* Stats row */}
          <div className="flex gap-3 mt-4">
            <div className="flex-1 bg-white/15 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold">{unusedCoupons.length}</p>
              <p className="text-white/70 text-xs mt-0.5">Coupons</p>
            </div>
            <div className="flex-1 bg-white/15 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold">{orders.length}</p>
              <p className="text-white/70 text-xs mt-0.5">Orders</p>
            </div>
            <div className="flex-1 bg-white/15 rounded-xl p-3 text-center">
              <p className="text-lg font-bold">{formatCurrency(orders.reduce((s, o) => s + o.total, 0))}</p>
              <p className="text-white/70 text-xs mt-0.5">Spent</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-4 pb-32 space-y-4">
        {/* Tabs */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 flex overflow-hidden shadow-sm">
          {(['history', 'coupons'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-semibold capitalize transition-colors ${tab === t ? 'bg-brand-primary text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
            >
              {t === 'coupons' ? `🎟 Coupons (${unusedCoupons.length})` : `📋 Order History`}
            </button>
          ))}
        </div>

        {tab === 'coupons' && (
          <div className="space-y-3">
            {unusedCoupons.length === 0 && usedCoupons.length === 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-8 text-center">
                <Gift size={32} className="text-gray-200 dark:text-slate-700 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400 font-medium text-sm">No coupons yet</p>
                <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">The shop will send you offers here</p>
              </div>
            )}

            {unusedCoupons.length > 0 && (
              <>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">Available to use</p>
                {unusedCoupons.map((c) => (
                  <div key={c.id} className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed border-brand-primary-light dark:border-brand-primary/40 p-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-brand-primary-lighter dark:bg-brand-primary/20 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Tag size={18} className="text-brand-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-gray-900 dark:text-white font-mono tracking-wide">{c.coupon_code}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{c.label}</p>
                    </div>
                    <button
                      onClick={() => {
                        // Store coupon code hint so CheckoutPage auto-applies it
                        localStorage.setItem(`pending-coupon-${slug}`, c.coupon_code)
                        navigate(`/order/${slug}`)
                        toast.success('Add items to your cart, coupon will be applied at checkout')
                      }}
                      className="px-3 py-1.5 rounded-xl bg-brand-primary text-white text-xs font-semibold hover:opacity-90 transition-colors"
                    >
                      Use Now
                    </button>
                  </div>
                ))}
              </>
            )}

            {usedCoupons.length > 0 && (
              <>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 mt-2">Used</p>
                {usedCoupons.map((c) => (
                  <div key={c.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-4 flex items-center gap-3 opacity-60">
                    <div className="w-10 h-10 bg-gray-100 dark:bg-slate-800 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Tag size={18} className="text-gray-400 dark:text-gray-500" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-gray-500 dark:text-gray-400 font-mono tracking-wide line-through">{c.coupon_code}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{c.label} · Used {c.used_at ? formatDate(c.used_at) : ''}</p>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-3">
            {orders.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-8 text-center">
                <ShoppingBag size={32} className="text-gray-200 dark:text-slate-700 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400 font-medium text-sm">No orders yet</p>
                <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Your orders will appear here</p>
              </div>
            ) : (
              orders.map((order) => (
                <div
                  key={order.id}
                  onClick={() => navigate(`/order/${slug}/success/${order.id}`)}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-4 cursor-pointer hover:border-brand-primary-light dark:hover:border-brand-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-900 dark:text-white text-sm font-mono">{order.order_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[order.status] ?? 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400'}`}>
                      {order.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                    <span>{formatDate(order.created_at)}</span>
                  </div>
                  {order.items && order.items.length > 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate">
                      {order.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50 dark:border-slate-800">
                    <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(order.total)}</span>
                    <button
                      onClick={(e) => handleReorder(e, order)}
                      disabled={reorderingId === order.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary/10 text-brand-primary rounded-lg text-sm font-semibold hover:bg-brand-primary/20 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw size={16} className={reorderingId === order.id ? 'animate-spin' : ''} />
                      {reorderingId === order.id ? 'Reordering...' : 'Reorder'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Floating order button */}
      <div
        className="fixed bottom-6 left-0 right-0 px-4 z-20"
        style={{ animation: 'slideUp 0.3s ease-out' }}
      >
        <div className="max-w-lg mx-auto">
          <button
            onClick={() => navigate(`/order/${slug}`)}
            className="w-full bg-brand-primary text-white rounded-2xl p-4 flex items-center justify-between shadow-xl shadow-brand-primary/30 hover:opacity-90 active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <UtensilsCrossed size={16} className="text-white" />
              </span>
              <span className="font-semibold">Browse Menu &amp; Order</span>
            </div>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
