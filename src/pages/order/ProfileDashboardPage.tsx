import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  ArrowLeft, Tag, ShoppingBag, ChevronRight, LogOut, RotateCcw,
  Phone, Mail,
  Gift, ArrowRight, Clock,
  Copy, Check, Receipt, Cake, FileText
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useCustomerOrderNotifications } from '@/hooks/useCustomerOrderNotifications'
import { useCartStore } from '@/store/cartStore'
import {
  fetchCustomerProfile,
  fetchCustomerCoupons,
  fetchCustomerOrders,
  humanizeError,
  type CustomerCoupon,
  type CustomerOrderSummary,
} from '@/lib/api/customerOrders'
import { getSessionToken, signOut } from '@/lib/customerSession'
import { downloadInvoicePDF, type InvoiceShopData } from '@/lib/invoiceGenerator'
import type { CartItem } from '@/types'
import toast from 'react-hot-toast'

interface ProfileData {
  id:         string
  name:       string
  phone:      string
  email:      string | null
  birthday?:  string | null
}

type TabKey = 'orders' | 'coupons' | 'account'

const STATUS_PILLS: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800/40',
  confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40',
  preparing: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border border-orange-200 dark:border-orange-800/40',
  ready:     'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40',
  completed: 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-gray-400 border border-gray-200 dark:border-slate-700',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800/40',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Order Placed',
  confirmed: 'Confirmed',
  preparing: 'Preparing in Kitchen',
  ready: 'Ready for Pickup',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'ready'])

export default function ProfileDashboardPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const requestedTab = searchParams.get('tab') as TabKey
  const initialTab: TabKey = (requestedTab === 'orders' || requestedTab === 'coupons' || requestedTab === 'account')
    ? requestedTab
    : 'orders'

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab)

  const token = slug ? getSessionToken(slug) : null

  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [shop,    setShop]    = useState<InvoiceShopData | null>(null)
  const [coupons, setCoupons] = useState<CustomerCoupon[]>([])
  const [orders,  setOrders]  = useState<CustomerOrderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [reorderingId, setReorderingId] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const { setCart } = useCartStore()

  const activeOrders = useMemo(
    () => orders.filter((o) => ACTIVE_STATUSES.has(o.status)),
    [orders],
  )
  const pastOrders = useMemo(
    () => orders.filter((o) => !ACTIVE_STATUSES.has(o.status)),
    [orders],
  )
  const unusedCoupons = useMemo(() => coupons.filter((c) => !c.used_at), [coupons])
  const usedCoupons   = useMemo(() => coupons.filter((c) => !!c.used_at), [coupons])

  const activeOrderIds = useMemo(
    () => activeOrders.map((o) => o.id),
    [activeOrders],
  )
  useCustomerOrderNotifications(slug, activeOrderIds)

  useEffect(() => {
    if (!slug) return
    if (!token) { navigate(`/order/${slug}/profile`, { replace: true }); return }

    let cancelled = false
    setLoading(true)

    // Load shop info for invoice headers
    supabase
      .from('shops')
      .select('name, phone, address, tax_percent, currency, logo_url')
      .eq('slug', slug)
      .single()
      .then(({ data }) => {
        if (!cancelled && data) setShop(data)
      })

    Promise.all([
      fetchCustomerProfile(token),
      fetchCustomerCoupons(token),
      fetchCustomerOrders(token, 30),
    ])
      .then(([p, c, o]) => {
        if (cancelled) return
        if (!p) {
          toast.error('Your session has expired. Please sign in again.')
          navigate(`/order/${slug}/profile`, { replace: true })
          return
        }
        setProfile({ id: p.id, name: p.name, phone: p.phone, email: p.email, birthday: p.birthday })
        setCoupons(c)
        setOrders(o)
      })
      .catch((err) => {
        if (!cancelled) toast.error(humanizeError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [slug, token, navigate])

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab)
    setSearchParams(tab === 'orders' ? {} : { tab })
  }

  const handleSignOut = async () => {
    if (!slug) return
    await signOut(slug)
    toast.success('Signed out of profile')
    navigate(`/order/${slug}`)
  }

  const handleDownloadInvoice = async (order: CustomerOrderSummary) => {
    let currentShop = shop
    if (!currentShop && slug) {
      const { data } = await supabase
        .from('shops')
        .select('name, phone, address, tax_percent, currency, logo_url')
        .eq('slug', slug)
        .maybeSingle()
      if (data) {
        currentShop = data
        setShop(data)
      }
    }

    downloadInvoicePDF(
      order,
      currentShop || { name: 'OrderIt Store' },
      profile ? { name: profile.name, phone: profile.phone, email: profile.email } : undefined
    )
  }

  const handleCopyCode = (code: string) => {
    navigator.clipboard?.writeText(code)
    setCopiedCode(code)
    toast.success(`Coupon code ${code} copied!`)
    setTimeout(() => setCopiedCode(null), 2500)
  }

  const handleApplyCoupon = (code: string) => {
    if (!slug) return
    localStorage.setItem(`pending-coupon-${slug}`, code)
    toast.success(`Coupon "${code}" applied! Add items to cart.`)
    navigate(`/order/${slug}`)
  }

  const handleReorder = async (order: CustomerOrderSummary) => {
    if (order.items.length === 0) { toast.error('No items in this order'); return }
    setReorderingId(order.id)
    try {
      const itemIds = order.items.map((i) => i.menu_item_id).filter(Boolean) as string[]
      if (itemIds.length === 0) { toast.error('These items are no longer available'); return }

      const { data: menuItems, error } = await supabase
        .from('menu_items')
        .select('*')
        .in('id', itemIds)
        .eq('is_available', true)
      if (error) throw error
      if (!menuItems?.length) { toast.error('These items are no longer available'); return }

      const newCartItems: CartItem[] = order.items
        .map((oi) => {
          const menu = menuItems.find((m) => m.id === oi.menu_item_id)
          if (!menu) return null
          return { menu_item: menu, quantity: oi.quantity, customizations: oi.customizations ?? [] } as CartItem
        })
        .filter((v): v is CartItem => v !== null)

      if (newCartItems.length === 0) { toast.error('None of these items are currently available'); return }
      setCart(newCartItems, slug)
      toast.success(newCartItems.length < order.items.length
        ? 'Some items were unavailable, added the rest to your cart!'
        : 'Order added to cart!')
      navigate(`/order/${slug}/checkout`)
    } catch (err) {
      toast.error(humanizeError(err))
    } finally {
      setReorderingId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-slate-950 p-4">
        <div className="w-10 h-10 border-3 border-brand-primary border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Loading your profile…</p>
      </div>
    )
  }

  if (!profile) return null

  const initials = getInitials(profile.name)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex flex-col">
      {/* Top sticky navigation bar */}
      <header className="bg-white/95 dark:bg-slate-900/95 border-b border-gray-200/80 dark:border-slate-800 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate(`/order/${slug}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 -ml-2 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={16} /> Menu
          </button>
        </div>
      </header>

      {/* Hero profile card */}
      <div className="bg-white dark:bg-slate-900 border-b border-gray-200/80 dark:border-slate-800 px-4 py-5 shadow-xs">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-brand-500 to-amber-500 text-white flex items-center justify-center text-lg sm:text-xl font-extrabold shadow-md shadow-brand-500/25 shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{profile.name}</h1>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30 text-xs sm:text-sm font-bold transition-colors shrink-0"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>

        {/* 3 Segmented Tabs: Orders, Coupons & Offers, Account */}
        <div className="max-w-lg mx-auto mt-5">
          <div className="flex gap-1.5 p-1 bg-gray-100/80 dark:bg-slate-800/80 rounded-2xl border border-gray-200/60 dark:border-slate-700/60">
            <TabButton
              active={activeTab === 'orders'}
              onClick={() => handleTabChange('orders')}
              icon={<ShoppingBag size={15} className={activeOrders.length > 0 ? 'text-amber-500' : ''} />}
              label="Orders"
              badge={activeOrders.length > 0 ? activeOrders.length : (orders.length > 0 ? orders.length : undefined)}
              badgeColor={activeOrders.length > 0 ? 'bg-amber-500 text-white animate-pulse' : 'bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-gray-300'}
            />
            <TabButton
              active={activeTab === 'coupons'}
              onClick={() => handleTabChange('coupons')}
              icon={<Gift size={15} />}
              label="Coupons & Offers"
              badge={unusedCoupons.length > 0 ? unusedCoupons.length : undefined}
              badgeColor="bg-brand-primary text-white"
            />
            <TabButton
              active={activeTab === 'account'}
              onClick={() => handleTabChange('account')}
              icon={<Phone size={15} />}
              label="Account"
            />
          </div>
        </div>
      </div>

      {/* Main tab content */}
      <main className="max-w-lg mx-auto px-4 py-6 pb-12 space-y-6 flex-1 w-full">

        {/* ────────── 1. ORDERS TAB (Current & History Together) ────────── */}
        {activeTab === 'orders' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Current Active Orders Sub-section */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">Current Active Orders</h2>
                </div>
                {activeOrders.length > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                    {activeOrders.length} in progress
                  </span>
                )}
              </div>

              {activeOrders.length > 0 ? (
                <div className="grid gap-3.5">
                  {activeOrders.map((order) => (
                    <ActiveOrderCard
                      key={order.id}
                      order={order}
                      onOpen={() => navigate(`/order/${slug}/success/${order.id}`)}
                      onDownloadInvoice={() => handleDownloadInvoice(order)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-gray-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 p-4 text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    No active orders in progress right now.
                  </p>
                </div>
              )}
            </section>

            {/* Order History Sub-section */}
            <section className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <ShoppingBag size={18} className="text-brand-primary" />
                  Order History
                </h2>
                {pastOrders.length > 0 && (
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    {pastOrders.length} {pastOrders.length === 1 ? 'order' : 'orders'}
                  </span>
                )}
              </div>

              {pastOrders.length > 0 ? (
                <div className="space-y-3">
                  {pastOrders.map((order) => (
                    <OrderHistoryCard
                      key={order.id}
                      order={order}
                      onOpen={() => navigate(`/order/${slug}/success/${order.id}`)}
                      onDownloadInvoice={() => handleDownloadInvoice(order)}
                      onReorder={() => handleReorder(order)}
                      reordering={reorderingId === order.id}
                    />
                  ))}
                </div>
              ) : activeOrders.length === 0 ? (
                <EmptyStateCard
                  icon={<ShoppingBag size={28} className="text-gray-400" />}
                  title="No orders placed yet"
                  description="When you order from the menu, your active progress and complete order history will appear right here."
                  actionLabel="Browse Menu & Order"
                  onAction={() => navigate(`/order/${slug}`)}
                />
              ) : (
                <div className="rounded-2xl border border-gray-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 p-4 text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    No past completed orders yet.
                  </p>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ────────── 2. COUPONS & OFFERS TAB ────────── */}
        {activeTab === 'coupons' && (
          <div className="space-y-5 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Available Offers & Coupons</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Apply discounts directly at checkout</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                {unusedCoupons.length} Available
              </span>
            </div>

            {unusedCoupons.length > 0 ? (
              <div className="grid gap-3.5">
                {unusedCoupons.map((coupon) => (
                  <CouponCard
                    key={coupon.id}
                    coupon={coupon}
                    copiedCode={copiedCode}
                    onCopy={() => handleCopyCode(coupon.coupon_code)}
                    onApply={() => handleApplyCoupon(coupon.coupon_code)}
                  />
                ))}
              </div>
            ) : (
              <EmptyStateCard
                icon={<Gift size={28} className="text-gray-400" />}
                title="No active coupons available"
                description="We periodically share exclusive discounts and seasonal offers. Check back soon!"
                actionLabel="Browse Menu"
                onAction={() => navigate(`/order/${slug}`)}
              />
            )}

            {/* Used coupons history */}
            {usedCoupons.length > 0 && (
              <div className="pt-4 border-t border-gray-200 dark:border-slate-800 space-y-3">
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Previously Redeemed Coupons</h3>
                <div className="grid gap-2.5 opacity-75">
                  {usedCoupons.map((coupon) => (
                    <div
                      key={coupon.id}
                      className="p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/50 flex items-center justify-between"
                    >
                      <div>
                        <span className="font-mono text-xs font-bold text-gray-500 line-through">{coupon.coupon_code}</span>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{coupon.label}</p>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 dark:bg-slate-800 dark:text-gray-400">
                        Redeemed
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ────────── 3. ACCOUNT TAB ────────── */}
        {activeTab === 'account' && (
          <div className="space-y-4 animate-fadeIn">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Account Details</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Manage your profile and personal details</p>
            </div>
            <AccountDetailsCard profile={profile} />
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
  badgeColor = 'bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-gray-300',
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: number
  badgeColor?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all flex-1 justify-center ${
        active
          ? 'bg-white dark:bg-slate-900 text-brand-primary shadow-xs'
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
      }`}
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && (
        <span className={`text-[10px] sm:text-xs px-1.5 py-0.2 rounded-full font-bold leading-tight ${badgeColor}`}>
          {badge}
        </span>
      )}
    </button>
  )
}

function ActiveOrderCard({
  order,
  onOpen,
  onDownloadInvoice,
}: {
  order: CustomerOrderSummary
  onOpen: () => void
  onDownloadInvoice: () => void
}) {
  const steps = ['pending', 'confirmed', 'preparing', 'ready']
  const currentStepIdx = steps.indexOf(order.status)
  const label = STATUS_LABEL[order.status] ?? order.status

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-brand-primary/40 dark:border-brand-primary/40 p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-brand-primary">In Progress</span>
            <span className="text-xs text-gray-400">·</span>
            <span className="font-mono text-sm font-bold text-gray-900 dark:text-white">#{order.order_number}</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
            <Clock size={12} /> {formatDate(order.created_at)}
          </p>
        </div>

        <span className={`text-xs px-2.5 py-1 rounded-full font-bold capitalize ${STATUS_PILLS[order.status] ?? STATUS_PILLS.pending}`}>
          {label}
        </span>
      </div>

      {/* Progress tracker bar */}
      <div className="py-1">
        <div className="grid grid-cols-4 gap-1.5">
          {steps.map((step, idx) => {
            const isCompleted = currentStepIdx >= idx
            const isCurrent = currentStepIdx === idx
            return (
              <div key={step} className="space-y-1">
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    isCompleted
                      ? 'bg-brand-primary'
                      : 'bg-gray-200 dark:bg-slate-800'
                  } ${isCurrent ? 'animate-pulse ring-2 ring-brand-primary/30' : ''}`}
                />
                <p className={`text-[10px] text-center capitalize font-semibold truncate ${
                  isCompleted ? 'text-brand-primary' : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {step === 'pending' ? 'Placed' : step === 'ready' ? 'Ready' : step}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Items list */}
      {order.items.length > 0 && (
        <div className="bg-gray-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-1 text-xs text-gray-700 dark:text-gray-300">
          {order.items.map((item, idx) => (
            <div key={idx} className="flex justify-between">
              <span>{item.name} <span className="font-bold text-gray-900 dark:text-white">×{item.quantity}</span></span>
              <span className="font-medium">{formatCurrency(item.subtotal)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="pt-2 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between gap-2">
        {order.payment_status === 'paid' ? (
          <button
            onClick={onDownloadInvoice}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            title="Download PDF Invoice"
          >
            <FileText size={13} className="text-brand-primary" /> Invoice PDF
          </button>
        ) : (
          <button
            disabled
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200/60 dark:border-slate-800 text-xs font-bold text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-60"
            title="Invoice available after payment is marked Paid"
          >
            <FileText size={13} /> Invoice PDF
          </button>
        )}

        <button
          onClick={onOpen}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold hover:opacity-95 active:scale-95 shadow-sm shadow-brand-primary/30 transition-all"
        >
          Track Live Status <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

function CouponCard({
  coupon,
  copiedCode,
  onCopy,
  onApply,
}: {
  coupon: CustomerCoupon
  copiedCode: string | null
  onCopy: () => void
  onApply: () => void
}) {
  const isCopied = copiedCode === coupon.coupon_code

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-4 shadow-sm flex flex-col justify-between group hover:border-brand-primary/50 transition-all">
      {/* Decorative notch punches */}
      <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800" aria-hidden />
      <span className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800" aria-hidden />

      <div>
        <div className="flex items-start justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-brand-primary-lighter text-brand-primary dark:bg-brand-primary/20">
            <Tag size={11} /> Offer
          </span>
          {coupon.min_order_amount ? (
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
              Min. {formatCurrency(coupon.min_order_amount)}
            </span>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="font-mono text-base font-extrabold text-gray-900 dark:text-white tracking-wide">
            {coupon.coupon_code}
          </span>
          <button
            onClick={onCopy}
            title="Copy coupon code"
            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
          >
            {isCopied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
            <span>{isCopied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 font-medium">
          {coupon.label}
        </p>
      </div>

      <div className="mt-4 pt-3 border-t border-dashed border-gray-200 dark:border-slate-800 flex items-center justify-between">
        <span className="text-[11px] text-gray-400">
          {coupon.expires_at ? `Expires ${formatDate(coupon.expires_at).split(',')[0]}` : 'Active'}
        </span>
        <button
          onClick={onApply}
          className="inline-flex items-center gap-1 text-xs font-bold text-brand-primary hover:text-brand-primary-dark transition-colors"
        >
          Apply & Order <ArrowRight size={13} />
        </button>
      </div>
    </div>
  )
}

function OrderHistoryCard({
  order,
  onOpen,
  onDownloadInvoice,
  onReorder,
  reordering,
}: {
  order: CustomerOrderSummary
  onOpen: () => void
  onDownloadInvoice: () => void
  onReorder: () => void
  reordering: boolean
}) {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm sm:text-base font-bold text-gray-900 dark:text-white">
              Order #{order.order_number}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold capitalize ${STATUS_PILLS[order.status] ?? STATUS_PILLS.completed}`}>
              {order.status}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
            <Clock size={12} /> {formatDate(order.created_at)}
          </p>
        </div>

        <div className="text-right">
          <p className="text-base sm:text-lg font-extrabold text-gray-900 dark:text-white tabular-nums">
            {formatCurrency(order.total)}
          </p>
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            {order.payment_method} · {order.payment_status}
          </span>
        </div>
      </div>

      {/* Items list */}
      {order.items.length > 0 && (
        <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-3 space-y-1.5 text-xs text-gray-700 dark:text-gray-300 divide-y divide-gray-100 dark:divide-slate-800">
          {order.items.map((item, idx) => (
            <div key={idx} className="flex justify-between pt-1 first:pt-0">
              <span className="truncate pr-2">
                <span className="font-bold text-gray-900 dark:text-white">{item.quantity}×</span> {item.name}
              </span>
              <span className="font-semibold tabular-nums shrink-0">{formatCurrency(item.subtotal)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Buttons */}
      <div className="pt-2 flex items-center justify-between gap-2 border-t border-gray-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          {order.payment_status === 'paid' ? (
            <button
              onClick={onDownloadInvoice}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-slate-700 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              title="Download Tax Invoice PDF"
            >
              <FileText size={13} className="text-brand-primary" /> Invoice PDF
            </button>
          ) : (
            <button
              disabled
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-slate-800 text-xs font-bold text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-60"
              title="Invoice available after payment is marked Paid"
            >
              <FileText size={13} /> Invoice PDF
            </button>
          )}
          <button
            onClick={onOpen}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <Receipt size={13} /> View Details
          </button>
        </div>

        <button
          onClick={onReorder}
          disabled={reordering}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-brand-primary text-white text-xs font-bold shadow-sm shadow-brand-primary/20 hover:opacity-95 active:scale-95 disabled:opacity-50 transition-all"
        >
          <RotateCcw size={13} className={reordering ? 'animate-spin' : ''} />
          {reordering ? 'Adding…' : 'Reorder'}
        </button>
      </div>
    </div>
  )
}

function AccountDetailsCard({
  profile,
}: {
  profile: ProfileData
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-5 shadow-xs">
      <dl className="divide-y divide-gray-100 dark:divide-slate-800">
        <InfoRow icon={<Phone size={16} className="text-brand-primary" />} label="Mobile Number" value={`+91 ${profile.phone}`} />
        <InfoRow icon={<Mail size={16} className="text-brand-primary" />} label="Email Address" value={profile.email ?? 'Not provided'} />
        <InfoRow
          icon={<Cake size={16} className="text-brand-primary" />}
          label="Birthday"
          value={profile.birthday ? formatDate(profile.birthday).split(',')[0] ?? profile.birthday : 'Not provided'}
        />
      </dl>
    </div>
  )
}

function InfoRow({
  icon,
  label,
  value,
  badge,
}: {
  icon: React.ReactNode
  label: string
  value: string
  badge?: string
}) {
  return (
    <div className="flex items-center gap-3.5 py-3 first:pt-0 last:pb-0">
      <span className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">{label}</p>
        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate mt-0.5">{value}</p>
      </div>
      {badge && (
        <span className="text-[11px] font-semibold bg-brand-primary-lighter text-brand-primary px-2.5 py-1 rounded-full shrink-0">
          {badge}
        </span>
      )}
    </div>
  )
}

function EmptyStateCard({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-6 text-center flex flex-col items-center justify-center">
      <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center mb-3">
        {icon}
      </div>
      <h3 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold hover:opacity-95 active:scale-95 transition-all shadow-xs"
        >
          {actionLabel} <ArrowRight size={13} />
        </button>
      )}
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
}
