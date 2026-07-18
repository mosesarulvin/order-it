import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckCircle, Clock, ChefHat, Bell, ArrowLeft, Share2, ShoppingBag, XCircle, AlertCircle, Star, Gift } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import type { Order } from '@/types'
import type { RealtimeChannel } from '@supabase/supabase-js'
import toast from 'react-hot-toast'

const STATUS_STEPS = [
  { key: 'pending', label: 'Order Placed', icon: Bell },
  { key: 'confirmed', label: 'Confirmed', icon: CheckCircle },
  { key: 'preparing', label: 'Being Prepared', icon: ChefHat },
  { key: 'ready', label: 'Ready for Pickup', icon: ShoppingBag },
]

// Persist recent orders per shop in localStorage (max 3) so customers can track them
const ORDERS_KEY = (slug: string) => `orderit-orders-${slug}`
const MAX_RECENT_ORDERS = 3
const TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

type StoredOrder = { id: string; savedAt: number }

// Statuses where polling should stop
const TERMINAL_STATUSES = new Set(['cancelled', 'completed', 'ready'])

export default function OrderSuccessPage() {
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>()
  const navigate = useNavigate()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [reviewsEnabled, setReviewsEnabled] = useState(false)
  const [hasReviewed, setHasReviewed] = useState(false)
  const [hasProfile, setHasProfile] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Save order ID with timestamp to recent orders in localStorage
  useEffect(() => {
    if (!slug || !orderId) return
    const saved = localStorage.getItem(ORDERS_KEY(slug))
    const entries: StoredOrder[] = saved ? JSON.parse(saved) : []
    const now = Date.now()
    // Drop expired entries and add this order at the front
    const fresh = entries.filter((e) => now - e.savedAt < TTL_MS && e.id !== orderId)
    const updated = [{ id: orderId, savedAt: now }, ...fresh].slice(0, MAX_RECENT_ORDERS)
    localStorage.setItem(ORDERS_KEY(slug), JSON.stringify(updated))
  }, [slug, orderId])

  useEffect(() => {
    if (!orderId) return
    fetchOrder()

    // Realtime subscription — instant status updates, no battery-draining polling
    const channel = supabase
      .channel(`order-tracking-${orderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, () => {
        fetchOrder()
      })
      .subscribe()
    channelRef.current = channel

    return () => { channel.unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  const fetchOrder = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('id', orderId!)
      .single()
    if (error) {
      setFetchError(true)
      setLoading(false)
      return
    }
    if (data) {
      setOrder(data as Order)
      setFetchError(false)
      // Fetch shop reviews_enabled flag
      supabase.from('shops').select('reviews_enabled').eq('id', data.shop_id).single()
        .then(({ data: sd }) => { if (sd) setReviewsEnabled(sd.reviews_enabled ?? false) })
      // Check localStorage to see if already reviewed
      const reviewed = localStorage.getItem(`review-${orderId}`)
      if (reviewed) setHasReviewed(true)
      // Check if customer has a profile
      const profileId = localStorage.getItem(`profile-${slug}`)
      if (profileId) setHasProfile(true)
      // Unsubscribe once order reaches a terminal state — no more updates expected
      if (TERMINAL_STATUSES.has(data.status)) {
        channelRef.current?.unsubscribe()
        channelRef.current = null
      }
    }
    setLoading(false)
  }

  const share = async () => {
    if (!order) return
    const trackingUrl = `${window.location.origin}/order/${slug}/success/${order.id}`
    const text = `Order ${order.order_number} — Total: ₹${order.total}\nTrack here: ${trackingUrl}`
    if (navigator.share) {
      await navigator.share({ title: 'My Order', text, url: trackingUrl })
    } else {
      navigator.clipboard.writeText(text)
      toast.success('Order link copied!')
    }
  }

  const currentStepIdx = STATUS_STEPS.findIndex((s) => s.key === order?.status)
  const isCancelled = order?.status === 'cancelled'
  const isReady = order?.status === 'ready'
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
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Check your connection and try again</p>
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

  const heroBg = isCancelled
    ? 'bg-gradient-to-br from-red-500 to-rose-600'
    : isReady
      ? 'bg-gradient-to-br from-green-500 to-emerald-500'
      : 'gradient-brand-header'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      {/* Hero */}
      <div className={`${heroBg} text-white px-4 pt-safe pb-8 transition-all duration-500`}>
        <div className="max-w-lg mx-auto">
          <div className="pt-4 pb-6 text-center">
            <div className="relative inline-flex">
              <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center mb-4">
                {isCancelled
                  ? <XCircle size={48} className="text-white" />
                  : isReady
                    ? <ShoppingBag size={48} className="text-white" />
                    : <CheckCircle size={48} className="text-white" />
                }
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

          {/* Order number card */}
          <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-5 text-center">
            <p className="text-white/70 text-sm mb-1">Order Number</p>
            <p className="text-4xl font-black tracking-wide">{order.order_number}</p>
            {!isCancelled && (
              <p className="text-white/70 text-xs mt-2">Show this to collect your order</p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {/* Cancelled state */}
        {isCancelled && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 text-center">
            <XCircle size={32} className="text-red-400 mx-auto mb-2" />
            <p className="text-red-700 dark:text-red-400 font-semibold text-sm">This order has been cancelled</p>
            {order.cancellation_reason ? (
              <p className="text-red-500 dark:text-red-400 text-xs mt-1.5 bg-red-100 dark:bg-red-900/30 rounded-xl px-3 py-2">
                <span className="font-medium">Reason:</span> {order.cancellation_reason}
              </p>
            ) : (
              <p className="text-red-500 dark:text-red-400 text-xs mt-1">Please contact the shop or place a new order</p>
            )}
            <button
              onClick={() => navigate(`/order/${slug}`)}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-brand-primary text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all"
            >
              <ShoppingBag size={14} /> Place New Order
            </button>
          </div>
        )}
        {!isCompleted && !isCancelled && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-5">
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
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 transition-all duration-300 ${done ? 'bg-brand-primary text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-500'
                        } ${active ? 'ring-4 ring-brand-primary-light' : ''}`}>
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

        {/* Items summary */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-800">
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Items ordered</h2>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-slate-800">
            {order.items?.map((item) => (
              <div key={item.id} className="px-4 py-3 flex justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-300">{item.name} <span className="text-gray-400 dark:text-gray-500">×{item.quantity}</span></span>
                <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(item.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 bg-gray-50 dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700 flex justify-between font-bold">
            <span className="text-gray-900 dark:text-white">Total</span>
            <span className="text-brand-accent">{formatCurrency(order.total)}</span>
          </div>
        </div>

        {/* Payment info */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-500 dark:text-gray-400">Payment method</span>
            <span className="font-semibold text-gray-900 dark:text-white capitalize">{order.payment_method === 'cash' ? '💵 Pay at Counter' : '📱 UPI / Online'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Payment status</span>
            <span className={`font-semibold capitalize ${order.payment_status === 'paid' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
              {order.payment_status === 'paid' ? '✓ Paid' : 'Pending'}
            </span>
          </div>
          {/* UPI instruction — shown when payment is pending */}
          {order.payment_method === 'upi' && order.payment_status !== 'paid' && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-800 flex items-start gap-2 text-xs text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
              <span className="text-base leading-none">📱</span>
              <p>Please pay <strong>{formatCurrency(order.total)}</strong> via UPI at the counter when you collect your order. Show your order number: <strong>{order.order_number}</strong>.</p>
            </div>
          )}
        </div>

        {/* Auto-refresh note — only while order is active */}
        {!isCancelled && !isCompleted && !isReady && (
          <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-100 dark:border-blue-800">
            <Clock size={14} className="text-blue-500 flex-shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-400">This page updates live — no need to refresh.</p>
          </div>
        )}

        {/* Review prompt — shown when order is ready/completed and reviews are enabled */}
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

        {/* Profile creation banner — shown for orders without a profile */}
        {!hasProfile && (
          <div className="gradient-brand-light dark:!bg-none dark:!bg-slate-900 rounded-2xl border border-brand-primary-light dark:border-brand-primary-shadow p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-primary-light rounded-xl flex items-center justify-center flex-shrink-0">
              <Gift size={20} className="text-brand-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white text-sm">Get exclusive offers</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Create a profile to get a welcome discount &amp; see your order history</p>
            </div>
            <button
              onClick={() => {
                const searchParams = new URLSearchParams()
                if (order.customer_name) searchParams.set('name', order.customer_name)
                if (order.customer_phone) searchParams.set('phone', order.customer_phone)
                navigate(`/order/${slug}/profile?${searchParams.toString()}`)
              }}
              className="flex-shrink-0 px-3 py-1.5 rounded-xl bg-brand-primary text-white text-xs font-semibold hover:opacity-90 transition-colors"
            >
              Join
            </button>
          </div>
        )}

        {/* Actions — hide "Order More" for cancelled since the card above already has a CTA */}
        {!isCancelled && (
          <div className="flex gap-3">
            <button
              onClick={() => navigate(`/order/${slug}`)}
              className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl border-2 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 text-sm font-semibold hover:border-gray-300 dark:hover:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all"
            >
              <ArrowLeft size={16} /> Order More
            </button>
            {!isCancelled && (
              <button
                onClick={share}
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-brand-primary-lighter dark:bg-brand-primary-shadow text-brand-primary-dark dark:text-brand-primary-light text-sm font-semibold hover:bg-brand-primary-light dark:hover:opacity-90 transition-all"
              >
                <Share2 size={16} /> Share Receipt
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
