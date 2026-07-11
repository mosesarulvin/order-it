import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, Lock, Store, Eye, EyeOff, UtensilsCrossed } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import toast from 'react-hot-toast'

const schema = z.object({
  shopName: z.string().min(2, 'Shop name must be at least 2 characters'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type FormData = z.infer<typeof schema>

export default function RegisterPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      await signUp(data.email, data.password, data.shopName)
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md" style={{ animation: 'slideUp 0.4s ease-out' }}>
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500 rounded-2xl shadow-lg shadow-orange-200 mb-4">
            <UtensilsCrossed className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Create your shop</h1>
          <p className="text-gray-500 mt-1.5">Set up your digital menu in minutes</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              label="Shop name"
              placeholder="e.g. Blue Tokai Coffee"
              icon={<Store size={16} />}
              error={errors.shopName?.message}
              {...register('shopName')}
            />
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
                <label className="text-sm font-medium text-gray-700">
                  {field === 'password' ? 'Password' : 'Confirm password'}
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <Lock size={16} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="w-full h-10 rounded-xl border border-gray-200 bg-white pl-10 pr-10 text-sm text-gray-900 placeholder:text-gray-400 transition-all duration-200 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
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

            <Button type="submit" className="w-full" size="lg" loading={loading}>
              Create free account
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-orange-600 font-medium hover:text-orange-700 transition-colors">
              Sign in
            </Link>
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex justify-center gap-3 flex-wrap mt-6">
          {['QR ordering', 'UPI payments', 'Live kitchen view'].map((f) => (
            <span key={f} className="px-3 py-1 bg-white rounded-full text-xs font-medium text-gray-600 border border-gray-200 shadow-sm">
              ✓ {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
