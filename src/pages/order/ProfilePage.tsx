import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  User, Phone, Mail, CalendarDays, ArrowLeft, Lock, Eye, EyeOff,
  UtensilsCrossed, Check, ChevronRight,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { customerSignUpSchema, type CustomerSignUpInput } from '@/lib/validation'
import { createCustomerProfile, humanizeError } from '@/lib/api/customerOrders'
import { saveSession, purgeLegacyProfileKey, getSessionToken } from '@/lib/customerSession'
import toast from 'react-hot-toast'

interface ShopSummary {
  id:       string
  name:     string
  logo_url: string | null
}

export default function ProfilePage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [shop, setShop] = useState<ShopSummary | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CustomerSignUpInput>({
    resolver: zodResolver(customerSignUpSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      name:     searchParams.get('name')  ?? '',
      phone:    searchParams.get('phone') ?? '',
      email:    '',
      birthday: '',
      password: '',
    },
  })

  useEffect(() => {
    if (!slug) return
    const token = getSessionToken(slug)
    if (token) {
      navigate(`/order/${slug}/profile/dashboard`, { replace: true })
      return
    }

    let cancelled = false
    supabase.from('shops').select('id, name, logo_url').eq('slug', slug).single()
      .then(({ data }) => { if (!cancelled && data) setShop(data as ShopSummary) })
    return () => { cancelled = true }
  }, [slug, navigate])

  const submit = async (data: CustomerSignUpInput) => {
    if (!shop) { toast.error('Shop not loaded'); return }
    setLoading(true)
    try {
      const session = await createCustomerProfile({
        shopId:   shop.id,
        name:     data.name,
        phone:    data.phone,
        email:    data.email,
        birthday: data.birthday,
        password: data.password,
      })
      if (slug) {
        purgeLegacyProfileKey(slug)
        saveSession(slug, {
          token: session.session_token,
          name:  session.name,
          phone: session.phone,
        })
      }
      toast.success(`Welcome, ${session.name}! 🎉`)
      navigate(`/order/${slug}/profile/dashboard`)
    } catch (err) {
      const message = humanizeError(err)
      toast.error(message)
      if (message.includes('already exists')) navigate(`/order/${slug}/profile`)
    } finally {
      setLoading(false)
    }
  }

  const phoneValue    = watch('phone')
  const passwordValue = watch('password') ?? ''

  const passwordChecks = useMemo(() => ({
    length: passwordValue.length >= 8,
    letter: /[A-Za-z]/.test(passwordValue),
    number: /\d/.test(passwordValue),
  }), [passwordValue])
  const passwordScore = Object.values(passwordChecks).filter(Boolean).length
  const passwordLabel = ['Empty', 'Weak', 'Fair', 'Strong'][passwordScore]
  const passwordColor = ['bg-gray-200 dark:bg-slate-700', 'bg-red-400', 'bg-amber-400', 'bg-emerald-500'][passwordScore]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      {/* Hero */}
      <div className="gradient-brand-header text-white px-4 pt-safe pb-16 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none" aria-hidden />
        <div className="absolute -bottom-32 -left-16 w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none" aria-hidden />

        <div className="max-w-md mx-auto pt-4 relative">
          <button
            onClick={() => navigate(`/order/${slug}/profile`)}
            className="flex items-center gap-2 text-white/85 hover:text-white text-sm transition-colors"
          >
            <ArrowLeft size={16} /> Back
          </button>

          <div className="mt-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/15 ring-4 ring-white/10 backdrop-blur-sm flex items-center justify-center overflow-hidden shadow-lg">
              {shop?.logo_url ? (
                <img src={shop.logo_url} alt={shop.name} className="w-14 h-14 rounded-xl object-cover" />
              ) : (
                <UtensilsCrossed size={28} className="text-white/90" />
              )}
            </div>
            <p className="text-xs text-white/70 uppercase tracking-[0.18em] mt-4 font-semibold">Create profile</p>
            <h1 className="text-2xl font-bold mt-1">
              A few quick details
            </h1>
            <p className="text-white/80 text-sm mt-1.5 max-w-xs">
              We'll use these to save your orders and offers at {shop?.name ?? 'this shop'}.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(submit)} className="max-w-md mx-auto px-4 -mt-8 pb-10 relative z-10 space-y-4">
        {/* About you */}
        <Section title="About you">
          <Field label="Your name" required error={errors.name?.message}>
            <div className="relative">
              <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <input
                type="text"
                autoComplete="name"
                placeholder="e.g. Arjun Kumar"
                {...register('name')}
                className="w-full h-12 pl-9 pr-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm outline-none focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 transition-all"
              />
            </div>
          </Field>

          <Field label="Mobile number" required error={errors.phone?.message}>
            <div className="flex items-stretch rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus-within:border-brand-primary focus-within:ring-4 focus-within:ring-brand-primary/10 transition-all overflow-hidden">
              <span className="inline-flex items-center gap-1.5 px-3 text-sm font-semibold text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60">
                <Phone size={14} /> +91
              </span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="9876543210"
                value={phoneValue}
                onChange={(e) => setValue('phone', e.target.value.replace(/\D/g, '').slice(0, 10), { shouldValidate: true })}
                className="flex-1 h-12 px-3 bg-transparent text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm tabular-nums outline-none"
              />
            </div>
          </Field>
        </Section>

        {/* Contact & birthday */}
        <Section title="A few extras" subtitle="For receipts and birthday treats 🎂">
          <Field label="Email" required error={errors.email?.message}>
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...register('email')}
                className="w-full h-12 pl-9 pr-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm outline-none focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 transition-all"
              />
            </div>
          </Field>

          <Field label="Birthday" required error={errors.birthday?.message}>
            <div className="relative">
              <CalendarDays size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <input
                type="date"
                {...register('birthday')}
                max={new Date().toISOString().split('T')[0]}
                className="w-full h-12 pl-9 pr-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm outline-none focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 transition-all [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
          </Field>
        </Section>

        {/* Password */}
        <Section title="Set a password" subtitle="You'll use this on your next visit">
          <Field label="Password" required error={errors.password?.message}>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                {...register('password')}
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
          </Field>

          <div className="pt-1 space-y-2">
            <div className="flex items-center gap-2" aria-hidden>
              <div className="flex-1 flex gap-1">
                {[1, 2, 3].map((tier) => (
                  <div
                    key={tier}
                    className={`h-1 flex-1 rounded-full transition-colors ${tier <= passwordScore ? passwordColor : 'bg-gray-200 dark:bg-slate-700'}`}
                  />
                ))}
              </div>
              <span className={`text-[11px] font-semibold w-12 text-right ${passwordScore === 3 ? 'text-emerald-600 dark:text-emerald-400' : passwordScore === 2 ? 'text-amber-600 dark:text-amber-400' : passwordScore === 1 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'}`}>
                {passwordLabel}
              </span>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-3 gap-x-2 gap-y-1 text-[11px]">
              <RequirementRow ok={passwordChecks.length} label="8+ characters" />
              <RequirementRow ok={passwordChecks.letter} label="A letter" />
              <RequirementRow ok={passwordChecks.number} label="A number" />
            </ul>
          </div>
        </Section>

        <Button
          type="submit"
          loading={loading}
          size="lg"
          className="w-full h-12 shadow-lg shadow-brand-primary/30"
        >
          Create Profile
          <ChevronRight size={16} className="ml-1" />
        </Button>

        <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 pt-1">
          <span>Already have a profile?</span>
          <button
            type="button"
            onClick={() => navigate(`/order/${slug}/profile`)}
            className="text-brand-primary font-semibold hover:underline"
          >
            Sign in
          </button>
        </div>
      </form>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section
      className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-5 shadow-sm space-y-4"
      style={{ animation: 'slideUp 0.25s ease-out' }}
    >
      <div>
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

function RequirementRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-1.5 ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}>
      <span className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full ${ok ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-gray-100 dark:bg-slate-800'}`}>
        <Check size={9} strokeWidth={3} className={ok ? '' : 'opacity-0'} />
      </span>
      <span className="font-medium">{label}</span>
    </li>
  )
}
