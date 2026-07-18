import { useEffect, useState } from 'react'
import { Users, Search, Tag, Gift, X, CalendarDays, Phone, Mail, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/lib/utils'
import type { CustomerProfile, ProfileCoupon, Coupon, Order } from '@/types'
import { Skeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import toast from 'react-hot-toast'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function isBirthdayThisMonth(birthday: string | null) {
  if (!birthday) return false
  const bMonth = new Date(birthday).getMonth()
  return bMonth === new Date().getMonth()
}

export default function CustomersPage() {
  const { shop } = useAuth()
  const [profiles, setProfiles] = useState<CustomerProfile[]>([])
  const [orderStats, setOrderStats] = useState<Record<string, { count: number; total: number }>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'all' | 'birthdays'>('all')

  // Drawer state
  const [selected, setSelected] = useState<CustomerProfile | null>(null)
  const [profileOrders, setProfileOrders] = useState<Order[]>([])
  const [profileCoupons, setProfileCoupons] = useState<ProfileCoupon[]>([])
  const [drawerLoading, setDrawerLoading] = useState(false)

  // Send coupon modal
  const [sendCouponTarget, setSendCouponTarget] = useState<CustomerProfile | null>(null)
  const [shopCoupons, setShopCoupons] = useState<Coupon[]>([])
  const [selectedCouponId, setSelectedCouponId] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!shop) return
    fetchProfiles()
    fetchShopCoupons()
  }, [shop])

  const fetchProfiles = async () => {
    if (!shop) return
    setLoading(true)
    const { data } = await supabase
      .from('customer_profiles')
      .select('*')
      .eq('shop_id', shop.id)
      .order('created_at', { ascending: false })
    const profileList = (data ?? []) as CustomerProfile[]
    setProfiles(profileList)

    // Fetch order stats for all profiles by phone
    if (profileList.length > 0) {
      const phones = profileList.map((p) => p.phone)
      const { data: orders } = await supabase
        .from('orders')
        .select('customer_phone, total')
        .eq('shop_id', shop.id)
        .in('customer_phone', phones)
      const stats: Record<string, { count: number; total: number }> = {}
      for (const o of orders ?? []) {
        const phone = o.customer_phone
        if (!stats[phone]) stats[phone] = { count: 0, total: 0 }
        stats[phone].count++
        stats[phone].total += o.total
      }
      setOrderStats(stats)
    }
    setLoading(false)
  }

  const fetchShopCoupons = async () => {
    if (!shop) return
    const { data } = await supabase
      .from('coupons')
      .select('*')
      .eq('shop_id', shop.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    setShopCoupons((data ?? []) as Coupon[])
  }

  const openDrawer = async (profile: CustomerProfile) => {
    setSelected(profile)
    setDrawerLoading(true)
    const [ordersRes, couponsRes] = await Promise.all([
      supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .eq('shop_id', shop!.id)
        .eq('customer_phone', profile.phone)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('profile_coupons')
        .select('*')
        .eq('profile_id', profile.id)
        .order('assigned_at', { ascending: false }),
    ])
    setProfileOrders((ordersRes.data ?? []) as Order[])
    setProfileCoupons((couponsRes.data ?? []) as ProfileCoupon[])
    setDrawerLoading(false)
  }

  const sendCoupon = async () => {
    if (!selectedCouponId || !sendCouponTarget || !shop) return
    setSending(true)
    const coupon = shopCoupons.find((c) => c.id === selectedCouponId)
    if (!coupon) { setSending(false); return }
    const label = coupon.type === 'percentage' ? `${coupon.value}% off` : `₹${coupon.value} off`
    const { error } = await supabase.from('profile_coupons').insert({
      profile_id: sendCouponTarget.id,
      shop_id: shop.id,
      coupon_id: coupon.id,
      coupon_code: coupon.code,
      label,
    })
    setSending(false)
    if (error) { toast.error(error.message); return }
    toast.success(`Coupon ${coupon.code} sent to ${sendCouponTarget.name}`)
    setSendCouponTarget(null)
    setSelectedCouponId('')
    // Refresh drawer if open for this profile
    if (selected?.id === sendCouponTarget.id) {
      const { data } = await supabase.from('profile_coupons').select('*').eq('profile_id', sendCouponTarget.id).order('assigned_at', { ascending: false })
      setProfileCoupons((data ?? []) as ProfileCoupon[])
    }
  }

  const birthdayProfiles = profiles.filter((p) => isBirthdayThisMonth(p.birthday))
  const filtered = (tab === 'birthdays' ? birthdayProfiles : profiles).filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.phone.includes(search) ||
    (p.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-blue-100 text-blue-700',
    preparing: 'bg-orange-100 text-orange-700',
    ready: 'bg-green-100 text-green-700',
    completed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-600',
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Customers</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Profiles created by your customers</p>
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3 h-9 w-60">
          <Search size={15} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search name, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-sm outline-none bg-transparent dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-slate-800 rounded-xl p-1 w-fit">
        <button onClick={() => setTab('all')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'all' ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
          All ({profiles.length})
        </button>
        <button onClick={() => setTab('birthdays')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'birthdays' ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
          🎂 Birthdays this month ({birthdayProfiles.length})
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
            <Users size={28} className="text-gray-300 dark:text-slate-600" />
          </div>
          <p className="font-medium text-gray-500 dark:text-gray-400">{tab === 'birthdays' ? 'No birthdays this month' : 'No customers yet'}</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">{tab === 'birthdays' ? 'Check back later' : 'Customers who create a profile on your menu page will appear here'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((profile) => {
            const stats = orderStats[profile.phone]
            const isBday = isBirthdayThisMonth(profile.birthday)
            return (
              <div
                key={profile.id}
                className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-4 flex items-center gap-4 hover:border-orange-200 dark:hover:border-orange-500/50 transition-colors cursor-pointer"
                onClick={() => openDrawer(profile)}
              >
                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <span className="text-lg font-bold text-orange-500">{profile.name[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-white text-sm">{profile.name}</span>
                    {isBday && <span className="text-xs bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 px-2 py-0.5 rounded-full">🎂 Birthday this month!</span>}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{profile.phone}{profile.email ? ` · ${profile.email}` : ''}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{stats ? formatCurrency(stats.total) : '—'}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{stats ? `${stats.count} orders` : 'No orders'}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isBday && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setSendCouponTarget(profile); setSelectedCouponId('') }}
                      className="px-2.5 py-1.5 rounded-lg bg-pink-50 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 text-xs font-semibold hover:bg-pink-100 dark:hover:bg-pink-900/50 transition-colors"
                    >
                      🎂 Send Coupon
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setSendCouponTarget(profile); setSelectedCouponId('') }}
                    className="p-2 text-gray-400 dark:text-gray-500 hover:text-orange-500 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
                    title="Send coupon"
                  >
                    <Gift size={16} />
                  </button>
                  <ChevronRight size={16} className="text-gray-300 dark:text-slate-600" />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Customer Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 h-full flex flex-col shadow-2xl overflow-hidden">
            {/* Drawer header */}
            <div className="bg-gradient-to-br from-orange-500 to-amber-500 text-white p-5 flex-shrink-0">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl font-bold">
                    {selected.name[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-lg">{selected.name}</p>
                    <div className="flex items-center gap-1 text-white/80 text-xs"><Phone size={10} />{selected.phone}</div>
                    {selected.email && <div className="flex items-center gap-1 text-white/70 text-xs"><Mail size={10} />{selected.email}</div>}
                    {selected.birthday && <div className="flex items-center gap-1 text-white/70 text-xs mt-0.5"><CalendarDays size={10} /> Birthday: {formatDate(selected.birthday)}</div>}
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="p-1.5 bg-white/20 rounded-lg hover:bg-white/30 transition-colors">
                  <X size={16} />
                </button>
              </div>
              {/* Mini stats */}
              <div className="flex gap-2 mt-4">
                <div className="flex-1 bg-white/15 rounded-xl p-2.5 text-center">
                  <p className="font-bold">{orderStats[selected.phone]?.count ?? 0}</p>
                  <p className="text-white/70 text-xs">Orders</p>
                </div>
                <div className="flex-1 bg-white/15 rounded-xl p-2.5 text-center">
                  <p className="font-bold text-sm">{formatCurrency(orderStats[selected.phone]?.total ?? 0)}</p>
                  <p className="text-white/70 text-xs">Spent</p>
                </div>
                <div className="flex-1 bg-white/15 rounded-xl p-2.5 text-center">
                  <p className="font-bold">{profileCoupons.filter(c => !c.used_at).length}</p>
                  <p className="text-white/70 text-xs">Coupons</p>
                </div>
              </div>
            </div>

            {/* Send coupon quick action */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex-shrink-0">
              <button
                onClick={() => { setSendCouponTarget(selected); setSelectedCouponId('') }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-sm font-semibold hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors border border-orange-200 dark:border-orange-800"
              >
                <Tag size={14} /> Send a Coupon
              </button>
            </div>

            {/* Coupon list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {drawerLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
              ) : (
                <>
                  {profileCoupons.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Assigned Coupons</p>
                      <div className="space-y-2">
                        {profileCoupons.map((pc) => (
                          <div key={pc.id} className={`flex items-center gap-3 p-3 rounded-xl border ${pc.used_at ? 'border-gray-100 dark:border-slate-700 opacity-60' : 'border-dashed border-orange-300 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-900/20'}`}>
                            <Tag size={14} className={pc.used_at ? 'text-gray-400 dark:text-gray-500' : 'text-orange-500'} />
                            <div className="flex-1 min-w-0">
                              <p className={`font-mono font-bold text-sm ${pc.used_at ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-white'}`}>{pc.coupon_code}</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500">{pc.label}{pc.used_at ? ` · Used ${formatDate(pc.used_at)}` : ''}</p>
                            </div>
                            {!pc.used_at && <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">Active</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Order History</p>
                    {profileOrders.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No orders yet</p>
                    ) : (
                      <div className="space-y-2">
                        {profileOrders.map((order) => (
                          <div key={order.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-mono font-semibold text-xs text-gray-700 dark:text-gray-300">{order.order_number}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[order.status] ?? 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-300'}`}>{order.status}</span>
                            </div>
                            <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
                              <span>{formatDate(order.created_at)}</span>
                              <span className="font-semibold text-gray-700 dark:text-gray-200">{formatCurrency(order.total)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Send Coupon Modal */}
      <Modal
        open={!!sendCouponTarget}
        onClose={() => { setSendCouponTarget(null); setSelectedCouponId('') }}
        title={`Send Coupon to ${sendCouponTarget?.name}`}
        size="sm"
      >
        <div className="space-y-4">
          {shopCoupons.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No active coupons. Create one in the Coupons page first.</p>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">Select a coupon to assign to this customer's profile:</p>
              <div className="space-y-2">
                {shopCoupons.map((coupon) => (
                  <label key={coupon.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedCouponId === coupon.id ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/30' : 'border-gray-200 dark:border-slate-700'}`}>
                    <input type="radio" value={coupon.id} checked={selectedCouponId === coupon.id} onChange={() => setSelectedCouponId(coupon.id)} className="sr-only" />
                    <Tag size={14} className="text-orange-500 flex-shrink-0" />
                    <div className="flex-1">
                      <span className="font-mono font-bold text-sm dark:text-white">{coupon.code}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                        {coupon.type === 'percentage' ? `${coupon.value}% off` : `₹${coupon.value} off`}
                        {coupon.min_order_amount ? ` · min ₹${coupon.min_order_amount}` : ''}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => { setSendCouponTarget(null); setSelectedCouponId('') }} className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={sendCoupon}
                  disabled={!selectedCouponId || sending}
                  className="flex-1 py-2 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {sending ? 'Sending...' : 'Send Coupon'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
