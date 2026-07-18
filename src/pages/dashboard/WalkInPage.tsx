import { useEffect, useState } from 'react'
import { Plus, Minus, Trash2, ShoppingBag, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency, generateOrderNumber } from '@/lib/utils'
import type { MenuItem, MenuCategory, PaymentMethod } from '@/types'
import toast from 'react-hot-toast'

interface CartEntry {
  item: MenuItem
  quantity: number
}

export default function WalkInPage() {
  const { shop } = useAuth()
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [cart, setCart] = useState<CartEntry[]>([])
  const [customerName, setCustomerName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [placing, setPlacing] = useState(false)
  const [lastOrder, setLastOrder] = useState<{ orderNumber: string } | null>(null)

  useEffect(() => {
    if (!shop) return
    Promise.all([
      supabase
        .from('menu_categories')
        .select('*')
        .eq('shop_id', shop.id)
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('menu_items')
        .select('*')
        .eq('shop_id', shop.id)
        .eq('is_available', true)
        .order('sort_order'),
    ]).then(([catRes, itemRes]) => {
      setCategories(catRes.data ?? [])
      setItems(itemRes.data ?? [])
      setLoading(false)
    })
  }, [shop])

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((e) => e.item.id === item.id)
      if (existing) return prev.map((e) => e.item.id === item.id ? { ...e, quantity: e.quantity + 1 } : e)
      return [...prev, { item, quantity: 1 }]
    })
  }

  const updateQty = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((e) => e.item.id === itemId ? { ...e, quantity: e.quantity + delta } : e)
        .filter((e) => e.quantity > 0)
    )
  }

  const removeFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((e) => e.item.id !== itemId))
  }

  const subtotal = cart.reduce((sum, e) => sum + e.item.price * e.quantity, 0)
  const taxAmount = shop ? Math.round(subtotal * (shop.tax_percent / 100) * 100) / 100 : 0
  const total = subtotal + taxAmount

  const filteredItems = activeCategory === 'all'
    ? items
    : items.filter((i) => i.category_id === activeCategory)

  const getQty = (itemId: string) => cart.find((e) => e.item.id === itemId)?.quantity ?? 0

  const placeOrder = async () => {
    if (cart.length === 0) { toast.error('Add items to the order'); return }
    if (!shop) return
    setPlacing(true)

    try {
      // Check stock
      const itemIds = cart.map((e) => e.item.id)
      const { data: menuItems, error: miErr } = await supabase
        .from('menu_items')
        .select('id, name, is_available, is_instant, stock_quantity')
        .in('id', itemIds)
      if (miErr) throw new Error('Could not verify item availability')

      for (const entry of cart) {
        const m = (menuItems ?? []).find((m) => m.id === entry.item.id)
        if (!m?.is_available) { toast.error(`"${entry.item.name}" is no longer available`); setPlacing(false); return }
        if (m.stock_quantity !== null && entry.quantity > m.stock_quantity) {
          toast.error(`Not enough stock for "${entry.item.name}" (only ${m.stock_quantity} left)`)
          setPlacing(false)
          return
        }
      }

      const allInstant = (menuItems ?? []).every((m) => m.is_instant)
      const orderStatus = allInstant ? 'ready' : 'pending'
      const orderNumber = generateOrderNumber()

      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          shop_id: shop.id,
          order_number: orderNumber,
          customer_name: customerName.trim() || 'Walk-in Guest',
          customer_phone: 'Walk-in',
          status: orderStatus,
          payment_method: paymentMethod,
          payment_status: 'pending',
          is_anonymous: false,
          order_source: 'walkin',
          coupon_code: null,
          discount_amount: 0,
          subtotal,
          tax_amount: taxAmount,
          total,
        })
        .select()
        .single()

      if (orderErr || !order) throw new Error(orderErr?.message || 'Failed to create order')

      const orderItems = cart.map((entry) => ({
        order_id: order.id,
        menu_item_id: entry.item.id,
        name: entry.item.name,
        price: entry.item.price,
        quantity: entry.quantity,
        subtotal: entry.item.price * entry.quantity,
        customizations: [],
      }))

      const { error: itemsErr } = await supabase.from('order_items').insert(orderItems)
      if (itemsErr) throw new Error(itemsErr.message)

      // Deduct stock
      for (const entry of cart) {
        const m = (menuItems ?? []).find((m) => m.id === entry.item.id)
        if (m && m.stock_quantity !== null) {
          await supabase
            .from('menu_items')
            .update({ stock_quantity: Math.max(0, m.stock_quantity - entry.quantity) })
            .eq('id', entry.item.id)
          await supabase.from('stock_logs').insert({
            shop_id: shop.id,
            menu_item_id: entry.item.id,
            item_name: entry.item.name,
            delta: -entry.quantity,
            reason: 'order',
            note: orderNumber,
          })
        }
      }

      // Success — reset
      setLastOrder({ orderNumber })
      setCart([])
      setCustomerName('')
      setPaymentMethod('cash')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setPlacing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col md:flex-row overflow-hidden">
      {/* ── Left: Menu ── */}
      <div className="flex-1 flex flex-col min-h-0 border-r border-gray-100 dark:border-slate-800">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <h2 className="font-bold text-gray-900 dark:text-white">Walk-in Order</h2>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 px-4 py-2 overflow-x-auto bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 no-scrollbar">
          <button
            onClick={() => setActiveCategory('all')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${activeCategory === 'all' ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700'}`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${activeCategory === cat.id ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700'}`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredItems.length === 0 && (
            <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-10">No items in this category</p>
          )}
          {filteredItems.map((item) => {
            const qty = getQty(item.id)
            return (
              <div key={item.id} className="flex items-center gap-3 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{item.name}</p>
                  <p className="text-orange-600 text-sm font-semibold">{formatCurrency(item.price)}</p>
                </div>
                {qty === 0 ? (
                  <button
                    onClick={() => addToCart(item)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 transition-colors"
                  >
                    <Plus size={12} /> Add
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => updateQty(item.id, -1)} className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors text-gray-700 dark:text-gray-300">
                      <Minus size={12} />
                    </button>
                    <span className="w-5 text-center text-sm font-semibold dark:text-white">{qty}</span>
                    <button onClick={() => updateQty(item.id, 1)} className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 transition-colors">
                      <Plus size={12} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Right: Order panel ── */}
      <div className="w-full md:w-80 lg:w-96 flex flex-col bg-gray-50 dark:bg-slate-900 border-t md:border-t-0 border-gray-100 dark:border-slate-800">
        {/* Success banner */}
        {lastOrder && (
          <div className="m-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-2xl p-4 flex items-start gap-3">
            <CheckCircle size={20} className="text-green-600 dark:text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-green-800 dark:text-green-400 text-sm">Order placed!</p>
              <p className="text-green-700 dark:text-green-500 text-xs mt-0.5">Order #{lastOrder.orderNumber}</p>
              <button onClick={() => setLastOrder(null)} className="mt-2 text-xs text-green-600 dark:text-green-400 hover:underline">Dismiss</button>
            </div>
          </div>
        )}

        <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <h2 className="font-bold text-gray-900 dark:text-white">Current Order</h2>
          {cart.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">No items added yet</p>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.map((entry) => (
            <div key={entry.item.id} className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{entry.item.name}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{formatCurrency(entry.item.price)} × {entry.quantity}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => updateQty(entry.item.id, -1)} className="w-6 h-6 rounded-md bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-slate-600">
                  <Minus size={10} />
                </button>
                <span className="w-5 text-center text-xs font-semibold dark:text-white">{entry.quantity}</span>
                <button onClick={() => updateQty(entry.item.id, 1)} className="w-6 h-6 rounded-md bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600">
                  <Plus size={10} />
                </button>
                <button onClick={() => removeFromCart(entry.item.id)} className="w-6 h-6 rounded-md text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 flex items-center justify-center transition-colors">
                  <Trash2 size={10} />
                </button>
              </div>
              <span className="text-xs font-semibold text-gray-900 dark:text-white w-14 text-right">{formatCurrency(entry.item.price * entry.quantity)}</span>
            </div>
          ))}
          {cart.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <ShoppingBag size={32} className="text-gray-200 dark:text-slate-700 mb-2" />
              <p className="text-xs text-gray-400 dark:text-gray-500">Add items from the menu</p>
            </div>
          )}
        </div>

        {/* Order details + totals */}
        <div className="border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          {/* Totals */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
            </div>
            {taxAmount > 0 && (
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Tax ({shop?.tax_percent}%)</span><span>{formatCurrency(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-gray-900 dark:text-white pt-1 border-t border-gray-100 dark:border-slate-800">
              <span>Total</span><span className="text-orange-600">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Customer name */}
          <input
            type="text"
            placeholder="Customer name (optional)"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="w-full h-9 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:border-orange-400 transition-colors"
          />

          {/* Payment method */}
          <div className="flex gap-2">
            {(['cash', 'upi'] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold capitalize transition-colors border ${paymentMethod === m ? 'bg-orange-500 text-white border-orange-500' : 'bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:border-orange-300 dark:hover:border-orange-500/50'}`}
              >
                {m === 'upi' ? 'UPI' : 'Cash'}
              </button>
            ))}
          </div>

          {/* Place order */}
          <button
            onClick={placeOrder}
            disabled={placing || cart.length === 0}
            className="w-full py-3 rounded-2xl bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            {placing ? 'Placing...' : `Place Order · ${formatCurrency(total)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
