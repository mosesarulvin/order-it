import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { User, Phone, Mail, CalendarDays, ArrowLeft, Gift } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import toast from 'react-hot-toast'

export default function ProfilePage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [birthday, setBirthday] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!name.trim()) { toast.error('Name is required'); return }
    if (!/^[6-9]\d{9}$/.test(phone)) { toast.error('Enter a valid 10-digit Indian mobile number'); return }

    setLoading(true)
    try {
      // Get shop by slug
      const { data: shop, error: shopErr } = await supabase
        .from('shops')
        .select('id')
        .eq('slug', slug!)
        .single()
      if (shopErr || !shop) { toast.error('Shop not found'); setLoading(false); return }

      // Check if profile already exists for this phone + shop
      const { data: existing } = await supabase
        .from('customer_profiles')
        .select('id')
        .eq('shop_id', shop.id)
        .eq('phone', phone)
        .maybeSingle()

      let profileId: string

      if (existing) {
        // Profile exists — just log in to it
        profileId = existing.id
        toast('Profile already exists! Logging you in.')
      } else {
        // Create new profile
        const { data: profile, error: profileErr } = await supabase
          .from('customer_profiles')
          .insert({
            shop_id: shop.id,
            name: name.trim(),
            phone,
            email: email.trim() || null,
            birthday: birthday || null,
          })
          .select('id')
          .single()

        if (profileErr || !profile) { toast.error(profileErr?.message || 'Failed to create profile'); setLoading(false); return }
        profileId = profile.id

        // Auto-assign new_user welcome coupon if one exists
        const { data: welcomeCoupon } = await supabase
          .from('coupons')
          .select('id, code, value, type')
          .eq('shop_id', shop.id)
          .eq('coupon_type', 'new_user')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle()

        if (welcomeCoupon) {
          const label = welcomeCoupon.type === 'percentage'
            ? `Welcome ${welcomeCoupon.value}% off`
            : `Welcome ₹${welcomeCoupon.value} off`
          await supabase.from('profile_coupons').insert({
            profile_id: profileId,
            shop_id: shop.id,
            coupon_id: welcomeCoupon.id,
            coupon_code: welcomeCoupon.code,
            label,
          })
        }
      }

      // Save profile to localStorage
      localStorage.setItem(`profile-${slug}`, profileId)
      navigate(`/order/${slug}/profile/${profileId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-orange-500 to-amber-500 text-white px-4 pt-safe pb-10">
        <div className="max-w-lg mx-auto pt-4">
          <button onClick={() => navigate(`/order/${slug}`)} className="flex items-center gap-2 text-white/80 hover:text-white mb-4 text-sm">
            <ArrowLeft size={16} /> Back to menu
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <Gift size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Create Profile</h1>
              <p className="text-white/80 text-sm mt-0.5">Get exclusive offers & track your orders</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-4 pb-8 space-y-4">
        {/* Perks card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2 shadow-sm">
          <p className="font-semibold text-gray-900 text-sm">Why create a profile?</p>
          <div className="space-y-1.5">
            {['🎁 Get a welcome discount on your first order', '🎂 Receive birthday offers', '📣 Shop promotions sent directly to you', '📋 View your complete order history'].map((perk) => (
              <p key={perk} className="text-sm text-gray-600">{perk}</p>
            ))}
          </div>
          <p className="text-xs text-gray-400 pt-1">Optional — you can still order without a profile.</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Your name *</label>
            <div className="relative">
              <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="e.g. Arjun Kumar"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-orange-400 transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Mobile number *</label>
            <div className="relative">
              <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="tel"
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-orange-400 transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Email <span className="text-gray-400 font-normal">(optional)</span></label>
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-orange-400 transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Birthday <span className="text-gray-400 font-normal">(optional — for birthday offers)</span></label>
            <div className="relative">
              <CalendarDays size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-orange-400 transition-colors"
              />
            </div>
          </div>
        </div>

        <Button onClick={submit} loading={loading} className="w-full" size="lg">
          Create Profile & Get My Offers
        </Button>
      </div>
    </div>
  )
}
