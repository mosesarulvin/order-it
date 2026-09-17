import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Minus, Plus, Trash2, ChevronRight, ShoppingBag, Clock, Tag, X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { useCartStore } from '@/store/cartStore'
import { Button } from '@/components/ui/Button'
import { getSessionToken, getCachedIdentity } from '@/lib/customerSession'
import { placeCustomerOrder, fetchCustomerRewards, humanizeError, type CustomerRewards } from '@/lib/api/customerOrders'
import type { PaymentMethod } from '@/types'
import toast from 'react-hot-toast'

interface ShopMeta {
  id:               string
  tax_percent:      number
  is_open:          boolean
  ordering_enabled: boolean
  coupons_enabled:  boolean
  accepts_upi:      boolean
  accepts_cash:     boolean
}

interface CouponPreview {
  code:             string
  type:             'percentage' | 'fixed'
  value:            number
  min_order_amount: number
}

export default function CheckoutPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const [shop, setShop] = useState<ShopMeta | null>(null)
  const [shopLoaded, setShopLoaded] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<CouponPreview | null>(null)
  const [couponLoading, setCouponLoading] = useState(false)
  
  const [rewards, setRewards] = useState<CustomerRewards | null>(null)
  const [usePoints, setUsePoints] = useState(false)

  const orderPlacedRef = useRef(false)

  const identity = slug ? getCachedIdentity(slug) : null
  const sessionToken = slug ? getSessionToken(slug) : null

  const {
    items, updateQuantityAt, removeItemAt, getTotalPrice, clearCart,
    orderType, setOrderType, getPackingCharge,
  } = useCartStore()

  // Load shop metadata.
  useEffect(() => {
    if (!slug) return
    let cancelled = false
    supabase
      .from('shops')
      .select('id, tax_percent, is_open, ordering_enabled, coupons_enabled, accepts_upi, accepts_cash')
      .eq('slug', slug)
      .single()
      .then(({ data }) => {
        if (cancelled) return
        if (data) {
          setShop(data)
          if (data.accepts_upi && !data.accepts_cash) setPaymentMethod('upi')
          else if (!data.accepts_upi && data.accepts_cash) setPaymentMethod('cash')
        }
        setShopLoaded(true)
      })

    if (sessionToken) {
      fetchCustomerRewards(sessionToken).then((res) => {
        if (!cancelled && res) setRewards(res)
      })
    }

    return () => { cancelled = true }
  }, [slug, sessionToken])

  // If the shop has disabled online ordering, bounce the customer back to the menu.
  useEffect(() => {
    if (shop && shop.ordering_enabled === false && slug) {
      toast.error('This menu is view-only — please order at the counter')
      navigate(`/order/${slug}`, { replace: true })
    }
  }, [shop, slug, navigate])

  // Auto-apply pending profile coupon (set by "Use Now" button on dashboard).
  useEffect(() => {
    if (!slug || !shop || appliedCoupon) return
    const pending = localStorage.getItem(`pending-coupon-${slug}`)
    if (!pending) return

    supabase.rpc('preview_coupon', { p_shop_id: shop.id, p_code: pending })
      .then(({ data }) => {
        if (data) {
          setAppliedCoupon(data as CouponPreview)
          setCouponInput((data as CouponPreview).code)
          localStorage.removeItem(`pending-coupon-${slug}`)
        }
      })
  }, [slug, shop, appliedCoupon])

  // Redirect to menu if cart is empty.
  useEffect(() => {
    if (items.length === 0 && slug && !orderPlacedRef.current) {
      navigate(`/order/${slug}`, { replace: true })
    }
  }, [items.length, slug, navigate])

  const subtotal        = getTotalPrice()
  const packingCharge   = getPackingCharge()
  const taxPercent      = shop?.tax_percent ?? 0
  const taxAmount       = useMemo(
    () => Math.round((subtotal + packingCharge) * taxPercent) / 100,
    [subtotal, packingCharge, taxPercent],
  )
  const discountAmount  = useMemo(() => {
    let amt = 0
    if (appliedCoupon) {
      amt += appliedCoupon.type === 'percentage'
        ? Math.round((subtotal + packingCharge) * appliedCoupon.value) / 100
        : Math.min(appliedCoupon.value, subtotal + packingCharge)
    }
    return amt
  }, [appliedCoupon, subtotal, packingCharge])

  // Points redemption calculation (Max points usable is limited by order total minus other discounts)
  const { maxPointsUsable, pointsDiscount } = useMemo(() => {
    if (!rewards?.program?.is_enabled || !usePoints) return { maxPointsUsable: 0, pointsDiscount: 0 }
    if (rewards.balance < rewards.program.min_redeem_points) return { maxPointsUsable: 0, pointsDiscount: 0 }
    
    const prePointsTotal = Math.max(0, subtotal + packingCharge + taxAmount - discountAmount)
    const redeemRate = rewards.program.redeem_rate || 10
    
    // How many points needed to cover the entire prePointsTotal?
    const pointsToCoverTotal = prePointsTotal * redeemRate
    
    // We can only use up to our balance, and up to the order total
    const pointsToUse = Math.min(rewards.balance, pointsToCoverTotal)
    
    return {
      maxPointsUsable: Math.floor(pointsToUse),
      pointsDiscount: Math.floor(pointsToUse) / redeemRate
    }
  }, [rewards, usePoints, subtotal, packingCharge, taxAmount, discountAmount])

  const total = Math.max(0, subtotal + packingCharge + taxAmount - discountAmount - pointsDiscount)

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase()
    if (!code || !shop) return
    setCouponLoading(true)
    try {
      const { data, error } = await supabase.rpc('preview_coupon', { p_shop_id: shop.id, p_code: code })
      if (error || !data) { toast.error('Invalid or inactive coupon code'); return }
      const c = data as CouponPreview
      if (subtotal < c.min_order_amount) {
        toast.error(`Minimum order of ${formatCurrency(c.min_order_amount)} required for this coupon`)
        return
      }
      setAppliedCoupon(c)
      toast.success('Coupon applied! 🎉')
    } finally {
      setCouponLoading(false)
    }
  }

  const removeCoupon = () => { setAppliedCoupon(null); setCouponInput('') }

  const onSubmit = async () => {
    if (!shop) { toast.error('Shop not loaded'); return }
    if (items.length === 0) { toast.error('Your cart is empty'); return }
    if (!shop.accepts_upi && !shop.accepts_cash) {
      toast.error('No payment methods are available for this shop')
      return
    }
    if (!sessionToken) {
      toast.error('Please sign in to continue')
      navigate(`/order/${slug}/profile`, { replace: true })
      return
    }

    setLoading(true)
    try {
      const placed = await placeCustomerOrder({
        shopId:        shop.id,
        sessionToken:  sessionToken,
        items,
        orderType,
        paymentMethod,
        notes:         notes.trim() || null,
        couponCode:    appliedCoupon?.code ?? null,
        isAnonymous:  false,
        pointsToRedeem: usePoints ? maxPointsUsable : 0,
      })

      orderPlacedRef.current = true
      localStorage.setItem(`tracking-${placed.order_id}`, placed.tracking_token)
      clearCart()
      navigate(`/order/${slug}/success/${placed.order_id}`)
    } catch (err) {
      toast.error(humanizeError(err))
    } finally {
      setLoading(false)
    }
  }

  if (!shopLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950">
        <div className="w-10 h-10 border-4 border-brand-primary-light border-t-[var(--brand-primary)] rounded-full animate-spin" />
      </div>
    )
  }

  if (shop && !shop.is_open && !items.every((ci) => ci.menu_item.is_instant)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center bg-gray-50 dark:bg-slate-950">
        <div>
          <div className="w-20 h-20 bg-brand-primary-lighter dark:bg-brand-primary-shadow rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock size={40} className="text-brand-primary" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Shop is currently closed</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Orders are not being accepted right now.</p>
          <button onClick={() => navigate(`/order/${slug}`)} className="mt-4 text-brand-accent dark:text-brand-primary font-medium">
            ← Back to menu
          </button>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center bg-gray-50 dark:bg-slate-950">
        <div>
          <ShoppingBag size={64} className="text-gray-200 dark:text-slate-700 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Your cart is empty</h2>
          <button onClick={() => navigate(`/order/${slug}`)} className="mt-4 text-brand-accent dark:text-brand-primary font-medium">
            ← Back to menu
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => navigate(`/order/${slug}`)}
            className="p-2 -ml-2 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-bold text-gray-900 dark:text-white">Checkout</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4 pb-32">
        {/* Cart items */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Your order</h2>
            {/* <button
              onClick={() => navigate(`/order/${slug}`)}
              className="inline-flex items-center gap-1 text-xs font-bold text-brand-primary hover:opacity-80 transition-opacity"
            >
              <Plus size={14} /> Add more items
            </button> */}
          </div>
          <div className="divide-y divide-gray-50 dark:divide-slate-800">
            {items.map((ci, idx) => {
              const unit = (ci.variant?.price ?? ci.menu_item.price)
                + (ci.customizations?.reduce((s, c) => s + (c.price || 0), 0) || 0)
              return (
                <div key={`${ci.menu_item.id}-${idx}`} className="px-4 py-3 flex items-center gap-3">
                  {ci.menu_item.image_url ? (
                    <img src={ci.menu_item.image_url} alt={ci.menu_item.name} loading="lazy" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-brand-primary-lighter flex items-center justify-center flex-shrink-0 text-xl">🍽️</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{ci.menu_item.name}</p>
                    {ci.variant && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {ci.variant.size} {ci.variant.unit || ci.menu_item.unit || ''}
                      </div>
                    )}
                    {ci.customizations.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {ci.customizations.map((c, i) => (
                          <span key={i} className="text-xs bg-brand-accent-light dark:bg-brand-primary-shadow text-brand-primary-dark dark:text-brand-primary px-1.5 py-0.5 rounded-full">
                            {c.choice} {c.price > 0 && `(+₹${c.price})`}
                          </span>
                        ))}
                      </div>
                    )}
                    {(() => {
                      const baseOrig = ci.variant?.original_price ?? ci.menu_item.original_price
                      const customizationsPrice = ci.customizations?.reduce((s, c) => s + (c.price || 0), 0) || 0
                      const unitOrig = baseOrig ? baseOrig + customizationsPrice : undefined
                      
                      return unitOrig ? (
                        <p className="text-sm mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-gray-400 line-through">{formatCurrency(unitOrig)}</span>
                          <span className="font-bold text-orange-600 dark:text-orange-400">{formatCurrency(unit)}</span>
                        </p>
                      ) : (
                        <p className="text-sm font-semibold text-brand-accent dark:text-brand-primary mt-0.5">
                          {formatCurrency(unit)}
                        </p>
                      )
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-slate-800 rounded-xl p-1">
                      <button
                        onClick={() => updateQuantityAt(idx, ci.quantity - 1)}
                        className="w-6 h-6 flex items-center justify-center rounded-lg bg-white dark:bg-slate-700 text-gray-500 dark:text-gray-300 shadow-sm text-xs"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-4 text-center text-sm font-bold dark:text-white">{ci.quantity}</span>
                      <button
                        onClick={() => updateQuantityAt(idx, ci.quantity + 1)}
                        className="w-6 h-6 flex items-center justify-center rounded-lg bg-brand-primary text-white shadow-sm text-xs"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <button onClick={() => removeItemAt(idx)} className="p-1.5 text-gray-300 dark:text-gray-500 hover:text-red-400 dark:hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="p-3 bg-gray-50/70 dark:bg-slate-800/40 border-t border-gray-100 dark:border-slate-800">
            <button
              onClick={() => navigate(`/order/${slug}`)}
              className="w-full py-2 px-3 border border-dashed border-brand-primary/40 hover:border-brand-primary text-brand-primary bg-brand-primary/5 dark:bg-brand-primary/10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.99]"
            >
              <Plus size={14} /> Add more items from menu
            </button>
          </div>

          {/* Totals */}
          <div className="px-4 py-3 bg-gray-50 dark:bg-slate-800 space-y-1.5 border-t border-gray-100 dark:border-slate-700">
            <Row label="Subtotal" value={formatCurrency(subtotal)} />
            {packingCharge > 0 && <Row label="Packing Charge" value={formatCurrency(packingCharge)} />}
            {taxAmount    > 0 && <Row label={`Tax (${taxPercent}%)`} value={formatCurrency(taxAmount)} />}
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-green-600 dark:text-green-400 font-medium">
                <span className="flex items-center gap-1"><Tag size={12} /> {appliedCoupon?.code}</span>
                <span>−{formatCurrency(discountAmount)}</span>
              </div>
            )}
            {pointsDiscount > 0 && (
              <div className="flex justify-between text-sm text-green-600 dark:text-green-400 font-medium mt-1">
                <span>Points Redeemed ({maxPointsUsable} pts)</span>
                <span>−{formatCurrency(pointsDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 dark:text-white pt-1 border-t border-gray-200 dark:border-slate-600">
              <span>Total Amount</span><span className="text-brand-accent dark:text-brand-primary">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Rewards Points */}
          {rewards?.program?.is_enabled && rewards.balance > 0 && rewards.balance >= (rewards.program.min_redeem_points || 100) && (
            <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
                    🏆
                  </span>
                  Use Points
                </h3>
                <p className="text-xs text-gray-500 mt-1">Balance: {rewards.balance} pts</p>
              </div>
              <button
                onClick={() => setUsePoints(!usePoints)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  usePoints ? 'bg-orange-500' : 'bg-gray-200 dark:bg-slate-700'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  usePoints ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          )}

          {/* Coupon */}
          {shop?.coupons_enabled && (
            <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900">
              {appliedCoupon ? (
                <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm font-medium">
                    <Tag size={14} />
                    <span>{appliedCoupon.code} · saving {formatCurrency(discountAmount)}</span>
                  </div>
                  <button onClick={removeCoupon} className="text-green-600 dark:text-green-500 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Coupon code"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && applyCoupon()}
                    className="flex-1 h-9 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm outline-none focus-brand transition-colors uppercase placeholder:normal-case"
                  />
                  <button
                    onClick={applyCoupon}
                    disabled={couponLoading || !couponInput.trim()}
                    className="px-4 h-9 rounded-xl bg-brand-primary-lighter text-brand-accent text-sm font-semibold hover:bg-brand-primary-light disabled:opacity-40 transition-colors"
                  >
                    {couponLoading ? '...' : 'Apply'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Order type + payment */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-4 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm mb-2">Order Type</h2>
            <div className="flex gap-2">
              {(['dine_in', 'takeaway'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setOrderType(t)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border ${orderType === t ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-slate-700'}`}
                >
                  {t === 'dine_in' ? 'Dine-in' : 'Takeaway'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm mb-2">Payment</h2>
            <div className="flex gap-2">
              {shop?.accepts_cash && (
                <button
                  onClick={() => setPaymentMethod('cash')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border ${paymentMethod === 'cash' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-slate-700'}`}
                >
                  💵 Cash
                </button>
              )}
              {shop?.accepts_upi && (
                <button
                  onClick={() => setPaymentMethod('upi')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border ${paymentMethod === 'upi' ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-slate-700'}`}
                >
                  📱 UPI
                </button>
              )}
            </div>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm mb-2">Notes (optional)</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 200))}
              placeholder="Any special instructions?"
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm outline-none focus-brand resize-none"
            />
          </div>
        </div>

        {identity && (
          <p className="text-xs text-center text-gray-500 dark:text-gray-400">
            Ordering as <strong>{identity.name}</strong> ({identity.phone})
          </p>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 px-4 py-3">
        <div className="max-w-lg mx-auto">
          <Button
            onClick={onSubmit}
            loading={loading}
            className="w-full"
            size="lg"
          >
            Place Order · {formatCurrency(total)} <ChevronRight size={18} />
          </Button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
      <span>{label}</span><span>{value}</span>
    </div>
  )
}
