import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/Card'
import {
  Store, Shield, Plus, Copy, TrendingUp, Users,
  ShoppingBag, DollarSign, Search, ArrowUpDown,
  ExternalLink, AlertTriangle, CheckCircle2, BarChart3,
  XCircle, Megaphone, Settings2, Ban, Eye, Percent,
  ToggleLeft, ToggleRight, Trash2, Send, ChevronDown
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import toast from 'react-hot-toast'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell
} from 'recharts'
import type { Shop } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShopFull extends Shop {
  revenue?: number
  orders?: number
}

interface TrendPoint { label: string; revenue: number; orders: number }
interface Announcement { id: string; title: string; body: string; is_active: boolean; created_at: string }
interface BlacklistEntry { id: string; value: string; type: 'phone' | 'email'; reason: string | null; created_at: string }

type SortKey = 'name' | 'revenue' | 'orders' | 'created_at'
type TrendRange = '7days' | '30days'
type Tab = 'overview' | 'shops' | 'announcements' | 'blacklist' | 'commission'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300',
  starter: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  pro: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  enterprise: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
}

const PLAN_OPTIONS = ['free', 'starter', 'pro', 'enterprise'] as const

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

function buildTrendData(orders: { created_at: string; total: number }[], days: number): TrendPoint[] {
  const map = new Map<string, { revenue: number; orders: number }>()
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i)
    map.set(d.toISOString().slice(0, 10), { revenue: 0, orders: 0 })
  }
  for (const o of orders) {
    const key = o.created_at.slice(0, 10)
    const ex = map.get(key)
    if (ex) { ex.revenue += o.total ?? 0; ex.orders += 1 }
  }
  return Array.from(map.entries()).map(([date, v]) => ({
    label: new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
    revenue: Math.round(v.revenue), orders: v.orders,
  }))
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('overview')

  // ── Shops & Orders data ──────────────────────────────────────────────────────
  const [shops, setShops] = useState<ShopFull[]>([])
  const [trendOrders, setTrendOrders] = useState<{ created_at: string; total: number; shop_id: string }[]>([])
  const [totalCustomers, setTotalCustomers] = useState(0)
  const [loading, setLoading] = useState(true)

  // ── Shop table state ─────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('revenue')
  const [sortAsc, setSortAsc] = useState(false)
  const [trendRange, setTrendRange] = useState<TrendRange>('7days')

  // ── Suspend modal ────────────────────────────────────────────────────────────
  const [suspendTarget, setSuspendTarget] = useState<ShopFull | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [suspending, setSuspending] = useState(false)

  // ── Plan change ──────────────────────────────────────────────────────────────
  const [planChanging, setPlanChanging] = useState<string | null>(null)
  const [planDropdownOpen, setPlanDropdownOpen] = useState<string | null>(null)
  const [planDropdownPos, setPlanDropdownPos] = useState<{ top: number; left: number } | null>(null)

  // ── Provision ────────────────────────────────────────────────────────────────
  const [shopName, setShopName] = useState('')
  const [shopSlug, setShopSlug] = useState('')
  const [creating, setCreating] = useState(false)
  const [generatedLink, setGeneratedLink] = useState('')

  // ── Announcements ────────────────────────────────────────────────────────────
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [annLoading, setAnnLoading] = useState(true)
  const [annTitle, setAnnTitle] = useState('')
  const [annBody, setAnnBody] = useState('')
  const [annSaving, setAnnSaving] = useState(false)

  // ── Blacklist ────────────────────────────────────────────────────────────────
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([])
  const [blLoading, setBlLoading] = useState(true)
  const [blValue, setBlValue] = useState('')
  const [blType, setBlType] = useState<'phone' | 'email'>('phone')
  const [blReason, setBlReason] = useState('')
  const [blSaving, setBlSaving] = useState(false)
  const [blSearch, setBlSearch] = useState('')
  const [blTypeOpen, setBlTypeOpen] = useState(false)

  // ── Commission ───────────────────────────────────────────────────────────────
  const [commRate, setCommRate] = useState('5')
  const [commSaving, setCommSaving] = useState(false)

  // ── Feature flags ────────────────────────────────────────────────────────────
  const [flagsTarget, setFlagsTarget] = useState<ShopFull | null>(null)
  const [flagsSaving, setFlagsSaving] = useState(false)

  // ═══════════════════════════════════════════════════════════════════════════
  // Data Fetching
  // ═══════════════════════════════════════════════════════════════════════════

  const fetchAll = async () => {
    setLoading(true)
    try {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30)
      const [shopsRes, ordersRes, custRes] = await Promise.all([
        supabase.from('shops').select('*').order('created_at', { ascending: false }),
        supabase.from('orders').select('shop_id, total, created_at').gte('created_at', cutoff.toISOString()),
        supabase.from('customer_profiles').select('id', { count: 'exact', head: true }),
      ])
      const rawShops: Shop[] = shopsRes.data ?? []
      const rawOrders = ordersRes.data ?? []
      const statsMap = new Map<string, { revenue: number; orders: number }>()
      for (const o of rawOrders) {
        const ex = statsMap.get(o.shop_id) ?? { revenue: 0, orders: 0 }
        ex.revenue += o.total ?? 0; ex.orders += 1
        statsMap.set(o.shop_id, ex)
      }
      setShops(rawShops.map(s => ({ ...s, revenue: statsMap.get(s.id)?.revenue ?? 0, orders: statsMap.get(s.id)?.orders ?? 0 })))
      setTrendOrders(rawOrders)
      setTotalCustomers(custRes.count ?? 0)
    } catch { toast.error('Failed to load platform data') }
    finally { setLoading(false) }
  }

  const fetchAnnouncements = async () => {
    setAnnLoading(true)
    const { data } = await supabase.from('platform_announcements').select('*').order('created_at', { ascending: false })
    setAnnouncements((data as Announcement[]) ?? [])
    setAnnLoading(false)
  }

  const fetchBlacklist = async () => {
    setBlLoading(true)
    const { data } = await supabase.from('platform_blacklist').select('*').order('created_at', { ascending: false })
    setBlacklist((data as BlacklistEntry[]) ?? [])
    setBlLoading(false)
  }

  useEffect(() => { fetchAll() }, [])
  useEffect(() => { if (tab === 'announcements') fetchAnnouncements() }, [tab])
  useEffect(() => { if (tab === 'blacklist') fetchBlacklist() }, [tab])

  // ═══════════════════════════════════════════════════════════════════════════
  // Computed
  // ═══════════════════════════════════════════════════════════════════════════

  const totalGMV = useMemo(() => shops.reduce((s, sh) => s + (sh.revenue ?? 0), 0), [shops])
  const activeShops = useMemo(() => shops.filter(s => s.is_open && s.status !== 'suspended').length, [shops])
  const todayOrders = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return trendOrders.filter(o => o.created_at.slice(0, 10) === today).length
  }, [trendOrders])
  const trendData = useMemo(() => buildTrendData(trendOrders, trendRange === '7days' ? 7 : 30), [trendOrders, trendRange])
  const topShops = useMemo(() => [...shops].sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0)).slice(0, 5), [shops])
  const commissionEarned = useMemo(() => totalGMV * (parseFloat(commRate) / 100 || 0), [totalGMV, commRate])

  const filteredShops = useMemo(() => {
    let list = [...shops]
    if (search) list = list.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.slug.includes(search.toLowerCase()))
    list.sort((a, b) => {
      if (sortKey === 'name') return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      if (sortKey === 'revenue') return sortAsc ? (a.revenue ?? 0) - (b.revenue ?? 0) : (b.revenue ?? 0) - (a.revenue ?? 0)
      if (sortKey === 'orders') return sortAsc ? (a.orders ?? 0) - (b.orders ?? 0) : (b.orders ?? 0) - (a.orders ?? 0)
      if (sortKey === 'created_at') return sortAsc
        ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      return 0
    })
    return list
  }, [shops, search, sortKey, sortAsc])

  const handleSort = (key: SortKey) => { if (sortKey === key) setSortAsc(a => !a); else { setSortKey(key); setSortAsc(false) } }

  // ═══════════════════════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════════════════════

  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault(); if (!user) return
    setCreating(true); setGeneratedLink('')
    try {
      const { data: sd, error: se } = await supabase.from('shops').insert({ name: shopName, slug: shopSlug, owner_id: user.id }).select('id').single()
      if (se) throw se
      const { data: inv, error: ie } = await supabase.from('shop_invites').insert({ shop_id: sd.id, role: 'owner', created_by: user.id }).select('id')
      if (ie) throw ie
      if (inv?.length) { setGeneratedLink(`${window.location.origin}/invite/${inv[0].id}`); toast.success('Shop created!'); setShopName(''); setShopSlug(''); fetchAll() }
    } catch (err: any) { toast.error(err.message) }
    finally { setCreating(false) }
  }

  const confirmSuspend = async () => {
    if (!suspendTarget) return
    setSuspending(true)
    const isSuspended = suspendTarget.status === 'suspended'
    const { error } = await supabase.from('shops').update(
      isSuspended
        ? { status: 'active', suspended_at: null, suspend_reason: null }
        : { status: 'suspended', suspended_at: new Date().toISOString(), suspend_reason: suspendReason || null }
    ).eq('id', suspendTarget.id)
    if (error) { toast.error(error.message) }
    else {
      toast.success(isSuspended ? `${suspendTarget.name} reactivated` : `${suspendTarget.name} suspended`)
      setShops(prev => prev.map(s => s.id === suspendTarget.id
        ? { ...s, status: isSuspended ? 'active' : 'suspended', suspended_at: isSuspended ? null : new Date().toISOString(), suspend_reason: isSuspended ? null : suspendReason || null }
        : s))
      setSuspendTarget(null); setSuspendReason('')
    }
    setSuspending(false)
  }

  const changePlan = async (shopId: string, plan: string) => {
    setPlanChanging(shopId)
    const { error } = await supabase.from('shops').update({ plan }).eq('id', shopId)
    if (error) toast.error(error.message)
    else { toast.success('Plan updated'); setShops(prev => prev.map(s => s.id === shopId ? { ...s, plan: plan as Shop['plan'] } : s)) }
    setPlanChanging(null)
  }

  const saveFeatureFlags = async () => {
    if (!flagsTarget) return
    setFlagsSaving(true)
    const { error } = await supabase.from('shops').update({
      coupons_enabled: flagsTarget.coupons_enabled,
      reviews_enabled: flagsTarget.reviews_enabled,
      ordering_enabled: flagsTarget.ordering_enabled,
    }).eq('id', flagsTarget.id)
    if (error) toast.error(error.message)
    else { toast.success('Feature flags updated'); setShops(prev => prev.map(s => s.id === flagsTarget.id ? { ...s, ...flagsTarget } : s)); setFlagsTarget(null) }
    setFlagsSaving(false)
  }

  const saveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault(); setAnnSaving(true)
    const { error } = await supabase.from('platform_announcements').insert({ title: annTitle, body: annBody, is_active: true, created_by: user?.id })
    if (error) { toast.error(error.message.includes('does not exist') ? 'Run migration 021_platform_tables.sql first!' : error.message) }
    else { toast.success('Announcement posted!'); setAnnTitle(''); setAnnBody(''); fetchAnnouncements() }
    setAnnSaving(false)
  }

  const toggleAnnouncement = async (ann: Announcement) => {
    const { error } = await supabase.from('platform_announcements').update({ is_active: !ann.is_active }).eq('id', ann.id)
    if (error) toast.error(error.message)
    else setAnnouncements(prev => prev.map(a => a.id === ann.id ? { ...a, is_active: !ann.is_active } : a))
  }

  const deleteAnnouncement = async (id: string) => {
    await supabase.from('platform_announcements').delete().eq('id', id)
    setAnnouncements(prev => prev.filter(a => a.id !== id))
    toast.success('Deleted')
  }

  const addBlacklist = async (e: React.FormEvent) => {
    e.preventDefault(); setBlSaving(true)
    const { error } = await supabase.from('platform_blacklist').insert({ value: blValue.trim().toLowerCase(), type: blType, reason: blReason || null, created_by: user?.id })
    if (error) { toast.error(error.message.includes('does not exist') ? 'Run migration 021_platform_tables.sql first!' : error.message) }
    else { toast.success('Blacklisted'); setBlValue(''); setBlReason(''); fetchBlacklist() }
    setBlSaving(false)
  }

  const removeBlacklist = async (id: string) => {
    await supabase.from('platform_blacklist').delete().eq('id', id)
    setBlacklist(prev => prev.filter(b => b.id !== id))
    toast.success('Removed')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════

  const CHART_COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899']

  const AreaTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-lg">
        <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">{label}</p>
        <p className="text-sm font-bold text-orange-600 dark:text-orange-400">Revenue : {formatCurrency(payload[0].value)}</p>
      </div>
    )
  }

  const BarTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 shadow-lg">
        <p className="text-xs font-semibold text-gray-900 dark:text-white mb-0.5">{label}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">Revenue : {formatCurrency(payload[0].value)}</p>
      </div>
    )
  }

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'overview', label: 'Overview', icon: BarChart3 },
    { key: 'shops', label: 'Shops', icon: Store },
    { key: 'announcements', label: 'Announcements', icon: Megaphone },
    { key: 'blacklist', label: 'Blacklist', icon: Ban },
    { key: 'commission', label: 'Commission', icon: Percent },
  ]

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 rounded-2xl p-6 text-white shadow-lg border border-orange-400/30 dark:border-slate-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 bg-white/20 dark:bg-blue-500/20 rounded-lg flex items-center justify-center">
                <Shield size={18} className="text-white dark:text-blue-400" />
              </div>
              Platform Manager
            </h2>
            <p className="text-orange-100 dark:text-slate-400 mt-1 text-sm">Complete control over your platform</p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs bg-white/20 dark:bg-green-500/10 border border-white/30 dark:border-green-500/30 text-white dark:text-green-400 px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-green-400 animate-pulse inline-block" />
            Live Data
          </div>
        </div>
      </div>


      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-slate-800/60 p-1.5 rounded-2xl overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0 ${
              tab === key
                ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: Overview ─────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Platform GMV (30d)', value: loading ? '—' : formatCurrency(totalGMV), icon: DollarSign, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30', sub: 'Gross value all shops' },
              { label: 'Active Shops', value: loading ? '—' : String(activeShops), icon: Store, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30', sub: `${shops.length} total shops` },
              { label: 'Orders Today', value: loading ? '—' : String(todayOrders), icon: ShoppingBag, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/30', sub: 'Across all shops' },
              { label: 'Total Customers', value: loading ? '—' : totalCustomers.toLocaleString(), icon: Users, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/30', sub: 'Registered profiles' },
            ].map(({ label, value, icon: Icon, color, bg, sub }) => (
              <Card key={label}>
                <CardContent className="p-5">
                  {loading ? <><Skeleton className="h-8 w-8 rounded-xl mb-3" /><Skeleton className="h-7 w-20 mb-1.5" /><Skeleton className="h-4 w-full" /></> : (
                    <>
                      <div className={`inline-flex p-2.5 rounded-xl ${bg} mb-3`}><Icon size={20} className={color} /></div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-0.5">{label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2"><BarChart3 size={18} className="text-orange-500" /><h3 className="font-bold text-gray-900 dark:text-white">Platform Revenue Trend</h3></div>
                  <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl">
                    {(['7days', '30days'] as const).map(r => (
                      <button key={r} onClick={() => setTrendRange(r)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${trendRange === r ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm' : 'text-gray-600 dark:text-gray-400'}`}>
                        {r === '7days' ? 'Last 7 Days' : 'Last 30 Days'}
                      </button>
                    ))}
                  </div>
                </div>
                {loading ? <Skeleton className="h-52 w-full rounded-xl" /> : (
                  <div className="h-52"><ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <defs><linearGradient id="adminGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.35} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.15)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                      <Tooltip content={<AreaTooltip />} />

                      <Area type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2.5} fill="url(#adminGrad)" />
                    </AreaChart>
                  </ResponsiveContainer></div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-5"><TrendingUp size={18} className="text-blue-500" /><h3 className="font-bold text-gray-900 dark:text-white">Top Shops (30d)</h3></div>
                {loading ? <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
                  : topShops.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
                  : <div className="h-52"><ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topShops} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip content={<BarTooltip />} />

                      <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>{topShops.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Bar>
                    </BarChart>
                  </ResponsiveContainer></div>}
              </CardContent>
            </Card>
          </div>

          {/* Provision New Shop */}
          <Card className="border-blue-100 dark:border-blue-900/50">
            <CardContent className="p-6">
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><Store size={16} className="text-blue-500" /> Provision New Shop</h3>
              <form onSubmit={handleCreateShop} className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[180px]"><Input label="Shop Name" placeholder="Bob's Burgers" value={shopName} onChange={e => setShopName(e.target.value)} required /></div>
                <div className="flex-1 min-w-[180px]"><Input label="URL Slug" placeholder="bobs-burgers" value={shopSlug} onChange={e => setShopSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} required /></div>
                <Button type="submit" className="h-11 bg-blue-600 hover:bg-blue-700" loading={creating}><Plus size={16} /> Create & Invite</Button>
              </form>
              {generatedLink && (
                <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div><p className="text-sm font-bold text-green-900 dark:text-green-100 mb-0.5 flex items-center gap-1.5"><CheckCircle2 size={14} /> Owner Invite Ready!</p><p className="text-xs text-green-700 dark:text-green-400 font-mono break-all">{generatedLink}</p></div>
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(generatedLink); toast.success('Copied!') }} className="flex-shrink-0 bg-white dark:bg-slate-800"><Copy size={14} /> Copy</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── TAB: Shops ────────────────────────────────────────────────────────── */}
      {tab === 'shops' && (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <h3 className="font-bold text-gray-900 dark:text-white text-base">All Shops ({shops.length})</h3>
              <div className="relative max-w-xs w-full">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Search shops..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-8 pr-4 py-2 text-sm bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 dark:text-white placeholder-gray-400" />
              </div>
            </div>
            {loading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left border-b border-gray-100 dark:border-slate-800">
                    {[{ key: 'name' as SortKey, label: 'Shop' }, { key: 'revenue' as SortKey, label: 'Revenue (30d)' }, { key: 'orders' as SortKey, label: 'Orders' }, { key: 'created_at' as SortKey, label: 'Joined' }].map(col => (
                      <th key={col.key} className="pb-3 pr-4"><button onClick={() => handleSort(col.key)} className="flex items-center gap-1 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">{col.label}<ArrowUpDown size={11} className={sortKey === col.key ? 'text-orange-500' : ''} /></button></th>
                    ))}
                    <th className="pb-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Plan</th>
                    <th className="pb-3 text-xs font-semibold text-gray-500 dark:text-gray-400 text-right">Actions</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                    {filteredShops.length === 0 ? <tr><td colSpan={6} className="text-center py-10 text-gray-400">No shops found</td></tr>
                      : filteredShops.map(shop => (
                      <tr key={shop.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center flex-shrink-0"><Store size={14} className="text-slate-400" /></div>
                            <div>
                              <p className="font-semibold text-gray-900 dark:text-white">{shop.name}</p>
                              <p className="text-xs text-gray-400 font-mono">/{shop.slug}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 pr-4 font-semibold text-gray-900 dark:text-white">{formatCurrency(shop.revenue ?? 0)}</td>
                        <td className="py-3.5 pr-4 text-gray-700 dark:text-gray-300">{(shop.orders ?? 0).toLocaleString()}</td>
                        <td className="py-3.5 pr-4 text-gray-500 dark:text-gray-400 text-xs">{fmtDate(shop.created_at)}</td>
                        <td className="py-3.5 pr-4">
                          <div className="relative">
                            <button
                              type="button"
                              disabled={planChanging === shop.id}
                              onClick={(e) => {
                                if (planDropdownOpen === shop.id) {
                                  setPlanDropdownOpen(null); setPlanDropdownPos(null)
                                } else {
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                  setPlanDropdownOpen(shop.id)
                                  setPlanDropdownPos({ top: rect.bottom + 6, left: rect.left })
                                }
                              }}
                              className={`text-xs font-semibold px-2.5 py-1 rounded-full cursor-pointer flex items-center gap-1 ${PLAN_COLORS[shop.plan]} ${planChanging === shop.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              {shop.plan.charAt(0).toUpperCase() + shop.plan.slice(1)}
                              <ChevronDown size={10} className="opacity-60" />
                            </button>
                            {planDropdownOpen === shop.id && planDropdownPos && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={() => { setPlanDropdownOpen(null); setPlanDropdownPos(null) }} />
                                <div
                                  className="fixed bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden min-w-[110px] py-1"
                                  style={{ top: planDropdownPos.top, left: planDropdownPos.left }}
                                >
                                  {PLAN_OPTIONS.map(p => (
                                    <button
                                      key={p}
                                      type="button"
                                      onClick={() => { changePlan(shop.id, p); setPlanDropdownOpen(null); setPlanDropdownPos(null) }}
                                      className={`w-full text-left px-3 py-1.5 text-xs font-semibold transition-colors ${
                                        shop.plan === p
                                          ? 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20'
                                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                                      }`}
                                    >
                                      {p.charAt(0).toUpperCase() + p.slice(1)}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5">
                          <div className="flex items-center justify-end gap-1.5">
                            {shop.status === 'suspended' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-1 rounded-full"><XCircle size={10} /> Suspended</span>
                            ) : shop.is_open ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" /> Active</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded-full">Offline</span>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => setFlagsTarget({ ...shop })} className="text-xs h-7 px-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"><Settings2 size={12} /> Flags</Button>
                            <Button variant="ghost" size="sm" onClick={() => { setSuspendTarget(shop); setSuspendReason('') }} className={`text-xs h-7 px-2 ${shop.status === 'suspended' ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'}`}>
                              {shop.status === 'suspended' ? <><CheckCircle2 size={12} /> Activate</> : <><AlertTriangle size={12} /> Suspend</>}
                            </Button>
                            <a href={`/order/${shop.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-900 dark:hover:text-white px-2 h-7"><ExternalLink size={12} /></a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── TAB: Announcements ────────────────────────────────────────────────── */}
      {tab === 'announcements' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6">
              <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><Send size={16} className="text-orange-500" /> Post New Announcement</h3>
              <form onSubmit={saveAnnouncement} className="space-y-3">
                <Input label="Title" placeholder="e.g. Scheduled maintenance tonight" value={annTitle} onChange={e => setAnnTitle(e.target.value)} required />
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Message</label>
                  <textarea
                    value={annBody} onChange={e => setAnnBody(e.target.value)} required placeholder="Details of the announcement visible to all shop owners..."
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none h-24"
                  />
                </div>
                <Button type="submit" loading={annSaving}><Megaphone size={14} /> Post to All Shops</Button>
              </form>
            </CardContent>
          </Card>

          {annLoading ? <Skeleton className="h-32 rounded-2xl" /> : announcements.length === 0 ? (
            <Card><CardContent className="p-10 text-center text-gray-400 dark:text-gray-500"><Megaphone size={28} className="mx-auto mb-2 opacity-30" /><p className="text-sm">No announcements yet</p><p className="text-xs mt-1">Announcements require the platform_announcements table in Supabase.</p></CardContent></Card>
          ) : announcements.map(ann => (
            <Card key={ann.id} className={!ann.is_active ? 'opacity-60' : ''}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-gray-900 dark:text-white">{ann.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ann.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-slate-700 text-gray-500'}`}>{ann.is_active ? 'Live' : 'Inactive'}</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{ann.body}</p>
                    <p className="text-xs text-gray-400 mt-1.5">{fmtDate(ann.created_at)}</p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => toggleAnnouncement(ann)} className="text-xs h-7 px-2">{ann.is_active ? <ToggleRight size={14} className="text-green-500" /> : <ToggleLeft size={14} className="text-gray-400" />}</Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteAnnouncement(ann.id)} className="text-xs h-7 px-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={13} /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── TAB: Blacklist ────────────────────────────────────────────────────── */}
      {tab === 'blacklist' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6">
              <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><Ban size={16} className="text-red-500" /> Add to Blacklist</h3>
              <form onSubmit={addBlacklist} className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[180px]"><Input label="Phone or Email" placeholder="+91 9876543210" value={blValue} onChange={e => setBlValue(e.target.value)} required /></div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Type</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setBlTypeOpen(o => !o)}
                      className="h-11 pl-3 pr-8 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-400 flex items-center gap-2 cursor-pointer"
                    >
                      {blType === 'phone' ? 'Phone' : 'Email'}
                      <ChevronDown size={14} className="opacity-50" />
                    </button>
                    {blTypeOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setBlTypeOpen(false)} />
                        <div className="absolute top-full left-0 mt-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden min-w-[110px] py-1">
                          {(['phone', 'email'] as const).map(t => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => { setBlType(t); setBlTypeOpen(false) }}
                              className={`w-full text-left px-3 py-2 text-sm font-medium transition-colors ${
                                blType === t
                                  ? 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20'
                                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                              }`}
                            >
                              {t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-[180px]"><Input label="Reason (optional)" placeholder="Fraudulent orders" value={blReason} onChange={e => setBlReason(e.target.value)} /></div>
                <Button type="submit" className="h-11 bg-red-600 hover:bg-red-700" loading={blSaving}><Ban size={14} /> Blacklist</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                <h3 className="font-bold text-gray-900 dark:text-white">Blocked Users ({blacklist.length})</h3>
                <div className="relative max-w-xs w-full">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="Search..." value={blSearch} onChange={e => setBlSearch(e.target.value)} className="w-full pl-8 pr-4 py-2 text-sm bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 dark:text-white placeholder-gray-400" />
                </div>
              </div>
              {blLoading ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
                : blacklist.length === 0 ? <p className="text-center py-8 text-gray-400 text-sm">No blocked users yet. Requires platform_blacklist table.</p>
                : (
                  <div className="space-y-2">
                    {blacklist.filter(b => !blSearch || b.value.includes(blSearch)).map(b => (
                      <div key={b.id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${b.type === 'phone' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'}`}>{b.type}</div>
                          <div>
                            <p className="text-sm font-mono font-medium text-gray-900 dark:text-white">{b.value}</p>
                            {b.reason && <p className="text-xs text-gray-500 dark:text-gray-400">{b.reason}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{fmtDate(b.created_at)}</span>
                          <Button variant="ghost" size="sm" onClick={() => removeBlacklist(b.id)} className="h-7 px-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={13} /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── TAB: Commission ───────────────────────────────────────────────────── */}
      {tab === 'commission' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-6 space-y-5">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><Percent size={16} className="text-orange-500" /> Commission Settings</h3>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Platform Fee (%)</label>
                <div className="flex items-center gap-3">
                  <input type="number" min="0" max="50" step="0.5" value={commRate} onChange={e => setCommRate(e.target.value)} className="w-32 h-11 px-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">% of each order total</span>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">This is for tracking purposes. Connect a payment processor to enforce collection.</p>
              </div>
              <Button loading={commSaving} onClick={async () => { setCommSaving(true); await new Promise(r => setTimeout(r, 500)); toast.success('Commission rate saved (local preview)'); setCommSaving(false) }}>Save Rate</Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-4">
              <h3 className="font-bold text-gray-900 dark:text-white">Estimated Earnings (30d GMV)</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Total Platform GMV</span>
                  <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(totalGMV)}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Commission Rate</span>
                  <span className="font-bold text-gray-900 dark:text-white">{commRate}%</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl">
                  <span className="text-sm font-semibold text-orange-800 dark:text-orange-200">Your Estimated Earnings</span>
                  <span className="text-xl font-bold text-orange-600 dark:text-orange-400">{formatCurrency(commissionEarned)}</span>
                </div>
              </div>
              <div className="space-y-2 pt-3 border-t border-gray-100 dark:border-slate-800">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Per Shop Breakdown</p>
                {shops.slice(0, 8).map(s => (
                  <div key={s.id} className="flex justify-between items-center text-sm py-1">
                    <span className="text-gray-700 dark:text-gray-300 truncate max-w-[180px]">{s.name}</span>
                    <span className="text-gray-500 dark:text-gray-400">{formatCurrency((s.revenue ?? 0) * (parseFloat(commRate) / 100 || 0))}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── SUSPEND MODAL ─────────────────────────────────────────────────────── */}
      <Modal isOpen={!!suspendTarget} onClose={() => { setSuspendTarget(null); setSuspendReason('') }} title={suspendTarget?.status === 'suspended' ? `Reactivate ${suspendTarget?.name}?` : `Suspend ${suspendTarget?.name}?`}>
        <div className="space-y-4">
          {suspendTarget?.status !== 'suspended' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Reason (shown to shop owner)</label>
              <textarea value={suspendReason} onChange={e => setSuspendReason(e.target.value)} placeholder="e.g. Payment overdue, Terms violation..." className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none h-24" />
            </div>
          )}
          {suspendTarget?.status === 'suspended' && <p className="text-sm text-gray-600 dark:text-gray-400">This will restore full access to <strong>{suspendTarget?.name}</strong> and make their menu visible to customers again.</p>}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => { setSuspendTarget(null); setSuspendReason('') }} className="flex-1">Cancel</Button>
            <Button loading={suspending} onClick={confirmSuspend} className={`flex-1 ${suspendTarget?.status === 'suspended' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
              {suspendTarget?.status === 'suspended' ? <><CheckCircle2 size={14} /> Reactivate</> : <><AlertTriangle size={14} /> Suspend</>}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── FEATURE FLAGS MODAL ───────────────────────────────────────────────── */}
      <Modal isOpen={!!flagsTarget} onClose={() => setFlagsTarget(null)} title={`Feature Flags — ${flagsTarget?.name}`}>
        {flagsTarget && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">Control which features are enabled for this shop's customers.</p>
            {[
              { key: 'ordering_enabled' as keyof ShopFull, label: 'Online Ordering', desc: 'Customers can add items to cart and place orders' },
              { key: 'coupons_enabled' as keyof ShopFull, label: 'Coupon Codes', desc: 'Coupon input shown at checkout' },
              { key: 'reviews_enabled' as keyof ShopFull, label: 'Customer Reviews', desc: 'Customers can leave reviews after orders' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
                </div>
                <button
                  onClick={() => setFlagsTarget(prev => prev ? { ...prev, [key]: !prev[key] } : null)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${flagsTarget[key] ? 'bg-orange-500' : 'bg-gray-300 dark:bg-slate-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${flagsTarget[key] ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            ))}
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={() => setFlagsTarget(null)} className="flex-1">Cancel</Button>
              <Button loading={flagsSaving} onClick={saveFeatureFlags} className="flex-1"><Eye size={14} /> Save Flags</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
