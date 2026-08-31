import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Phone, User, Gift, ChevronRight, Lock, Eye, EyeOff,
  UtensilsCrossed, ClipboardList, BellRing, Sparkles,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { customerSignInSchema } from '@/lib/validation'
import { signInCustomer, humanizeError } from '@/lib/api/customerOrders'
import { saveSession, purgeLegacyProfileKey, getSessionToken } from '@/lib/customerSession'
import toast from 'react-hot-toast'

type Tab = 'signin' | 'signup'

interface ShopSummary {
  id:       string
  name:     string
  logo_url: string | null
}

export default function ProfileLandingPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('signin')
  const [shop, setShop] = useState<ShopSummary | null>(null)
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!slug) return
    const token = getSessionToken(slug)
    if (token) {
      navigate(`/order/${slug}/profile/dashboard`, { replace: true })
      return
    }

    let cancelled = false
    supabase.from('shops').select('id, name, logo_url').eq('slug', slug).single()
      .then(({ data }) => {
        if (!cancelled && data) setShop(data as ShopSummary)
      })
    return () => { cancelled = true }
  }, [slug, navigate])

  const handleSignIn = async () => {
    const parsed = customerSignInSchema.safeParse({ phone, password })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Please check your input')
      return
    }
    if (!shop) { toast.error('Shop not loaded'); return }
    setLoading(true)
    try {
      const session = await signInCustomer(shop.id, parsed.data.phone, parsed.data.password)
      if (slug) {
        purgeLegacyProfileKey(slug)
        saveSession(slug, {
          token: session.session_token,
          name:  session.name,
          phone: session.phone,
        })
      }
      toast.success(`Welcome back, ${session.name}! 👋`)
      navigate(`/order/${slug}/profile/dashboard`)
    } catch (err) {
      toast.error(humanizeError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      {/* Hero */}
      <div className="gradient-brand-header text-white px-4 pt-safe pb-16 relative overflow-hidden">
        {/* Decorative glow */}
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none" aria-hidden />
        <div className="absolute -bottom-32 -left-16 w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none" aria-hidden />

        <div className="max-w-md mx-auto pt-4 relative">
          <button
            onClick={() => navigate(`/order/${slug}`)}
            className="flex items-center gap-2 text-white/85 hover:text-white text-sm transition-colors"
          >
            <ArrowLeft size={16} /> Back to menu
          </button>

          <div className="mt-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/15 ring-4 ring-white/10 backdrop-blur-sm flex items-center justify-center overflow-hidden shadow-lg">
              {shop?.logo_url ? (
                <img src={shop.logo_url} alt={shop.name} className="w-14 h-14 rounded-xl object-cover" />
              ) : (
                <UtensilsCrossed size={28} className="text-white/90" />
              )}
            </div>
            <p className="text-xs text-white/70 uppercase tracking-[0.18em] mt-4 font-semibold">Welcome to</p>
            <h1 className="text-2xl font-bold mt-1 truncate max-w-full">{shop?.name ?? 'My Profile'}</h1>
            <p className="text-white/80 text-sm mt-1.5 max-w-xs">
              {tab === 'signin'
                ? 'Sign in to unlock offers and see your order history'
                : 'Create a free profile to save your details and earn rewards'}
            </p>
          </div>
        </div>
      </div>

      {/* Segmented tabs — sit half over the hero for a floating feel */}
      <div className="max-w-md mx-auto px-4 -mt-8 relative z-10">
        <div className="flex bg-white dark:bg-slate-900 rounded-2xl p-1 shadow-lg border border-gray-100 dark:border-slate-800">
          <TabButton active={tab === 'signin'} onClick={() => setTab('signin')} label="Sign In" />
          <TabButton active={tab === 'signup'} onClick={() => setTab('signup')} label="New Here?" />
        </div>
      </div>

      {/* Card */}
      <div className="max-w-md mx-auto px-4 pt-4 pb-10">
        {tab === 'signin' && (
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6 shadow-sm space-y-5"
            style={{ animation: 'slideUp 0.25s ease-out' }}
          >
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">Mobile number</label>
              <div className="flex items-stretch rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus-within:border-brand-primary focus-within:ring-4 focus-within:ring-brand-primary/10 transition-all overflow-hidden">
                <span className="inline-flex items-center gap-1.5 px-3 text-sm font-semibold text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60">
                  <Phone size={14} /> +91
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="flex-1 h-12 px-3 bg-transparent text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm tabular-nums outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
                  className="w-full h-12 pl-9 pr-11 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm outline-none focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 -mr-1"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <Button
              onClick={handleSignIn}
              loading={loading}
              size="lg"
              className="w-full h-12 shadow-lg shadow-brand-primary/30"
            >
              Log In
              <ChevronRight size={16} className="ml-1" />
            </Button>

            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 pt-1">
              <span>Don't have a profile yet?</span>
              <button
                onClick={() => setTab('signup')}
                className="text-brand-primary font-semibold hover:underline"
              >
                Create one
              </button>
            </div>
          </div>
        )}

        {tab === 'signup' && (
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6 shadow-sm"
            style={{ animation: 'slideUp 0.25s ease-out' }}
          >
            <div className="flex items-center justify-center mb-4">
              <div className="w-14 h-14 rounded-2xl bg-brand-primary-lighter dark:bg-brand-primary/20 flex items-center justify-center">
                <Sparkles size={26} className="text-brand-primary" />
              </div>
            </div>
            <h2 className="text-lg font-bold text-center text-gray-900 dark:text-white">
              Get more from your visits
            </h2>
            <p className="text-sm text-center text-gray-500 dark:text-gray-400 mt-1 max-w-xs mx-auto">
              A free profile takes 30 seconds — and unlocks a smoother experience.
            </p>

            <ul className="mt-5 space-y-2.5">
              <PerkRow
                icon={<ClipboardList size={16} />}
                title="Order history"
                subtitle="See what you ordered and reorder in one tap"
              />
              <PerkRow
                icon={<Gift size={16} />}
                title="Exclusive offers"
                subtitle="Coupons and birthday treats saved to your profile"
              />
              <PerkRow
                icon={<BellRing size={16} />}
                title="Live updates"
                subtitle="Get pinged the moment your order is ready"
              />
            </ul>

            <Button
              onClick={() => navigate(`/order/${slug}/profile/new`)}
              size="lg"
              className="w-full h-12 mt-6 shadow-lg shadow-brand-primary/30"
            >
              Create My Profile
              <ChevronRight size={16} className="ml-1" />
            </Button>

            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 pt-3">
              <span>Already have one?</span>
              <button
                onClick={() => setTab('signin')}
                className="text-brand-primary font-semibold hover:underline"
              >
                Sign in
              </button>
            </div>
          </div>
        )}

        {/* Continue browsing */}
        <button
          onClick={() => navigate(`/order/${slug}`)}
          className="mt-6 w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <User size={13} /> Continue browsing without an account
        </button>
      </div>
    </div>
  )
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 h-10 rounded-xl text-sm font-semibold transition-all ${active
        ? 'bg-brand-primary text-white shadow-sm shadow-brand-primary/30'
        : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
        }`}
    >
      {label}
    </button>
  )
}

function PerkRow({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <li className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/60">
      <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-brand-primary-lighter dark:bg-brand-primary/20 text-brand-primary flex-shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>
      </div>
    </li>
  )
}
