import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/Card'
import { Store, Shield, Plus, Copy } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import toast from 'react-hot-toast'
import { useAuth } from '@/contexts/AuthContext'

export default function AdminDashboard() {
  const { user } = useAuth()
  const [shops, setShops] = useState<any[]>([])
  
  // Create Shop State
  const [shopName, setShopName] = useState('')
  const [shopSlug, setShopSlug] = useState('')
  const [creating, setCreating] = useState(false)
  const [generatedLink, setGeneratedLink] = useState('')

  const fetchShops = () => {
    // Note: auth_user relationship may not work without a view due to PostgREST 
    supabase.from('shops').select('*').then(({ data }) => setShops(data || []))
  }

  useEffect(() => {
    fetchShops()
  }, [])

  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setCreating(true)
    setGeneratedLink('')

    try {
      // 1. Create the shop (Super Admin becomes temporary owner)
      const { data: shopData, error: shopError } = await supabase
        .from('shops')
        .insert({ name: shopName, slug: shopSlug, owner_id: user.id })
        .select('id')
        .single()
        
      if (shopError) throw shopError

      // 2. Generate the Owner Invite Link
      const { data: inviteData, error: inviteError } = await supabase
        .from('shop_invites')
        .insert({
          shop_id: shopData.id,
          role: 'owner',
          created_by: user.id
        })
        .select('id')
        
      if (inviteError) throw inviteError
      
      if (inviteData && inviteData.length > 0) {
        setGeneratedLink(`${window.location.origin}/invite/${inviteData[0].id}`)
        toast.success('Shop created and invite link generated!')
        setShopName('')
        setShopSlug('')
        fetchShops()
      }
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-lg">
        <h2 className="text-2xl font-bold flex items-center gap-2"><Shield /> Super Admin Panel</h2>
        <p className="text-slate-400 mt-1">Manage platform wide settings and all shops.</p>
      </div>

      <Card className="border-blue-100">
        <CardContent className="p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Store className="text-blue-500" /> Provision New Shop
          </h3>
          <form onSubmit={handleCreateShop} className="flex items-end gap-4">
            <div className="flex-1">
              <Input
                label="Shop Name"
                placeholder="Bob's Burgers"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                required
              />
            </div>
            <div className="flex-1">
              <Input
                label="URL Slug"
                placeholder="bobs-burgers"
                value={shopSlug}
                onChange={(e) => setShopSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                required
              />
            </div>
            <Button type="submit" className="h-11 bg-blue-600 hover:bg-blue-700" disabled={creating}>
              <Plus size={16} className="mr-2" /> {creating ? 'Creating...' : 'Create & Invite'}
            </Button>
          </form>

          {generatedLink && (
            <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-green-900 dark:text-green-100 mb-1">Owner Invite Link Generated!</p>
                <p className="text-xs text-green-700 dark:text-green-400 font-mono">{generatedLink}</p>
              </div>
              <Button 
                variant="outline" 
                onClick={() => {
                  navigator.clipboard.writeText(generatedLink)
                  toast.success('Copied to clipboard')
                }}
                className="bg-white dark:bg-slate-800 dark:border-slate-700"
              >
                <Copy size={16} className="mr-2" /> Copy Link
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {shops.map(s => (
          <Card key={s.id} className="dark:bg-slate-900 dark:border-slate-800">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                  <Store size={20} className="text-slate-500 dark:text-slate-400" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">{s.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{s.slug}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Owner ID: {s.owner_id.slice(0, 8)}...</p>
              <div className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-full inline-block">Active</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}


