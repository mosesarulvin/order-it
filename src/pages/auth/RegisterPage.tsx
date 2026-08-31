import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Mail, Lock, Store, Eye, EyeOff, UtensilsCrossed, Link2, CheckCircle, XCircle, Loader } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ThemeToggle } from '@/components/ThemeToggle'
import { supabase } from '@/lib/supabase'
import { shopRegistrationSchema, type ShopRegistrationInput } from '@/lib/validation'
import toast from 'react-hot-toast'

const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'auth', 'dashboard', 'login', 'register', 'signup',
  'logout', 'invite', 'order', 'orders', 'menu', 'kitchen', 'staff', 'settings',
  'billing', 'support', 'help', 'www', 'mail', 'blog', 'docs', 'status',
  'static', 'assets', 'public', 'private', 'internal', 'superadmin', 'root',
])

type FormData = ShopRegistrationInput

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

export default function RegisterPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [slug, setSlug] = useState('')
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'reserved' | 'invalid'>('idle')
  const slugCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(shopRegistrationSchema),
  })

  // Auto-suggest slug from shop name
  const shopName = watch('shopName')
  useEffect(() => {
    if (!shopName) return
    const suggested = slugify(shopName)
    if (suggested && slug === '') setSlug(suggested)
  }, [shopName])

  const checkSlug = (value: string) => {
    if (slugCheckTimer.current) clearTimeout(slugCheckTimer.current)
    const cleaned = slugify(value)
    setSlug(cleaned)
    if (!cleaned || cleaned.length < 3) { setSlugStatus('invalid'); return }
    if (RESERVED_SLUGS.has(cleaned)) { setSlugStatus('reserved'); return }
    setSlugStatus('checking')
    slugCheckTimer.current = setTimeout(async () => {
      const { data } = await supabase.rpc('check_slug_available', { p_slug: cleaned })
      setSlugStatus(data === true ? 'available' : 'taken')
    }, 400)
  }

  const slugValid = slugStatus === 'available'

  const onSubmit = async (data: FormData) => {
    if (!slugValid) { toast.error('Please choose a valid, available URL slug'); return }
    setLoading(true)
    try {
      await signUp(data.email, data.password, data.shopName, slug)
      toast.success('Shop created! Welcome to OrderIt 🎉')
      navigate('/dashboard')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message
        : (err as { message?: string })?.message ?? 'Something went wrong'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const SlugIcon = () => {
    if (slugStatus === 'checking') return <Loader size={14} className="animate-spin text-gray-400" />
    if (slugStatus === 'available') return <CheckCircle size={14} className="text-green-500" />
    if (slugStatus === 'taken' || slugStatus === 'reserved' || slugStatus === 'invalid') return <XCircle size={14} className="text-red-500" />
    return <Link2 size={14} className="text-gray-400" />
  }

  const slugMessage = {
    idle: '',
    checking: 'Checking availability…',
    available: 'Available!',
    taken: 'Already taken — try another',
    reserved: 'Reserved word — try another',
    invalid: 'Must be at least 3 characters (a-z, 0-9, hyphens)',
  }[slugStatus]

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md" style={{ animation: 'slideUp 0.4s ease-out' }}>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500 rounded-2xl shadow-lg shadow-orange-200 dark:shadow-orange-900/50 mb-4">
            <UtensilsCrossed className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Create your shop</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1.5">Set up your digital menu in minutes</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-gray-100 dark:border-slate-800 p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              label="Shop name"
              placeholder="e.g. Blue Tokai Coffee"
              icon={<Store size={16} />}
              error={errors.shopName?.message}
              {...register('shopName')}
            />

            {/* Custom slug picker */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Your menu URL
              </label>
              <div className="flex items-center gap-0 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 overflow-hidden focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 dark:focus-within:ring-orange-900/50 transition-all">
                <span className="px-3 py-2.5 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 whitespace-nowrap select-none">
                  orderit.app/order/
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => checkSlug(e.target.value)}
                  placeholder="your-shop"
                  className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none text-gray-900 dark:text-white placeholder:text-gray-400"
                />
                <span className="px-3"><SlugIcon /></span>
              </div>
              {slugMessage && (
                <p className={`text-xs ${slugStatus === 'available' ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                  {slugMessage}
                </p>
              )}
            </div>

            <Input
              label="Email address"
              type="email"
              placeholder="you@example.com"
              icon={<Mail size={16} />}
              error={errors.email?.message}
              {...register('email')}
            />

            {(['password', 'confirmPassword'] as const).map((field) => (
              <div key={field} className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {field === 'password' ? 'Password' : 'Confirm password'}
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <Lock size={16} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="w-full h-10 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 pl-10 pr-10 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-all duration-200 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 dark:focus:ring-orange-900/50"
                    {...register(field)}
                  />
                  {field === 'password' && (
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  )}
                </div>
                {errors[field] && <p className="text-xs text-red-500">{errors[field]?.message}</p>}
              </div>
            ))}

            <Button type="submit" className="w-full" size="lg" loading={loading} disabled={!slugValid || loading}>
              Create free account
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-orange-600 font-medium hover:text-orange-700 transition-colors">
              Sign in
            </Link>
          </p>
        </div>

        <div className="flex justify-center gap-3 flex-wrap mt-6">
          {['QR ordering', 'UPI payments', 'Live kitchen view'].map((f) => (
            <span key={f} className="px-3 py-1 bg-white dark:bg-slate-800 rounded-full text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-slate-700 shadow-sm">
              ✓ {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

