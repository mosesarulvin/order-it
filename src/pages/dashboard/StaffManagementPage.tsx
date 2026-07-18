import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import toast from 'react-hot-toast'
import { UserPlus, Users, Trash2, Shield, ChevronDown } from 'lucide-react'

export default function StaffManagementPage() {
  const { shop } = useAuth()
  const [staff, setStaff] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generatedLink, setGeneratedLink] = useState('')
  const [role, setRole] = useState<'manager' | 'staff'>('staff')

  useEffect(() => {
    if (shop) fetchStaff()
  }, [shop])

  const fetchStaff = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('shop_staff')
      .select('*')
      .eq('shop_id', shop?.id)
      
    if (!error && data) {
      setStaff(data)
    }
    setLoading(false)
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!shop) return
    
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    setGeneratedLink('')
    
    const { data, error } = await supabase
      .from('shop_invites')
      .insert({
        shop_id: shop.id,
        role: role,
        created_by: userData.user.id
      })
      .select('id')

    if (error) {
      toast.error(error.message)
    } else if (data && data.length > 0) {
      const link = `${window.location.origin}/invite/${data[0].id}`
      setGeneratedLink(link)
      toast.success('Invite link generated!')
    } else {
      toast.error('Invite created, but failed to retrieve ID. Please check RLS policies.')
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Staff Management</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage roles and access for your team.</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleInvite} className="flex items-end gap-4">
            <div className="flex-1 relative">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Role to grant</label>
              <div className="relative">
                <select 
                  value={role} 
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full h-11 pl-3 pr-10 rounded-xl border-gray-200 dark:border-slate-700 border bg-white dark:bg-slate-900 text-gray-900 dark:text-white appearance-none focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
                >
                  <option value="staff">Staff (Kitchen/Walk-in)</option>
                  <option value="manager">Manager (Inventory/Orders)</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400 dark:text-gray-500">
                  <ChevronDown size={16} />
                </div>
              </div>
            </div>
            <Button type="submit" className="h-11">
              <UserPlus size={16} className="mr-2" /> Generate Link
            </Button>
          </form>
          
          {generatedLink && (
            <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/30 rounded-xl border border-green-100 dark:border-green-800 flex items-center justify-between">
              <div className="overflow-hidden mr-4">
                <p className="text-sm font-bold text-green-900 dark:text-green-400 mb-1">Invite Link Generated!</p>
                <p className="text-xs text-green-700 dark:text-green-500 truncate font-mono">{generatedLink}</p>
              </div>
              <Button 
                variant="outline" 
                onClick={() => {
                  navigator.clipboard.writeText(generatedLink)
                  toast.success('Copied to clipboard')
                }}
                className="flex-shrink-0"
              >
                Copy
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400">Loading staff...</div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-800">
              {staff.map((s) => (
                <div key={s.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-50 dark:bg-slate-800 rounded-full flex items-center justify-center">
                      <Shield size={18} className={s.role === 'owner' ? 'text-orange-500' : 'text-gray-400 dark:text-gray-500'} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">User: {s.user_id.slice(0, 8)}...</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{s.role}</p>
                    </div>
                  </div>
                  {s.role !== 'owner' && (
                    <Button variant="ghost" className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400">
                      <Trash2 size={16} />
                    </Button>
                  )}
                </div>
              ))}
              {staff.length === 0 && (
                <div className="p-8 text-center">
                  <Users size={32} className="text-gray-200 dark:text-slate-700 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 font-medium">No staff members found.</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
