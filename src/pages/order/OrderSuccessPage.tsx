import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckCircle, Clock, ChefHat, Bell, ArrowLeft, Share2, ShoppingBag } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import type { Order } from '@/types'

const STATUS_STEPS = [
  { key: 'pending', label: 'Order Placed', icon: Bell },
  { key: 'confirmed', label: 'Confirmed', icon: CheckCircle },
  { key: 'preparing', label: 'Being Prepared', icon: ChefHat },
  { key: 'ready', label: 'Ready for Pickup', icon: ShoppingBag },
]

export default function OrderSuccessPage() {
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>()
  const navigate = useNavigate()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (orderId) fetchOrder()

    // Poll every 15 seconds
    const interval = setInterval(() => {
      if (orderId) fetchOrder()
    }, 15000)

    return () => clearInterval(interval)
  }, [orderId])

  const fetchOrder = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('id', orderId!)
      .single()
    if (data) setOrder(data as Order)
    setLoading(false)
  }

  const share = async () => {
    if (!order) return
    const text = `My order at ${order.shop_id} — Order ID: ${order.order_number}\nTotal: ₹${order.total}`
    if (navigator.share) {
      await navigator.share({ title: 'My Order', text })
    } else {
      navigator.clipboard.writeText(text)
    }
  }

  const currentStepIdx = STATUS_STEPS.findIndex((s) => s.key === order?.status)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading your order...</p>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-gray-500">Order not found</p>
          <button onClick={() => navigate(`/order/${slug}`)} className="mt-4 text-orange-600">Back to menu</button>
        </div>
      </div>
    )
  }

  const isReady = order.status === 'ready'
  const isCompleted = order.status === 'completed'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className={`${isReady ? 'bg-gradient-to-br from-green-500 to-emerald-500' : 'bg-gradient-to-br from-orange-500 to-amber-500'} text-white px-4 pt-safe pb-8 transition-all duration-500`}>
        <div className="max-w-lg mx-auto">
          <div className="pt-4 pb-6 text-center">
            <div className="relative inline-flex">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-4 ${isReady ? 'bg-white/20' : 'bg-white/20'}`}>
                {isReady ? <ShoppingBag size={48} className="text-white" /> : <CheckCircle size={48} className="text-white" />}
              </div>
            </div>
            <h1 className="text-2xl font-bold">
              {isReady ? '🎉 Your order is ready!' : isCompleted ? 'Order Completed' : 'Order Placed!'}
            </h1>
            <p className="text-white/80 mt-1 text-sm">
              {isReady ? 'Please collect your order at the counter' : 'We received your order and will prepare it shortly'}
            </p>
          </div>

          {/* Order number card */}
          <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-5 text-center">
            <p className="text-white/70 text-sm mb-1">Order Number</p>
            <p className="text-4xl font-black tracking-wide">{order.order_number}</p>
            <p className="text-white/70 text-xs mt-2">Show this to collect your order</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {/* Live status tracker */}
        {!isCompleted && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-900 text-sm mb-4">Order Status</h2>
            <div className="relative">
              {/* Progress line */}
              <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gray-100" />
              <div
                className="absolute left-4 top-4 w-0.5 bg-orange-400 transition-all duration-700"
                style={{ height: `${Math.max(0, currentStepIdx) * (100 / (STATUS_STEPS.length - 1))}%` }}
              />
              <div className="space-y-5">
                {STATUS_STEPS.map((step, idx) => {
                  const StepIcon = step.icon
                  const done = idx <= currentStepIdx
                  const active = idx === currentStepIdx
                  return (
                    <div key={step.key} className="flex items-center gap-4 relative">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 transition-all duration-300 ${
                        done ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'
                      } ${active ? 'ring-4 ring-orange-100' : ''}`}>
                        <StepIcon size={14} />
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${done ? 'text-gray-900' : 'text-gray-400'}`}>{step.label}</p>
                        {active && (
                          <p className="text-xs text-orange-500 font-medium animate-pulse">In progress...</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Items summary */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900 text-sm">Items ordered</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {order.items?.map((item) => (
              <div key={item.id} className="px-4 py-3 flex justify-between text-sm">
                <span className="text-gray-700">{item.name} <span className="text-gray-400">×{item.quantity}</span></span>
                <span className="font-semibold text-gray-900">{formatCurrency(item.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-between font-bold">
            <span className="text-gray-900">Total</span>
            <span className="text-orange-600">{formatCurrency(order.total)}</span>
          </div>
        </div>

        {/* Payment info */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-500">Payment method</span>
            <span className="font-semibold text-gray-900 capitalize">{order.payment_method === 'cash' ? '💵 Pay at Counter' : '📱 UPI / Online'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Payment status</span>
            <span className={`font-semibold capitalize ${order.payment_status === 'paid' ? 'text-green-600' : 'text-yellow-600'}`}>
              {order.payment_status === 'paid' ? '✓ Paid' : 'Pending'}
            </span>
          </div>
        </div>

        {/* Auto-refresh note */}
        <div className="flex items-center gap-2 bg-blue-50 rounded-xl p-3 border border-blue-100">
          <Clock size={14} className="text-blue-500 flex-shrink-0" />
          <p className="text-xs text-blue-700">This page updates automatically every 15 seconds.</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/order/${slug}`)}
            className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl border-2 border-gray-200 text-gray-600 text-sm font-semibold hover:border-gray-300 hover:bg-gray-50 transition-all"
          >
            <ArrowLeft size={16} /> Order More
          </button>
          <button
            onClick={share}
            className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-orange-50 text-orange-700 text-sm font-semibold hover:bg-orange-100 transition-all"
          >
            <Share2 size={16} /> Share Receipt
          </button>
        </div>
      </div>
    </div>
  )
}
