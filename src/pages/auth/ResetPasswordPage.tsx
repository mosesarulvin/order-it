import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Lock, Eye, EyeOff, UtensilsCrossed } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import toast from 'react-hot-toast'

const schema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type FormData = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [validLink, setValidLink] = useState<boolean | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    // Supabase sets the session from the URL hash on RECOVERY events
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setValidLink(true)
      }
    })
    // If no recovery event fires within 2s the link is invalid/expired
    const timer = setTimeout(() => {
      setValidLink((v) => v === null ? false : v)
    }, 2000)
    return () => clearTimeout(timer)
  }, [])

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: data.password })
    setLoading(false)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Password updated! Please sign in.')
      navigate('/login')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md" style={{ animation: 'slideUp 0.4s ease-out' }}>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500 rounded-2xl shadow-lg shadow-orange-200 mb-4">
            <UtensilsCrossed className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Set new password</h1>
          <p className="text-gray-500 mt-1.5">Choose a secure password for your account</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
          {validLink === false ? (
            <div className="text-center space-y-3">
              <p className="text-gray-700 font-medium">This link is invalid or has expired</p>
              <p className="text-sm text-gray-400">Password reset links are valid for 1 hour.</p>
              <button
                onClick={() => navigate('/forgot-password')}
                className="text-orange-600 font-medium text-sm hover:text-orange-700"
              >
                Request a new reset link
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">New password</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <Lock size={16} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    className="w-full h-10 rounded-xl border border-gray-200 bg-white pl-10 pr-10 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    {...register('password')}
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
              </div>
              <Input
                label="Confirm new password"
                type={showPassword ? 'text' : 'password'}
                icon={<Lock size={16} />}
                placeholder="Repeat your password"
                autoComplete="new-password"
                error={errors.confirmPassword?.message}
                {...register('confirmPassword')}
              />
              <Button type="submit" className="w-full" loading={loading}>
                Update password
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
