import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Star, ArrowLeft, MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import toast from 'react-hot-toast'

export default function ReviewPage() {
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>()
  const navigate = useNavigate()
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [name, setName] = useState('')
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [order, setOrder] = useState<{ id: string, shop_id: string, order_number: string, customer_name: string } | null>(null)
  const [orderItems, setOrderItems] = useState<{ id: string, menu_item_id: string, name: string }[]>([])
  const [itemRatings, setItemRatings] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!orderId) return
    supabase.from('orders').select('id, shop_id, order_number, customer_name').eq('id', orderId).single()
      .then(({ data }) => {
        if (data) {
          setOrder(data)
          if (data.customer_name && data.customer_name !== 'Guest') {
            setName(data.customer_name)
          }
        }
      })

    supabase.from('order_items').select('id, menu_item_id, name').eq('order_id', orderId)
      .then(({ data }) => {
        if (data) {
          const uniqueItems = Array.from(new Map(data.map(item => [item.menu_item_id, item])).values())
          setOrderItems(uniqueItems)
        }
      })
  }, [orderId])

  const ratingLabels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!']

  const submit = async () => {
    if (rating === 0) { toast.error('Please select a rating'); return }
    setLoading(true)

    if (!order) { toast.error('Order not found.'); setLoading(false); return }

    const { error, data: reviewData } = await supabase.from('reviews').insert({
      shop_id: order.shop_id,
      order_id: orderId,
      order_number: order.order_number,
      customer_name: name.trim() || 'Guest',
      rating,
      comment: comment.trim() || null,
    }).select().single()

    if (error) { toast.error(error.message); setLoading(false); return }

    const itemReviewEntries = Object.entries(itemRatings).map(([menuItemId, itemRating]) => ({
      shop_id: order.shop_id,
      order_id: orderId,
      review_id: reviewData.id,
      menu_item_id: menuItemId,
      rating: itemRating
    }))

    if (itemReviewEntries.length > 0) {
      await supabase.from('item_reviews').insert(itemReviewEntries)
    }

    setLoading(false)

    // Mark as reviewed in localStorage so prompt doesn't show again
    localStorage.setItem(`review-${orderId}`, '1')
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center p-6 transition-colors">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Star size={40} className="text-amber-500 fill-amber-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Thank you!</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">Your review helps us serve you better.</p>
          <button
            onClick={() => navigate(`/order/${slug}/success/${orderId}`)}
            className="mt-6 w-full py-3 rounded-2xl bg-brand-primary text-white font-semibold hover:opacity-90 transition-all shadow-sm"
          >
            Back to Order
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 transition-colors">
      {/* Header */}
      <div className="gradient-brand-header text-white px-4 pt-safe pb-8">
        <div className="max-w-lg mx-auto pt-4">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-white/80 hover:text-white mb-4 text-sm">
            <ArrowLeft size={16} /> Back
          </button>
          <h1 className="text-2xl font-bold">Leave a Review</h1>
          <p className="text-white/80 text-sm mt-1">Tell us about your experience</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Star rating */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6 text-center space-y-3 shadow-sm">
          <p className="font-semibold text-gray-900 dark:text-white">How was your experience?</p>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                onMouseEnter={() => setHovered(s)}
                onMouseLeave={() => setHovered(0)}
                onClick={() => setRating(s)}
                className="transition-transform hover:scale-110 active:scale-95"
              >
                <Star
                  size={36}
                  className={`transition-colors ${s <= (hovered || rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-200 dark:text-slate-700 fill-gray-200 dark:fill-slate-700'}`}
                />
              </button>
            ))}
          </div>
          {(hovered || rating) > 0 && (
            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 animate-pulse">{ratingLabels[hovered || rating]}</p>
          )}
        </div>

        {/* Item Ratings */}
        {orderItems.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-5 space-y-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Rate the items you ordered (optional)</h3>
            <div className="divide-y divide-gray-50 dark:divide-slate-800">
              {orderItems.map((item) => (
                <div key={item.menu_item_id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.name}</span>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        onClick={() => setItemRatings(prev => ({ ...prev, [item.menu_item_id]: s }))}
                        className="transition-transform hover:scale-110 active:scale-95"
                      >
                        <Star
                          size={24}
                          className={`transition-colors ${s <= (itemRatings[item.menu_item_id] || 0) ? 'text-amber-400 fill-amber-400' : 'text-gray-200 dark:text-slate-700 fill-gray-200 dark:fill-slate-700'}`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Name */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-4 space-y-3 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Your name</label>
          <input
            type="text"
            placeholder="e.g. Arjun"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled
            className="w-full h-10 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-gray-400 placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm outline-none cursor-not-allowed"
          />
        </div>

        {/* Comment */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-4 space-y-3 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
            <MessageSquare size={14} /> Comments (optional)
          </label>
          <textarea
            placeholder="Tell us what you liked, what we could improve..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            maxLength={500}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm outline-none focus-brand transition-colors resize-none"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 text-right">{comment.length}/500</p>
        </div>

        <Button
          onClick={submit}
          loading={loading}
          disabled={rating === 0}
          className="w-full"
          size="lg"
        >
          Submit Review
        </Button>
      </div>
    </div>
  )
}
