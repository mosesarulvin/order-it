import { useState } from 'react'
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

  const ratingLabels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!']

  const submit = async () => {
    if (rating === 0) { toast.error('Please select a rating'); return }
    setLoading(true)

    // Fetch order to get shop_id and order_number
    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select('shop_id, order_number')
      .eq('id', orderId!)
      .single()

    if (oErr || !order) { toast.error('Could not submit review. Try again.'); setLoading(false); return }

    const { error } = await supabase.from('reviews').insert({
      shop_id: order.shop_id,
      order_id: orderId,
      order_number: order.order_number,
      customer_name: name.trim() || 'Guest',
      rating,
      comment: comment.trim() || null,
    })

    setLoading(false)
    if (error) { toast.error(error.message); return }

    // Mark as reviewed in localStorage so prompt doesn't show again
    localStorage.setItem(`review-${orderId}`, '1')
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Star size={40} className="text-amber-500 fill-amber-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Thank you!</h2>
          <p className="text-gray-500 mt-2 text-sm">Your review helps us serve you better.</p>
          <button
            onClick={() => navigate(`/order/${slug}/success/${orderId}`)}
            className="mt-6 w-full py-3 rounded-2xl bg-brand-primary text-white font-semibold hover:opacity-90 transition-all"
          >
            Back to Order
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center space-y-3">
          <p className="font-semibold text-gray-900">How was your experience?</p>
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
                  className={`transition-colors ${s <= (hovered || rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}`}
                />
              </button>
            ))}
          </div>
          {(hovered || rating) > 0 && (
            <p className="text-sm font-semibold text-amber-600 animate-pulse">{ratingLabels[hovered || rating]}</p>
          )}
        </div>

        {/* Name */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <label className="block text-sm font-medium text-gray-700">Your name (optional)</label>
          <input
            type="text"
            placeholder="e.g. Arjun"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-10 px-3 rounded-xl border border-gray-200 text-sm outline-none focus-brand transition-colors"
          />
        </div>

        {/* Comment */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <label className="block text-sm font-medium text-gray-700 flex items-center gap-1.5">
            <MessageSquare size={14} /> Comments (optional)
          </label>
          <textarea
            placeholder="Tell us what you liked, what we could improve..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            maxLength={500}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus-brand transition-colors resize-none"
          />
          <p className="text-xs text-gray-400 text-right">{comment.length}/500</p>
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
