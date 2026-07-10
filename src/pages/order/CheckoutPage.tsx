import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Minus, Plus, Trash2, User, Phone, Wallet, Banknote, ChevronRight, ShoppingBag } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, generateOrderNumber } from '@/lib/utils'
import { useCartStore } from '@/store/cartStore'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import type { PaymentMethod } from '@/types'
import toast from 'react-hot-toast'

const schema = z.object({
  customer_name: z.string().min(2, 'Enter your name'),
  customer_phone: z.string().min(10, 'Enter a valid phone number'),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function CheckoutPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [loading, setLoading] = useState(false)
  const { items, updateQuantity, removeItem, getTotalPrice, clearCart } = useCartStore()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const subtotal = getTotalPrice()
  const taxPercent = 0 // will be fetched from shop in production
  const taxAmount = Math.round(subtotal * taxPercent) / 100
  const total = subtotal + taxAmount

  const onSubmit = async (data: FormData) => {
    if (items.length === 0) { toast.error('Your cart is empty'); return }
    setLoading(true)

    try {
      // Get shop id from slug
      const { data: shopData, error: shopErr } = await supabase
        .from('shops')
        .select('id, tax_percent')
        .eq('slug', slug!)
        .single()

      if (shopErr || !shopData) throw new Error('Shop not found')

      const actualTax = Math.round(subtotal * shopData.tax_percent) / 100
      const actualTotal = subtotal + actualTax
      const orderNumber = generateOrderNumber()

      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          shop_id: shopData.id,
          order_number: orderNumber,
          customer_name: data.customer_name,
          customer_phone: data.customer_phone,
          notes: data.notes || null,
          status: 'pending',
          payment_method: paymentMethod,
          payment_status: paymentMethod === 'cash' ? 'pending' : 'pending',
          subtotal,
          tax_amount: actualTax,
          total: actualTotal,
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
