import { useEffect, useState } from 'react'
import { Star, MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate } from '@/lib/utils'
import type { Review } from '@/types'

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={size}
          className={s <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}
        />
      ))}
    </div>
  )
}

export default function ReviewsPage() {
  const { shop } = useAuth()
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [filterRating, setFilterRating] = useState<number | null>(null)

  useEffect(() => {
    if (!shop) return
    supabase
      .from('reviews')
      .select('*')
      .eq('shop_id', shop.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setReviews((data ?? []) as Review[])
        setLoading(false)
      })
  }, [shop])

  const filtered = filterRating ? reviews.filter((r) => r.rating === filterRating) : reviews

  const avgRating = reviews.length
    ? reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length
    : 0

  const ratingCounts = [5, 4, 3, 2, 1].map((r) => ({
    rating: r,
    count: reviews.filter((rv) => rv.rating === r).length,
  }))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reviews</h1>
        <p className="text-gray-500 text-sm mt-0.5">Customer feedback for your shop</p>
      </div>

      {/* Summary stats */}
      {reviews.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col sm:flex-row gap-6">
          {/* Average */}
          <div className="flex flex-col items-center justify-center min-w-[100px] gap-1">
            <span className="text-5xl font-bold text-gray-900">{avgRating.toFixed(1)}</span>
            <StarRow rating={Math.round(avgRating)} size={16} />
            <span className="text-xs text-gray-400 mt-1">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Rating breakdown */}
          <div className="flex-1 space-y-1.5">
            {ratingCounts.map(({ rating, count }) => (
              <button
                key={rating}
                onClick={() => setFilterRating(filterRating === rating ? null : rating)}
                className={`flex items-center gap-2 w-full group rounded-lg px-2 py-1 transition-colors ${filterRating === rating ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
              >
                <span className="text-xs font-medium text-gray-500 w-3">{rating}</span>
                <Star size={12} className="text-amber-400 fill-amber-400 flex-shrink-0" />
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all"
                    style={{ width: reviews.length ? `${(count / reviews.length) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-xs text-gray-400 w-6 text-right">{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active filter indicator */}
      {filterRating !== null && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Showing {filterRating}-star reviews</span>
          <button
            onClick={() => setFilterRating(null)}
            className="text-xs text-orange-500 hover:underline"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Review cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mb-4">
            <MessageSquare size={28} className="text-amber-400" />
          </div>
          <p className="text-gray-900 font-semibold">
            {filterRating ? `No ${filterRating}-star reviews yet` : 'No reviews yet'}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {filterRating ? 'Try a different filter' : 'Reviews will appear here once customers leave feedback'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((review) => (
            <div key={review.id} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{review.customer_name}</p>
                  {review.order_number && (
                    <p className="text-xs text-gray-400">Order #{review.order_number}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StarRow rating={review.rating} />
                  <span className="text-xs text-gray-400">{formatDate(review.created_at)}</span>
                </div>
              </div>
              {review.comment && (
                <p className="text-sm text-gray-600 leading-relaxed">{review.comment}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
