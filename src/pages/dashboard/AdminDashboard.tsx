import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/Card'
import { Store, Shield, Plus, Copy, TrendingUp, AlertTriangle, CheckCircle, Clock, Ban, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import toast from 'react-hot-toast'
import { useAuth } from '@/contexts/AuthContext'

interface PlatformStats {
  total_shops: number
  active_shops: number
  trial_shops: number
  suspended_shops: number
  total_orders_today: number
  total_revenue_today: number
  total_orders_30d: number
  new_shops_30d: number
}

interface ShopRow {
  id: string
  name: string
  slug: string
  owner_id: string
  status: string
  plan: string
  trial_ends_at: string | null
  created_at: string
  suspend_reason: string | null
}

const STATUS_BADGES: Record<string, { label: string; classes: string }> = {
  active:    { label: 'Active',    classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  trial:     { label: 'Trial',     classes: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  suspended: { label: 'Suspended', classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  deleted:   { label: 'Deleted',   classes: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500' },
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const [shops, setShops] = useState<ShopRow[]>([])
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [suspendingId, setSuspendingId] = useState<string | null>(null)
  const [suspendReasonInput, setSuspendReasonInput] = useState('')
  const [suspendModalShop, setSuspendModalShop] = useState<ShopRow | null>(null)

  // Create Shop State
  const [shopName, setShopName] = useState('')
  const [shopSlug, setShopSlug] = useState('')
  const [creating, setCreating] = useState(false)
  const [generatedLink, setGeneratedLink] = useState('')

  const fetchShops = () => {
    supabase.from('shops').select('id,name,slug,owner_id,status,plan,trial_ends_at,created_at,suspend_reason')
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })
      .then(({ data }) => setShops((data ?? []) as ShopRow[]))
  }

  const fetchStats = async () => {
    const { data } = await supabase.rpc('get_platform_stats')
    if (data) setStats(data as PlatformStats)
  }

  useEffect(() => {
    fetchShops()
    fetchStats()
  }, [])

  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setCreating(true)
    setGeneratedLink('')

    try {
      const { data: shopData, error: shopError } = await supabase
        .from('shops')
        .insert({ name: shopName, slug: shopSlug, owner_id: user.id })
        .select('id')
        .single()
      if (shopError) throw shopError

      const { data: inviteData, error: inviteError } = await supabase
        .from('shop_invites')
        .insert({ shop_id: shopData.id, role: 'owner', created_by: user.id })
        .select('id')
      if (inviteError) throw inviteError

      if (inviteData && inviteData.length > 0) {
        setGeneratedLink(`${window.location.origin}/invite/${inviteData[0].id}`)
        toast.success('Shop created and invite link generated!')
        setShopName('')
        setShopSlug('')
        fetchShops()
        fetchStats()
      }
    } catch (error: unknown) {
      toast.error((error as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const handleSuspend = async () => {
    if (!suspendModalShop) return
    setSuspendingId(suspendModalShop.id)
    try {
      const { error } = await supabase.rpc('suspend_shop', { p_shop_id: suspendModalShop.id, p_reason: suspendReasonInput || null })
      if (error) throw error
      toast.success(`${suspendModalShop.name} suspended`)
      setSuspendModalShop(null)
      setSuspendReasonInput('')
      fetchShops()
      fetchStats()
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSuspendingId(null)
    }
  }

  const handleUnsuspend = async (shop: ShopRow) => {
    setSuspendingId(shop.id)
    try {
      const { error } = await supabase.rpc('unsuspend_shop', { p_shop_id: shop.id })
      if (error) throw error
      toast.success(`${shop.name} reactivated`)
      fetchShops()
      fetchStats()
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSuspendingId(null)
    }
  }

  const StatCard = ({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number | string; color: string }) => (
    <Card className="dark:bg-slate-900 dark:border-slate-800">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={22} />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-lg">
        <h2 className="text-2xl font-bold flex items-center gap-2"><Shield /> Super Admin Panel</h2>
        <p className="text-slate-400 mt-1">Platform overview and shop management.</p>
      </div>

      {/* Platform stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Store}        label="Total shops"       value={stats.total_shops}          color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
          <StatCard icon={CheckCircle}  label="Active"            value={stats.active_shops}         color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" />
          <StatCard icon={Clock}        label="Trial"             value={stats.trial_shops}          color="bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400" />
          <StatCard icon={AlertTriangle}label="Suspended"         value={stats.suspended_shops}      color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" />
          <StatCard icon={TrendingUp}   label="Orders today"      value={stats.total_orders_today}   color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" />
          <StatCard icon={TrendingUp}   label="Revenue today"     value={`₹${Math.round(stats.total_revenue_today).toLocaleString()}`} color="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" />
          <StatCard icon={TrendingUp}   label="Orders (30d)"      value={stats.total_orders_30d}     color="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400" />
          <StatCard icon={Plus}         label="New shops (30d)"   value={stats.new_shops_30d}        color="bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400" />
        </div>
      )}

      {/* Provision new shop */}
      <Card className="border-blue-100 dark:border-blue-900/30">
        <CardContent className="p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Store className="text-blue-500" /> Provision New Shop
          </h3>
          <form onSubmit={handleCreateShop} className="flex items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Input label="Shop Name" placeholder="Bob's Burgers" value={shopName} onChange={(e) => setShopName(e.target.value)} required />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Input label="URL Slug" placeholder="bobs-burgers" value={shopSlug} onChange={(e) => setShopSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} required />
            </div>
            <Button type="submit" className="h-11 bg-blue-600 hover:bg-blue-700" disabled={creating}>
              <Plus size={16} className="mr-2" /> {creating ? 'Creating...' : 'Create & Invite'}
            </Button>
          </form>
          {generatedLink && (
            <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 flex items-center justify-between gap-4">
              <div className="overflow-hidden">
                <p className="text-sm font-bold text-green-900 dark:text-green-100 mb-1">Owner Invite Link</p>
                <p className="text-xs text-green-700 dark:text-green-400 font-mono truncate">{generatedLink}</p>
              </div>
              <Button variant="outline" onClick={() => { navigator.clipboard.writeText(generatedLink); toast.success('Copied!') }}>
                <Copy size={16} className="mr-2" /> Copy
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shop list */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {shops.map((s) => {
          const badge = STATUS_BADGES[s.status] ?? STATUS_BADGES.active
          return (
            <Card key={s.id} className="dark:bg-slate-900 dark:border-slate-800">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Store size={20} className="text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-900 dark:text-white truncate">{s.name}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">/{s.slug}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${badge.classes}`}>{badge.label}</span>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Owner: {s.owner_id.slice(0, 8)}…</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Plan: <span className="capitalize font-medium">{s.plan}</span></p>
                {s.trial_ends_at && s.status === 'trial' && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-1">Trial ends {new Date(s.trial_ends_at).toLocaleDateString()}</p>
                )}
                {s.suspend_reason && (
                  <p className="text-xs text-red-500 mb-1">Reason: {s.suspend_reason}</p>
                )}
                <p className="text-xs text-gray-400 mb-3">Joined {new Date(s.created_at).toLocaleDateString()}</p>
                <div className="flex gap-2">
                  {s.status !== 'suspended' ? (
                    <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20" onClick={() => setSuspendModalShop(s)} disabled={suspendingId === s.id}>
                      <Ban size={13} className="mr-1.5" /> Suspend
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="text-green-600 border-green-200 hover:bg-green-50 dark:border-green-800 dark:hover:bg-green-900/20" onClick={() => handleUnsuspend(s)} disabled={suspendingId === s.id}>
                      <RotateCcw size={13} className="mr-1.5" /> Reinstate
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Suspend confirmation modal */}
      {suspendModalShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Suspend <span className="text-orange-500">{suspendModalShop.name}</span>?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">The shop will become inaccessible to its owner and customers immediately.</p>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Reason (optional)</label>
            <textarea
              value={suspendReasonInput}
              onChange={(e) => setSuspendReasonInput(e.target.value)}
              placeholder="e.g. Payment overdue, policy violation…"
              rows={3}
              className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white resize-none outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 dark:focus:ring-orange-900/50"
            />
            <div className="flex gap-3 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => { setSuspendModalShop(null); setSuspendReasonInput('') }}>Cancel</Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={handleSuspend} loading={suspendingId === suspendModalShop.id}>Suspend Shop</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

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
    <div className="max-w-4xl mx-auto space-y-6">
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


