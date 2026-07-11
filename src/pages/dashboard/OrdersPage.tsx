import { useState, useEffect, useRef } from 'react'
import { Search, Filter, ShoppingBag, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency, formatDate, getOrderStatusColor, getOrderStatusLabel, getPaymentStatusColor } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { CancelOrderModal } from '@/components/CancelOrderModal'
import type { Order, OrderStatus } from '@/types'
import toast from 'react-hot-toast'
import type { RealtimeChannel } from '@supabase/supabase-js'

const STATUS_OPTIONS: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled']

// Only allow the next logical step — prevents jumping from pending straight to completed
const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready:     ['completed'],
}

export default function OrdersPage() {
  const { shop } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  const [selected, setSelected] = useState<Order | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!shop) return
    fetchOrders()
    subscribeToOrders()
    return () => { channelRef.current?.unsubscribe() }
  }, [shop])

  const subscribeToOrders = () => {
    if (!shop) return
    const channel = supabase
      .channel(`orders-${shop.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `shop_id=eq.${shop.id}` }, () => {
        fetchOrders(true)  // silent — no skeleton flash
      })
      .subscribe()
    channelRef.current = channel
  }

  const fetchOrders = async (silent = false) => {
    if (!shop) return
    if (!silent) setLoading(true)
    const { data, error } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('shop_id', shop.id)
      .order('created_at', { ascending: false })
    if (error) { toast.error('Failed to load orders'); console.error(error.message) }
    setOrders((data as Order[]) || [])
    setLoading(false)
  }

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    if (status === 'cancelled') {
      const order = orders.find((o) => o.id === orderId)
      if (order) { setCancelTarget(order); return }
    }
    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId)
    if (error) { toast.error(error.message); return }
    toast.success(`Order marked as ${status}`)
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status } : o))
    if (selected?.id === orderId) setSelected((prev) => prev ? { ...prev, status } : prev)
  }

  const cancelOrder = async (orderId: string, reason: string) => {
    const { error } = await supabase.from('orders').update({ status: 'cancelled', cancellation_reason: reason }).eq('id', orderId)
    if (error) { toast.error(error.message); return }
    toast.success('Order cancelled')
    const updated = { status: 'cancelled' as OrderStatus, cancellation_reason: reason }
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, ...updated } : o))
    if (selected?.id === orderId) setSelected((prev) => prev ? { ...prev, ...updated } : prev)
  }

  const markAsPaid = async (orderId: string) => {
    const { error } = await supabase.from('orders').update({ payment_status: 'paid' }).eq('id', orderId)
    if (error) { toast.error(error.message); return }
    toast.success('Marked as paid ✓')
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, payment_status: 'paid' } : o))
    if (selected?.id === orderId) setSelected((prev) => prev ? { ...prev, payment_status: 'paid' } : prev)
  }

  const filtered = orders.filter((o) => {
    const matchSearch = o.order_number.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_phone.includes(search)
    const matchStatus = statusFilter === 'all' || o.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Orders</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length < orders.length
              ? `Showing ${filtered.length} of ${orders.length} orders`
              : `${orders.length} total orders`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-48">
          <Input
            placeholder="Search orders, customer..."
            icon={<Search size={16} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')}
            className="h-10 pl-9 pr-8 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 appearance-none cursor-pointer"
          >
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{getOrderStatusLabel(s)}</option>
            ))}
          </select>
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Order list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ShoppingBag size={48} className="text-gray-200 mx-auto mb-3" />
            <p className="text-lg font-semibold text-gray-700">No orders found</p>
            <p className="text-sm text-gray-400 mt-1">Try adjusting your search or filter</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((order) => (
            <Card key={order.id} hover onClick={() => setSelected(order)}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <ShoppingBag size={18} className="text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{order.order_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getOrderStatusColor(order.status)}`}>
                        {getOrderStatusLabel(order.status)}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getPaymentStatusColor(order.payment_status)}`}>
                        {order.payment_status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {order.customer_name} · {order.customer_phone} · {formatDate(order.created_at)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-gray-900">{formatCurrency(order.total)}</p>
                    <p className="text-xs text-gray-400 capitalize mt-0.5">{order.payment_method}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Order detail modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Order ${selected?.order_number}`}
        size="md"
      >
        {selected && (
          <div className="space-y-5">
            {/* Customer info */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <p className="text-sm font-medium text-gray-700">Customer</p>
              <p className="font-semibold text-gray-900">{selected.customer_name}</p>
              {selected.is_anonymous
                ? <p className="text-sm text-blue-500">🔒 Anonymous</p>
                : <p className="text-sm text-gray-500">{selected.customer_phone}</p>
              }
              <p className="text-xs text-gray-400">{formatDate(selected.created_at)}</p>
            </div>

            {/* Items */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Items ordered</p>
              <div className="space-y-2">
                {selected.items?.map((item) => (
                  <div key={item.id} className="text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">{item.name} <span className="text-gray-400">× {item.quantity}</span></span>
                      <span className="font-medium text-gray-900">{formatCurrency(item.subtotal)}</span>
                    </div>
                    {item.customizations && item.customizations.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {item.customizations.map((c, ci) => (
                          <span key={ci} className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">{c.choice}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 mt-3 pt-3 space-y-1">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Subtotal</span><span>{formatCurrency(selected.subtotal)}</span>
                </div>
                {selected.tax_amount > 0 && (
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Tax</span><span>{formatCurrency(selected.tax_amount)}</span>
                  </div>
                )}
                {selected.discount_amount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Discount{selected.coupon_code ? ` (${selected.coupon_code})` : ''}</span>
                    <span>-{formatCurrency(selected.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900">
                  <span>Total</span><span>{formatCurrency(selected.total)}</span>
                </div>
              </div>
            </div>

            {/* Payment */}
            <div className="flex gap-3">
              <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500">Payment</p>
                <p className="font-semibold text-gray-900 capitalize">{selected.payment_method === 'cash' ? '💵 Cash' : '📱 UPI'}</p>
              </div>
              <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500">Payment Status</p>
                <p className={`font-semibold capitalize ${selected.payment_status === 'paid' ? 'text-green-600' : 'text-yellow-600'}`}>
                  {selected.payment_status === 'paid' ? '✓ Paid' : 'Pending'}
                </p>
              </div>
            </div>

            {/* Mark as paid — for cash orders that haven't been paid yet */}
            {selected.payment_status !== 'paid' && (
              <button
                onClick={() => markAsPaid(selected.id)}
                className="w-full py-2 rounded-xl text-sm font-semibold bg-green-50 text-green-700 hover:bg-green-100 transition-all border border-green-200"
              >
                ✓ Mark as Paid
              </button>
            )}

            {/* Status update */}
            {!['completed', 'cancelled'].includes(selected.status) && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Update status</p>
                <div className="flex flex-wrap gap-2">
                  {(NEXT_STATUS[selected.status] ?? []).map((s) => (
                    <button
                      key={s}
                      onClick={() => updateStatus(selected.id, s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${getOrderStatusColor(s)} hover:opacity-80`}
                    >
                      → {getOrderStatusLabel(s)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <CancelOrderModal
        open={!!cancelTarget}
        orderNumber={cancelTarget?.order_number ?? ''}
        onClose={() => setCancelTarget(null)}
        onConfirm={(reason) => cancelOrder(cancelTarget!.id, reason)}
      />
    </div>
  )
}
