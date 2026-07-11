import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Minus, Plus, Trash2, User, Phone, Wallet, Banknote, ChevronRight, ShoppingBag, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, generateOrderNumber } from '@/lib/utils'
import { useCartStore } from '@/store/cartStore'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import type { PaymentMethod } from '@/types'
import toast from 'react-hot-toast'

const schema = z.object({
  customer_name: z.string().min(2, 'Enter your name'),
  customer_phone: z.string()
    .min(10, 'Enter a valid 10-digit phone number')
    .max(10, 'Phone number must be 10 digits')
    .regex(/^[6-9]\d{9}$/, 'Enter a valid Indian mobile number'),
  notes: z.string().max(200, 'Notes must be 200 characters or less').optional(),
})

type FormData = z.infer<typeof schema>

export default function CheckoutPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [loading, setLoading] = useState(false)
  const [shopId, setShopId] = useState<string | null>(null)
  const [taxPercent, setTaxPercent] = useState(0)
  // null = loading, true/false = resolved
  const [shopOpen, setShopOpen] = useState<boolean | null>(null)
  const { items, updateQuantity, removeItem, getTotalPrice, clearCart } = useCartStore()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  // Fetch shop tax upfront so the displayed total is accurate
  useEffect(() => {
    if (!slug) return
    supabase.from('shops').select('id, tax_percent, is_open').eq('slug', slug).single()
      .then(({ data }) => {
        if (data) { setShopId(data.id); setTaxPercent(data.tax_percent); setShopOpen(data.is_open) }
        else { setShopOpen(false) }
      })
  }, [slug])

  // Redirect to menu if cart is empty (e.g. direct URL access or after clearing)
  useEffect(() => {
    if (items.length === 0 && slug) {
      navigate(`/order/${slug}`, { replace: true })
    }
  }, [items.length, slug, navigate])

  const subtotal = getTotalPrice()
  const taxAmount = Math.round(subtotal * taxPercent) / 100
  const total = subtotal + taxAmount

  const onSubmit = async (data: FormData) => {
    if (items.length === 0) { toast.error('Your cart is empty'); return }
    if (!shopId) { toast.error('Shop not found'); return }
    setLoading(true)

    try {
      // Re-validate all cart items are still available
      const itemIds = items.map((ci) => ci.menu_item.id)
      const { data: menuItems, error: availErr } = await supabase
        .from('menu_items')
        .select('id, is_available, name')
        .in('id', itemIds)
      if (availErr) throw new Error('Could not verify item availability')
      const unavailable = (menuItems ?? []).filter((m) => !m.is_available)
      if (unavailable.length > 0) {
        const names = unavailable.map((m) => m.name).join(', ')
        toast.error(`Some items are no longer available: ${names}. Please update your cart.`)
        setLoading(false)
        return
      }

      const orderNumber = generateOrderNumber()

      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          shop_id: shopId,
          order_number: orderNumber,
          customer_name: data.customer_name,
          customer_phone: data.customer_phone,
          notes: data.notes || null,
          status: 'pending',
          payment_method: paymentMethod,
          payment_status: 'pending',
          subtotal,
          tax_amount: taxAmount,
          total,
        })
        .select()
        .single()

      if (orderErr || !order) throw new Error(orderErr?.message || 'Failed to create order')

      // Insert order items
      const orderItems = items.map((ci) => ({
        order_id: order.id,
        menu_item_id: ci.menu_item.id,
        name: ci.menu_item.name,
        price: ci.menu_item.price,
        quantity: ci.quantity,
        subtotal: ci.menu_item.price * ci.quantity,
      }))

      const { error: itemsErr } = await supabase.from('order_items').insert(orderItems)
      if (itemsErr) throw new Error(itemsErr.message)

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

  if (shopOpen === false) {
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
            {items.map((ci) => (
              <div key={ci.menu_item.id} className="px-4 py-3 flex items-center gap-3">
                {ci.menu_item.image_url ? (
                  <img src={ci.menu_item.image_url} alt={ci.menu_item.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0 text-xl">🍽️</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{ci.menu_item.name}</p>
                  <p className="text-sm font-semibold text-orange-600">{formatCurrency(ci.menu_item.price)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-gray-50 rounded-xl p-1">
                    <button
                      onClick={() => updateQuantity(ci.menu_item.id, ci.quantity - 1)}
                      className="w-6 h-6 flex items-center justify-center rounded-lg bg-white text-gray-500 shadow-sm text-xs"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="w-4 text-center text-sm font-bold">{ci.quantity}</span>
                    <button
                      onClick={() => updateQuantity(ci.menu_item.id, ci.quantity + 1)}
                      className="w-6 h-6 flex items-center justify-center rounded-lg bg-orange-500 text-white shadow-sm text-xs"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <button onClick={() => removeItem(ci.menu_item.id)} className="p-1.5 text-gray-300 hover:text-red-400 transition-colors">
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
            <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-200">
              <span>Total</span><span className="text-orange-600">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        {/* Customer details */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
          <h2 className="font-semibold text-gray-900 text-sm">Your details</h2>
          <Input
            label="Your name"
            placeholder="e.g. Arjun Kumar"
            icon={<User size={16} />}
            error={errors.customer_name?.message}
            {...register('customer_name')}
          />
          <Input
            label="Phone number"
            type="tel"
            placeholder="98765 43210"
            icon={<Phone size={16} />}
            error={errors.customer_phone?.message}
            {...register('customer_phone')}
          />
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
