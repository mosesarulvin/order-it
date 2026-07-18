import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { UtensilsCrossed } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import toast from 'react-hot-toast'
import { useAuth } from '@/contexts/AuthContext'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function StaffRegisterPage() {
  const { inviteId } = useParams()
  const navigate = useNavigate()
  const { refreshShop } = useAuth()
  const [loading, setLoading] = useState(true)
  const [invite, setInvite] = useState<any>(null)
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function loadInvite() {
      if (!inviteId) return
      const { data, error } = await supabase
        .from('shop_invites')
        .select('*, shop:shop_id(name)')
        .eq('id', inviteId)
        .maybeSingle()
        
      if (error || !data) {
        toast.error('Invalid or expired invite link.')
      } else {
        setInvite(data)
      }
      setLoading(false)
    }
    loadInvite()
  }, [inviteId])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invite) return
    setSubmitting(true)

    try {
      // 1. Sign up the user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      })
      
      if (authError) throw authError
      if (!authData.user) throw new Error('Failed to create account')

      // 2. Accept the invite (which bypasses RLS to assign the role)
      const { data: rpcData, error: rpcError } = await supabase.rpc('accept_invite', { p_invite_id: invite.id })
      
      if (rpcError) throw rpcError

      toast.success('Successfully joined the team!')
      
      // Refresh AuthContext so it pulls the new shop and role
      await refreshShop()
      
      // Redirect based on role
      if (rpcData?.role === 'manager') {
        navigate('/dashboard')
      } else {
        navigate('/dashboard/kitchen')
      }
      
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 dark:text-gray-400">Loading invite...</div>
  }

  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 px-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Invite Not Found</h2>
          <p className="text-gray-500 dark:text-gray-400">This link may be invalid or has already been used.</p>
          <Button className="mt-4" onClick={() => navigate('/login')}>Go to Login</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg">
            <UtensilsCrossed className="text-white" size={24} />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          Join {invite.shop?.name}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          You have been invited to join as a <strong className="capitalize">{invite.role}</strong>.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-slate-900 py-8 px-4 shadow sm:rounded-2xl sm:px-10 border border-gray-100 dark:border-slate-800">
          <form className="space-y-6" onSubmit={handleRegister}>
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Creating account...' : 'Create account & join team'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
