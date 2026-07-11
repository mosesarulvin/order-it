import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Minus, Plus, Trash2, User, Phone, Wallet, Banknote, ChevronRight, ShoppingBag, Clock, EyeOff, Tag, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, generateOrderNumber } from '@/lib/utils'
import { useCartStore } from '@/store/cartStore'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import type { Coupon, PaymentMethod } from '@/types'
import toast from 'react-hot-toast'

// Base schema — phone validation added dynamically based on anonymous toggle
const baseSchema = z.object({
  customer_name: z.string().min(2, 'Enter your name'),
  customer_phone: z.string().optional(),
  notes: z.string().max(200, 'Notes must be 200 characters or less').optional(),
})

type FormData = z.infer<typeof baseSchema>

export default function CheckoutPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [loading, setLoading] = useState(false)
  const [shopId, setShopId] = useState<string | null>(null)
  const [taxPercent, setTaxPercent] = useState(0)
  const [shopOpen, setShopOpen] = useState<boolean | null>(null)
  const [couponsEnabled, setCouponsEnabled] = useState(true)
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null)
  const [couponLoading, setCouponLoading] = useState(false)
  const orderPlacedRef = useRef(false)
  const { items, updateQuantityAt, removeItemAt, getTotalPrice, clearCart } = useCartStore()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(baseSchema),
  })

  // Fetch shop tax upfront so the displayed total is accurate
  useEffect(() => {
    if (!slug) return
    supabase.from('shops').select('id, tax_percent, is_open, coupons_enabled').eq('slug', slug).single()
      .then(({ data }) => {
        if (data) { setShopId(data.id); setTaxPercent(data.tax_percent); setShopOpen(data.is_open); setCouponsEnabled(data.coupons_enabled ?? true) }
        else { setShopOpen(false) }
      })
  }, [slug])

  // Auto-apply profile welcome coupon if customer has a profile with an unused coupon
  useEffect(() => {
    if (!slug) return
    if (appliedCoupon) return
    const profileId = localStorage.getItem(`profile-${slug}`)
    // Check for a coupon hint set by "Use Now" on ProfileDashboardPage
    const pendingCoupon = localStorage.getItem(`pending-coupon-${slug}`)
    const couponCodeToApply = pendingCoupon || null

    const applyCode = (code: string) => {
      if (!shopId) return
      supabase
        .from('coupons')
        .select('*')
        .eq('code', code)
        .eq('shop_id', shopId)
        .eq('is_active', true)
        .maybeSingle()
        .then(({ data: coupon }) => {
          if (coupon) {
            setCouponInput(coupon.code)
            setAppliedCoupon(coupon as import('@/types').Coupon)
            if (pendingCoupon) localStorage.removeItem(`pending-coupon-${slug}`)
          }
        })
    }

    if (couponCodeToApply) {
      applyCode(couponCodeToApply)
      return
    }

    if (!profileId) return
    supabase
      .from('profile_coupons')
      .select('coupon_code, coupon_id')
      .eq('profile_id', profileId)
      .is('used_at', null)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data?.coupon_code) return
        applyCode(data.coupon_code)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // Redirect to menu if cart is empty (e.g. direct URL access)
  // Skip if an order was just placed — navigate() to success page will take over
  useEffect(() => {
    if (items.length === 0 && slug && !orderPlacedRef.current) {
      navigate(`/order/${slug}`, { replace: true })
    }
  }, [items.length, slug, navigate])

  const subtotal = getTotalPrice()
  const taxAmount = Math.round(subtotal * taxPercent) / 100
  const discountAmount = appliedCoupon
    ? appliedCoupon.type === 'percentage'
      ? Math.round(subtotal * appliedCoupon.value) / 100
      : Math.min(appliedCoupon.value, subtotal)
    : 0
  const total = Math.max(0, subtotal + taxAmount - discountAmount)

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase()
    if (!code) return
    if (!shopId) { toast.error('Shop not loaded yet'); return }
    setCouponLoading(true)
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('shop_id', shopId)
      .eq('code', code)
      .eq('is_active', true)
      .single()
    setCouponLoading(false)
    if (error || !data) { toast.error('Invalid or inactive coupon code'); return }
    if (data.expires_at && new Date(data.expires_at) < new Date()) { toast.error('This coupon has expired'); return }
    if (data.max_uses !== null && data.used_count >= data.max_uses) { toast.error('This coupon has reached its usage limit'); return }
    if (subtotal < data.min_order_amount) {
      toast.error(`Minimum order of ${formatCurrency(data.min_order_amount)} required for this coupon`)
      return
    }
    setAppliedCoupon(data as Coupon)
    toast.success(`Coupon applied! 🎉`)
  }

  const removeCoupon = () => { setAppliedCoupon(null); setCouponInput('') }

  const onSubmit = async (data: FormData) => {
    if (items.length === 0) { toast.error('Your cart is empty'); return }
    if (!shopId) { toast.error('Shop not found'); return }

    // Re-validate coupon min_order_amount at submit time (cart may have changed since coupon applied)
    if (appliedCoupon) {
      const currentSubtotal = getTotalPrice()
      if (currentSubtotal < appliedCoupon.min_order_amount) {
        toast.error(`Coupon requires a minimum order of ${formatCurrency(appliedCoupon.min_order_amount)}`)
        setAppliedCoupon(null)
        setCouponInput('')
        return
      }
    }

    // Phone validation when not anonymous
    if (!isAnonymous) {
      const phone = data.customer_phone || ''
      if (!/^[6-9]\d{9}$/.test(phone)) {
        toast.error('Enter a valid 10-digit Indian mobile number')
        return
      }
    }

    setLoading(true)

    try {
      // Re-validate availability
      const itemIds = items.map((ci) => ci.menu_item.id)
      const { data: menuItems, error: availErr } = await supabase
        .from('menu_items')
        .select('id, is_available, name, is_instant, stock_quantity')
        .in('id', itemIds)
      if (availErr) throw new Error('Could not verify item availability')
      const unavailable = (menuItems ?? []).filter((m) => !m.is_available)
      if (unavailable.length > 0) {
        toast.error(`Some items are no longer available: ${unavailable.map((m) => m.name).join(', ')}`)
        setLoading(false)
        return
      }

      // Check stock for tracked items
      for (const ci of items) {
        const m = (menuItems ?? []).find((m) => m.id === ci.menu_item.id)
        if (m && m.stock_quantity !== null && ci.quantity > m.stock_quantity) {
          toast.error(`Not enough stock for "${ci.menu_item.name}" (only ${m.stock_quantity} left)`)
          setLoading(false)
          return
        }
      }

      // If every item is instant → order goes straight to 'ready'
      const allInstant = (menuItems ?? []).every((m) => m.is_instant)
      const orderStatus = allInstant ? 'ready' : 'pending'

      const orderNumber = generateOrderNumber()

      const profileId = localStorage.getItem(`profile-${slug}`)

      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          shop_id: shopId,
          order_number: orderNumber,
          customer_name: data.customer_name,
          customer_phone: isAnonymous ? 'Anonymous' : (data.customer_phone || ''),
          notes: data.notes || null,
          status: orderStatus,
          payment_method: paymentMethod,
          payment_status: 'pending',
          is_anonymous: isAnonymous,
          order_source: 'qr',
          coupon_code: appliedCoupon?.code ?? null,
          discount_amount: discountAmount,
          subtotal,
          tax_amount: taxAmount,
          total,
          customer_profile_id: profileId || null,
        })
        .select()
        .single()

      if (orderErr || !order) throw new Error(orderErr?.message || 'Failed to create order')

      // Insert order items with customizations
      const orderItems = items.map((ci) => ({
        order_id: order.id,
        menu_item_id: ci.menu_item.id,
        name: ci.menu_item.name,
        price: ci.menu_item.price,
        quantity: ci.quantity,
        subtotal: ci.menu_item.price * ci.quantity,
        customizations: ci.customizations ?? [],
      }))

      const { error: itemsErr } = await supabase.from('order_items').insert(orderItems)
      if (itemsErr) throw new Error(itemsErr.message)

      // Deduct stock for tracked items
      for (const ci of items) {
        const m = (menuItems ?? []).find((m) => m.id === ci.menu_item.id)
        if (m && m.stock_quantity !== null) {
          await supabase
            .from('menu_items')
            .update({ stock_quantity: Math.max(0, m.stock_quantity - ci.quantity) })
            .eq('id', ci.menu_item.id)
          await supabase.from('stock_logs').insert({
            shop_id: shopId,
            menu_item_id: ci.menu_item.id,
            item_name: ci.menu_item.name,
            delta: -ci.quantity,
            reason: 'order',
            note: orderNumber,
          })
        }
      }

      // Increment coupon usage
      if (appliedCoupon) {
        await supabase
          .from('coupons')
          .update({ used_count: appliedCoupon.used_count + 1 })
          .eq('id', appliedCoupon.id)

        // Mark profile coupon as used if it came from a profile
        const profileId = localStorage.getItem(`profile-${slug}`)
        if (profileId) {
          await supabase
            .from('profile_coupons')
            .update({ used_at: new Date().toISOString(), used_order_id: order.id })
            .eq('profile_id', profileId)
            .eq('coupon_code', appliedCoupon.code)
            .is('used_at', null)
        }
      }

      orderPlacedRef.current = true
      clearCart()
      navigate(`/order/${slug}/success/${order.id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  // Still loading shop info — show spinner instead of the form
  if (shopOpen === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (shopOpen === false && !items.every((ci) => ci.menu_item.is_instant)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center bg-gray-50">
        <div>
          <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock size={40} className="text-orange-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Shop is currently closed</h2>
          <p className="text-sm text-gray-500 mt-1">Orders are not being accepted right now.</p>
          <button onClick={() => navigate(`/order/${slug}`)} className="mt-4 text-orange-600 font-medium">
            ← Back to menu
          </button>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center bg-gray-50">
        <div>
          <ShoppingBag size={64} className="text-gray-200 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Your cart is empty</h2>
          <button
            onClick={() => navigate(`/order/${slug}`)}
            className="mt-4 text-orange-600 font-medium"
          >
            ← Back to menu
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => navigate(`/order/${slug}`)}
            className="p-2 -ml-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-bold text-gray-900">Checkout</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4 pb-32">
        {/* Cart items */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900 text-sm">Your order</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {items.map((ci, idx) => (
              <div key={`${ci.menu_item.id}-${idx}`} className="px-4 py-3 flex items-center gap-3">
                {ci.menu_item.image_url ? (
                  <img src={ci.menu_item.image_url} alt={ci.menu_item.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0 text-xl">🍽️</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{ci.menu_item.name}</p>
                  {ci.customizations.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ci.customizations.map((c, i) => (
                        <span key={i} className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">{c.choice}</span>
                      ))}
                    </div>
                  )}
                  <p className="text-sm font-semibold text-orange-600 mt-0.5">{formatCurrency(ci.menu_item.price)}</p>
                </div>
                  <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-gray-50 rounded-xl p-1">
                    <button
                      onClick={() => updateQuantityAt(idx, ci.quantity - 1)}
                      className="w-6 h-6 flex items-center justify-center rounded-lg bg-white text-gray-500 shadow-sm text-xs"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="w-4 text-center text-sm font-bold">{ci.quantity}</span>
                    <button
                      onClick={() => updateQuantityAt(idx, ci.quantity + 1)}
                      className="w-6 h-6 flex items-center justify-center rounded-lg bg-orange-500 text-white shadow-sm text-xs"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <button onClick={() => removeItemAt(idx)} className="p-1.5 text-gray-300 hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 bg-gray-50 space-y-1.5 border-t border-gray-100">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
            </div>
            {taxAmount > 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>Tax ({taxPercent}%)</span><span>{formatCurrency(taxAmount)}</span>
              </div>
            )}
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-green-600 font-medium">
                <span className="flex items-center gap-1"><Tag size={12} /> {appliedCoupon?.code}</span>
                <span>−{formatCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-200">
              <span>Total</span><span className="text-orange-600">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Coupon input — only shown when coupons are enabled for this shop */}
          {couponsEnabled && (
          <div className="px-4 py-3 border-t border-gray-100">
            {appliedCoupon ? (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
                  <Tag size={14} />
                  <span>{appliedCoupon.code} · saving {formatCurrency(discountAmount)}</span>
                </div>
                <button onClick={removeCoupon} className="text-green-600 hover:text-red-500 transition-colors">
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
                  className="flex-1 h-9 px-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-orange-400 transition-colors uppercase placeholder:normal-case"
                />
                <button
                  onClick={applyCoupon}
                  disabled={couponLoading || !couponInput.trim()}
                  className="px-4 h-9 rounded-xl bg-orange-50 text-orange-600 text-sm font-semibold hover:bg-orange-100 disabled:opacity-40 transition-colors"
                >
                  {couponLoading ? '...' : 'Apply'}
                </button>
              </div>
            )}
          </div>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
          <h2 className="font-semibold text-gray-900 text-sm">Your details</h2>
          <Input
            label="Your name"
            placeholder="e.g. Arjun Kumar"
            icon={<User size={16} />}
            error={errors.customer_name?.message}
            {...register('customer_name')}
          />
          {!isAnonymous && (
            <Input
              label="Phone number"
              type="tel"
              placeholder="98765 43210"
              icon={<Phone size={16} />}
              error={errors.customer_phone?.message}
              {...register('customer_phone')}
            />
          )}
          {/* Anonymous toggle */}
          <button
            type="button"
            onClick={() => setIsAnonymous((v) => !v)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${
              isAnonymous ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center gap-2">
              <EyeOff size={15} className={isAnonymous ? 'text-blue-600' : 'text-gray-400'} />
              <span className={`text-sm font-medium ${isAnonymous ? 'text-blue-700' : 'text-gray-600'}`}>
                Prefer not to share phone number
              </span>
            </div>
            <div className={`w-9 h-5 rounded-full transition-colors relative ${isAnonymous ? 'bg-blue-500' : 'bg-gray-300'}`}>
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isAnonymous ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
          </button>
          {isAnonymous && (
            <p className="text-xs text-blue-600 bg-blue-50 rounded-xl px-3 py-2">
              🔒 Your phone number won't be shared with the shop.
            </p>
          )}
          <Textarea
            label="Special instructions (optional)"
            placeholder="e.g. Less sugar, extra shot..."
            {...register('notes')}
          />
        </div>

        {/* Payment method */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 text-sm">How would you like to pay?</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setPaymentMethod('upi')}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                paymentMethod === 'upi'
                  ? 'border-orange-400 bg-orange-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Wallet size={24} className={paymentMethod === 'upi' ? 'text-orange-500' : 'text-gray-400'} />
              <div>
                <p className={`text-sm font-semibold ${paymentMethod === 'upi' ? 'text-orange-700' : 'text-gray-700'}`}>Pay Online</p>
                <p className="text-xs text-gray-400">UPI / Card</p>
              </div>
            </button>
            <button
              onClick={() => setPaymentMethod('cash')}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                paymentMethod === 'cash'
                  ? 'border-orange-400 bg-orange-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Banknote size={24} className={paymentMethod === 'cash' ? 'text-orange-500' : 'text-gray-400'} />
              <div>
                <p className={`text-sm font-semibold ${paymentMethod === 'cash' ? 'text-orange-700' : 'text-gray-700'}`}>Pay at Counter</p>
                <p className="text-xs text-gray-400">Cash / UPI QR</p>
              </div>
            </button>
          </div>
          {paymentMethod === 'upi' && (
            <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 border border-blue-100">
              💳 You'll be redirected to pay {formatCurrency(total)} via UPI / Card after placing your order.
            </div>
          )}
          {paymentMethod === 'cash' && (
            <div className="bg-green-50 rounded-xl p-3 text-xs text-green-700 border border-green-100">
              💵 Place your order now and pay at the counter when you collect it.
            </div>
          )}
        </div>
      </div>

      {/* Place order button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4">
        <div className="max-w-lg mx-auto">
          <Button
            className="w-full"
            size="lg"
            loading={loading}
            onClick={handleSubmit(onSubmit)}
          >
            <span>Place Order · {formatCurrency(total)}</span>
            <ChevronRight size={18} className="ml-1" />
          </Button>
        </div>
      </div>
    </div>
  )
}
