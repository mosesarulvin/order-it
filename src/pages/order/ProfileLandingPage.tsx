import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Phone, User, Gift, ChevronRight, Lock, Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import toast from 'react-hot-toast'

type Mode = 'landing' | 'signin'

export default function ProfileLandingPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('landing')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSignIn = async () => {
    if (!/^[6-9]\d{9}$/.test(phone)) {
      toast.error('Enter a valid 10-digit Indian mobile number')
      return
    }
    if (!password.trim()) {
      toast.error('Please enter your password')
      return
    }

    setLoading(true)
    try {
      const { data: shop } = await supabase
        .from('shops')
        .select('id')
        .eq('slug', slug!)
        .single()

      if (!shop) { toast.error('Shop not found'); return }

      const { data: profile } = await supabase
        .from('customer_profiles')
        .select('id, name')
        .eq('shop_id', shop.id)
        .eq('phone', phone)
        .eq('password', password)
        .maybeSingle()

      if (profile) {
        localStorage.setItem(`profile-${slug}`, profile.id)
        toast.success(`Welcome back, ${profile.name}! 👋`)
        navigate(`/order/${slug}/profile/${profile.id}`)
      } else {
        toast.error('Invalid mobile number or password')
      }
    } catch (err) {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      {/* Header */}
      <div className="gradient-brand-header text-white px-4 pt-safe pb-12">
        <div className="max-w-lg mx-auto pt-4">
          <button
            onClick={() => navigate(`/order/${slug}`)}
            className="flex items-center gap-2 text-white/80 hover:text-white mb-6 text-sm transition-colors"
          >
            <ArrowLeft size={16} /> Back to menu
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <User size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">My Profile</h1>
              <p className="text-white/80 text-sm mt-0.5">Offers, rewards & order history</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-6 pb-10 space-y-4">

        {mode === 'landing' && (
          <>
            {/* Sign In card — for returning customers */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="p-5">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-9 h-9 bg-brand-primary-lighter dark:bg-brand-primary-shadow rounded-xl flex items-center justify-center">
                    <Phone size={16} className="text-brand-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">Already have a profile?</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Sign in with your mobile number</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setMode('signin')}
                className="w-full flex items-center justify-between px-5 py-3.5 bg-brand-primary-lighter dark:bg-brand-primary-shadow hover:bg-brand-primary-light dark:hover:bg-brand-primary-shadow/80 transition-colors border-t border-gray-100 dark:border-slate-800"
              >
                <span className="text-sm font-semibold text-brand-primary-dark dark:text-brand-primary">Sign In with Phone Number</span>
                <ChevronRight size={16} className="text-brand-primary" />
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200 dark:bg-slate-700" />
              <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">OR</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-slate-700" />
            </div>

            {/* Create Profile card — for new customers */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
                    <Gift size={16} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">New here? Create a profile</p>
                    {/* <p className="text-xs text-gray-500 dark:text-gray-400">Get exclusive offers & track your orders</p> */}
                    <p className="text-xs text-gray-500 dark:text-gray-400">Track your orders</p>
                  </div>
                </div>
                <div className="space-y-1.5 mb-4">
                  {[
                    // '🎁 Welcome discount on your first order',
                    // '🎂 Birthday offers automatically applied',
                    '📋 View your complete order history',
                    '📣 Receive shop promotions',
                  ].map((perk) => (
                    <p key={perk} className="text-xs text-gray-600 dark:text-gray-300">{perk}</p>
                  ))}
                </div>
                {/* <p className="text-xs text-gray-400 dark:text-gray-500">Optional — you can still order without a profile.</p> */}
              </div>
              <button
                onClick={() => navigate(`/order/${slug}/profile/new`)}
                className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors border-t border-gray-100 dark:border-slate-800"
              >
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Create Profile & Get Offers</span>
                <ChevronRight size={16} className="text-gray-400 dark:text-gray-500" />
              </button>
            </div>
          </>
        )}

        {mode === 'signin' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div>
              <button
                onClick={() => setMode('landing')}
                className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 mb-3 transition-colors"
              >
                <ArrowLeft size={13} /> Back
              </button>
              <p className="font-semibold text-gray-900 dark:text-white">Sign in to your profile</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Enter the mobile number you registered with</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Mobile number</label>
                <div className="relative">
                  <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
                  <input
                    type="tel"
                    placeholder="9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="w-full h-11 pl-9 pr-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm outline-none focus-brand transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
                    className="w-full h-11 pl-9 pr-10 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm outline-none focus-brand transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <Button onClick={handleSignIn} loading={loading} className="w-full" size="lg">
              Log In
            </Button>

            <p className="text-xs text-center text-gray-400 dark:text-gray-500">
              Don't have a profile yet?{' '}
              <button
                onClick={() => navigate(`/order/${slug}/profile/new`)}
                className="text-brand-primary font-semibold hover:underline"
              >
                Create one
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
