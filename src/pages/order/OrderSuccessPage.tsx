import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  CheckCircle, Clock, ChefHat, Bell, ArrowLeft, Share2, ShoppingBag,
  XCircle, AlertCircle, Star, Gift, BellRing, VolumeX, FileText,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { useCustomerOrderNotifications } from '@/hooks/useCustomerOrderNotifications'
import { downloadInvoicePDF, type InvoiceShopData } from '@/lib/invoiceGenerator'
import type { Order } from '@/types'
import type { RealtimeChannel } from '@supabase/supabase-js'
import toast from 'react-hot-toast'

const STATUS_STEPS = [
  { key: 'pending',   label: 'Order Placed',      icon: Bell },
  { key: 'confirmed', label: 'Confirmed',         icon: CheckCircle },
  { key: 'preparing', label: 'Being Prepared',    icon: ChefHat },
  { key: 'ready',     label: 'Ready for Pickup',  icon: ShoppingBag },
]

const ORDERS_KEY = (slug: string) => `orderit-orders-${slug}`
const MAX_RECENT_ORDERS = 3
const TTL_MS = 24 * 60 * 60 * 1000

type StoredOrder = { id: string; savedAt: number }

const TERMINAL_STATUSES = new Set(['cancelled', 'completed'])

export default function OrderSuccessPage() {
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>()
  const navigate = useNavigate()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [reviewsEnabled, setReviewsEnabled] = useState(false)
  const [shopData, setShopData] = useState<InvoiceShopData | null>(null)
  const [hasReviewed, setHasReviewed] = useState(false)
  const [hasProfile, setHasProfile] = useState(false)
  const [soundBlocked, setSoundBlocked] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const readyAlertSentRef = useRef(false)

  const { playSound, triggerReadyAlert } = useCustomerOrderNotifications(slug, orderId)

  // Save order ID with timestamp to recent orders in localStorage
  useEffect(() => {
    if (!slug || !orderId) return
    const saved = localStorage.getItem(ORDERS_KEY(slug))
    const entries: StoredOrder[] = saved ? safeParse<StoredOrder[]>(saved, []) : []
    const now = Date.now()
    const fresh = entries.filter((e) => now - e.savedAt < TTL_MS && e.id !== orderId)
    const updated = [{ id: orderId, savedAt: now }, ...fresh].slice(0, MAX_RECENT_ORDERS)
    localStorage.setItem(ORDERS_KEY(slug), JSON.stringify(updated))
  }, [slug, orderId])

  const fetchOrder = useCallback(async () => {
    if (!orderId) return
    const token = localStorage.getItem(`tracking-${orderId}`)
    if (!token) {
      // No token → we cannot resolve this order under the tightened RLS.
      // This is the intended trust boundary: only the browser that placed
      // the order (or received the shareable link with the token) can view it.
      setFetchError(true)
      setLoading(false)
      return
    }

    const { data, error } = await supabase.rpc('get_order_by_token', { p_token: token })
    if (error || !data) {
      setFetchError(true)
      setLoading(false)
      return
    }

    const orderData = data as Order
    setOrder(orderData)
    setFetchError(false)

    if (orderData.status === 'ready' && !readyAlertSentRef.current) {
      readyAlertSentRef.current = true
      triggerReadyAlert(orderData.order_number, orderData.id)
      playSound().then((played) => { if (!played) setSoundBlocked(true) })
    }

    supabase
      .from('shops')
      .select('name, phone, address, tax_percent, currency, logo_url, reviews_enabled')
      .eq('id', orderData.shop_id)
      .single()
      .then(({ data: sd }) => {
        if (sd) {
          setReviewsEnabled(sd.reviews_enabled ?? false)
          setShopData(sd)
        }
      })

    setHasReviewed(!!localStorage.getItem(`review-${orderId}`))
    setHasProfile(!!localStorage.getItem(`orderit-session-${slug}`))

    if (TERMINAL_STATUSES.has(orderData.status)) {
      channelRef.current?.unsubscribe()
      channelRef.current = null
    }
    setLoading(false)
  }, [orderId, slug, playSound, triggerReadyAlert])

  useEffect(() => {
    if (!orderId) return
    fetchOrder()

    // Filtered realtime — only fires for this order.
    const channel = supabase
      .channel(`order-tracking-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        () => { fetchOrder() },
      )
      .subscribe()
    channelRef.current = channel

    return () => { channel.unsubscribe() }
  }, [orderId, fetchOrder])

  const share = useCallback(async () => {
    if (!order) return
    const trackingUrl = `${window.location.origin}/order/${slug}/success/${order.id}`
    const text = `Order ${order.order_number} — Total: ${formatCurrency(order.total)}\nTrack here: ${trackingUrl}`
    if (navigator.share) {
      try { await navigator.share({ title: 'My Order', text, url: trackingUrl }) } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(text)
      toast.success('Order link copied!')
    }
  }, [order, slug])

  const currentStepIdx = STATUS_STEPS.findIndex((s) => s.key === order?.status)
  const isCancelled = order?.status === 'cancelled'
  const isReady     = order?.status === 'ready'
  const isCompleted = order?.status === 'completed'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-brand-primary-light border-t-[var(--brand-primary)] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Loading your order...</p>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center bg-gray-50 dark:bg-slate-950">
        <div>
          {fetchError ? (
            <>
              <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
              <p className="text-gray-700 dark:text-gray-300 font-semibold">Couldn't load your order</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                This order can only be viewed on the device it was placed from.
              </p>
              <button
                onClick={() => { setFetchError(false); setLoading(true); fetchOrder() }}
                className="mt-4 px-4 py-2 bg-brand-primary text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all"
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <p className="text-gray-500 dark:text-gray-400">Order not found</p>
              <button onClick={() => navigate(`/order/${slug}`)} className="mt-4 text-brand-accent">Back to menu</button>
            </>
          )}
        </div>
      </div>
    )
  }

  const handleDownloadInvoice = async () => {
    if (!order) return
    let currentShop = shopData
    if (!currentShop && order.shop_id) {
      const { data } = await supabase
        .from('shops')
        .select('name, phone, address, tax_percent, currency, logo_url')
        .eq('id', order.shop_id)
        .maybeSingle()
      if (data) {
        currentShop = data
        setShopData(data)
      }
    }

    downloadInvoicePDF(
      order,
      currentShop || { name: 'OrderIt Store' },
      {
        name: order.customer_name,
        phone: order.customer_phone,
      }
    )
  }

  const heroBg = isCancelled
    ? 'bg-gradient-to-br from-red-500 to-rose-600'
    : isReady
      ? 'bg-gradient-to-br from-green-500 to-emerald-500'
      : 'gradient-brand-header'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      <div className={`${heroBg} text-white px-4 pt-safe pb-8 transition-all duration-500`}>
        <div className="max-w-lg mx-auto">
          <button onClick={() => navigate(`/order/${slug}`)} className="flex items-center gap-2 text-white/80 hover:text-white pt-4 text-sm font-medium transition-colors">
            <ArrowLeft size={16} /> Back to menu
          </button>
          <div className="pt-2 pb-6 text-center">
            <div className="relative inline-flex">
              <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center mb-4 relative">
                {isReady && (
                  <span className="absolute inset-0 rounded-full bg-white/30 animate-ping pointer-events-none" />
                )}
                {isCancelled ? <XCircle size={48} className="text-white" />
                  : isReady   ? <BellRing size={48} className="text-white animate-bounce" />
                              : <CheckCircle size={48} className="text-white" />}
              </div>
            </div>
            <h1 className="text-2xl font-bold">
              {isCancelled ? 'Order Cancelled' : isReady ? '🎉 Your order is ready!' : isCompleted ? 'Order Completed' : 'Order Placed!'}
            </h1>
            <p className="text-white/80 mt-1 text-sm">
              {isCancelled
                ? 'Sorry, this order was cancelled by the shop. Please place a new order.'
                : isReady
                  ? 'Please collect your order at the counter'
                  : 'We received your order and will prepare it shortly'}
            </p>
          </div>

          <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-5 text-center relative overflow-hidden">
            <p className="text-white/70 text-sm mb-1">Order Number</p>
            <p className="text-4xl font-black tracking-wide">{order.order_number}</p>
            {!isCancelled && <p className="text-white/70 text-xs mt-2">Show this to collect your order</p>}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {soundBlocked && isReady && (
          <div className="bg-slate-900/90 dark:bg-slate-800 border border-slate-700 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-slate-700 text-slate-300 rounded-xl flex items-center justify-center flex-shrink-0">
                <VolumeX size={18} />
              </div>
              <div>
                <p className="font-semibold text-white text-xs">🔇 Sound was muted</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Browser blocked the alert. Tap to enable sound.</p>
              </div>
            </div>
            <button
              onClick={async () => {
                const played = await playSound()
                if (played) setSoundBlocked(false)
              }}
              className="flex-shrink-0 px-3.5 py-2 bg-white text-slate-900 text-xs font-bold rounded-xl transition-all active:scale-95"
            >
              Tap to Play
            </button>
          </div>
        )}

        {!isCompleted && !isCancelled && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-5 shadow-xs">
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm mb-4">Order Status</h2>
            <div className="relative">
              <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gray-100 dark:bg-slate-800" />
              <div className="absolute left-4 top-4 w-0.5 bg-brand-primary transition-all duration-700"
                style={{ height: `${Math.max(0, currentStepIdx) * (100 / (STATUS_STEPS.length - 1))}%` }}
              />
              <div className="space-y-5">
                {STATUS_STEPS.map((step, idx) => {
                  const StepIcon = step.icon
                  const done = idx <= currentStepIdx
                  const active = idx === currentStepIdx
                  return (
                    <div key={step.key} className="flex items-center gap-4 relative">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 transition-all duration-300 ${done ? 'bg-brand-primary text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-500'} ${active ? 'ring-4 ring-brand-primary-light' : ''}`}>
                        <StepIcon size={14} />
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${done ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>{step.label}</p>
                        {active && <p className="text-xs text-brand-primary font-medium animate-pulse">In progress...</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Ordered items breakdown */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Items ordered</h2>
            {order.payment_status === 'paid' ? (
              <button
                onClick={handleDownloadInvoice}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gray-100 dark:bg-slate-800 text-brand-primary text-xs font-bold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                title="Download Tax Invoice PDF"
              >
                <FileText size={13} /> Invoice PDF
              </button>
            ) : (
              <button
                disabled
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-500 text-xs font-bold cursor-not-allowed opacity-60"
                title="Invoice available after payment is marked Paid"
              >
                <FileText size={13} /> Invoice PDF
              </button>
            )}
          </div>
          <div className="divide-y divide-gray-50 dark:divide-slate-800">
            {order.items?.map((item) => (
              <div key={item.id} className="px-4 py-3 flex justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-300">{item.name} <span className="text-gray-400 dark:text-gray-500">×{item.quantity}</span></span>
                <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(item.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 bg-gray-50 dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700 space-y-1.5">
            <Row label="Subtotal" value={formatCurrency(order.subtotal)} />
            {order.packing_charge > 0 && <Row label="Packing Charge" value={formatCurrency(order.packing_charge)} />}
            {order.tax_amount > 0 && <Row label="Tax" value={formatCurrency(order.tax_amount)} />}
            {order.discount_amount > 0 && <Row label="Discount" value={`-${formatCurrency(order.discount_amount)}`} accent="text-green-600" />}
            <div className="flex justify-between font-bold text-gray-900 dark:text-white pt-1.5 border-t border-gray-200 dark:border-slate-700">
              <span>Total</span>
              <span className="text-brand-accent">{formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-4 shadow-xs">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-500 dark:text-gray-400">Payment method</span>
            <span className="font-semibold text-gray-900 dark:text-white capitalize">
              {order.payment_method === 'cash' ? '💵 Pay at Counter' : '📱 UPI / Online'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Payment status</span>
            <span className={`font-semibold capitalize ${order.payment_status === 'paid' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
              {order.payment_status === 'paid' ? '✓ Paid' : 'Pending'}
            </span>
          </div>
          {order.payment_method === 'upi' && order.payment_status !== 'paid' && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-800 flex items-start gap-2 text-xs text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
              <span className="text-base leading-none">📱</span>
              <p>Please pay <strong>{formatCurrency(order.total)}</strong> via UPI at the counter when you collect your order. Show your order number: <strong>{order.order_number}</strong>.</p>
            </div>
          )}
        </div>

        {!isCancelled && !isCompleted && !isReady && (
          <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-100 dark:border-blue-800">
            <Clock size={14} className="text-blue-500 flex-shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-400">This page updates live — no need to refresh.</p>
          </div>
        )}

        {reviewsEnabled && (isReady || isCompleted) && !hasReviewed && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-4 text-center space-y-2">
            <div className="flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => <Star key={s} size={22} className="text-amber-400 fill-amber-400" />)}
            </div>
            <p className="font-semibold text-gray-900 dark:text-white text-sm">How was your experience?</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Your feedback helps us improve</p>
            <button
              onClick={() => navigate(`/order/${slug}/review/${orderId}`)}
              className="mt-1 w-full py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 active:scale-[0.98] transition-all"
            >
              Leave a Review
            </button>
          </div>
        )}

        {!hasProfile && (
          <div className="gradient-brand-light dark:!bg-none dark:!bg-slate-900 rounded-2xl border border-brand-primary-light dark:border-brand-primary-shadow p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-primary-light rounded-xl flex items-center justify-center flex-shrink-0">
              <Gift size={20} className="text-brand-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white text-sm">Get exclusive offers</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Create a free profile to track your orders and receive discounts</p>
            </div>
            <button
              onClick={() => navigate(`/order/${slug}/profile`)}
              className="px-3 py-2 rounded-xl bg-brand-primary text-white text-xs font-semibold hover:opacity-90 transition-colors"
            >
              Create
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {order.payment_status === 'paid' ? (
            <button
              onClick={handleDownloadInvoice}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-brand-primary text-white text-sm font-bold shadow-sm shadow-brand-primary/25 hover:opacity-95 active:scale-95 transition-all"
            >
              <FileText size={16} /> Download PDF
            </button>
          ) : (
            <button
              disabled
              className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-gray-200 dark:bg-slate-800 text-gray-400 dark:text-gray-500 text-sm font-bold cursor-not-allowed opacity-60"
              title="Invoice available once payment is marked Paid"
            >
              <FileText size={16} /> Download PDF
            </button>
          )}
          <button
            onClick={share}
            className="flex items-center justify-center gap-2 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-slate-900 transition-all"
          >
            <Share2 size={16} /> Share order
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className={`flex justify-between text-sm ${accent ?? 'text-gray-500'}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  )
}

function safeParse<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T } catch { return fallback }
}
