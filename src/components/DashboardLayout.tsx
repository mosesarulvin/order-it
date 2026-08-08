import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  UtensilsCrossed,
  QrCode,
  ClipboardList,
  Settings,
  LogOut,
  Menu,
  X,
  ChefHat,
  Bell,
  Package,
  Tag,
  Star,
  UserPlus,
  Users,
  Shield,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { ThemeToggle } from '@/components/ThemeToggle'
import { supabase } from '@/lib/supabase'
import { getInitials } from '@/lib/utils'
import toast from 'react-hot-toast'

const getNavItems = (role: string | null, isSuperAdmin: boolean) => {
  const allItems = [
    { icon: LayoutDashboard, label: 'Dashboard', to: '/dashboard', roles: ['owner', 'manager'] },
    { icon: UtensilsCrossed, label: 'Menu', to: '/dashboard/menu', roles: ['owner', 'manager'] },
    { icon: ClipboardList, label: 'Orders', to: '/dashboard/orders', roles: ['owner', 'manager', 'staff'] },
    { icon: ChefHat, label: 'Kitchen', to: '/dashboard/kitchen', roles: ['owner', 'manager', 'staff'] },
    { icon: UserPlus, label: 'Walk-in', to: '/dashboard/walkin', roles: ['owner', 'manager', 'staff'] },
    { icon: Package, label: 'Stock', to: '/dashboard/stock', roles: ['owner', 'manager'] },
    { icon: Tag, label: 'Coupons', to: '/dashboard/coupons', roles: ['owner', 'manager'] },
    { icon: Users, label: 'Customers', to: '/dashboard/customers', roles: ['owner', 'manager'] },
    { icon: Star, label: 'Reviews', to: '/dashboard/reviews', roles: ['owner', 'manager'] },
    { icon: QrCode, label: 'QR Code', to: '/dashboard/qr', roles: ['owner', 'manager'] },
    { icon: Users, label: 'Staff', to: '/dashboard/staff', roles: ['owner'] },
    { icon: Settings, label: 'Settings', to: '/dashboard/settings', roles: ['owner'] },
  ]
  
  if (isSuperAdmin) {
    return [
      ...allItems,
      { icon: Shield, label: 'Super Admin', to: '/admin', roles: [] }
    ]
  }
  
  if (!role) return []
  return allItems.filter(i => i.roles.includes(role))
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { shop, user, userRole, isSuperAdmin, signOut, refreshShop } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    return localStorage.getItem('sidebarExpanded') !== 'false'
  })
  const [notifications, setNotifications] = useState<{ id: string; text: string; orderNumber: string }[]>([])
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const navItems = getNavItems(userRole, isSuperAdmin)

  // Global notification listener for new orders
  useEffect(() => {
    if (!shop) return
    const channel = supabase
      .channel(`global-notifications-${shop.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `shop_id=eq.${shop.id}` }, (payload) => {
        playNotification()
        toast('🛎️ New order received!', { icon: '🔔', style: { fontWeight: '600' } })
        
        const order = payload.new as any
        setNotifications(prev => [{ id: order.id, text: 'New order received', orderNumber: order.order_number }, ...prev].slice(0, 50))
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [shop])

  const playNotification = () => {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.4)
    } catch {
      // Audio context not available
    }
  }

  // Auto-schedule: check open/close times and update is_open in DB every minute
  useEffect(() => {
    if (!shop?.auto_schedule_enabled || !shop.auto_open_time || !shop.auto_close_time) return

    const checkSchedule = async () => {
      const now = new Date()
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const shouldBeOpen = hhmm >= shop.auto_open_time! && hhmm < shop.auto_close_time!
      if (shop.is_open !== shouldBeOpen) {
        await supabase.from('shops').update({ is_open: shouldBeOpen }).eq('id', shop.id)
        await refreshShop()
      }
    }

    checkSchedule()
    const interval = setInterval(checkSchedule, 60_000)
    return () => clearInterval(interval)
  }, [shop?.id, shop?.auto_schedule_enabled, shop?.auto_open_time, shop?.auto_close_time, shop?.is_open, refreshShop])

  const handleSignOut = async () => {
    await signOut()
    toast.success('Signed out')
    navigate('/login')
  }

  const toggleSidebar = () => {
    const newState = !sidebarExpanded
    setSidebarExpanded(newState)
    localStorage.setItem('sidebarExpanded', String(newState))
  }

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => {
    const isExpanded = mobile || sidebarExpanded
    
    return (
      <aside
        className={cn(
          'flex flex-col bg-white dark:bg-slate-900 border-r border-gray-100 dark:border-slate-800 h-full transition-all duration-300 relative',
          mobile ? 'w-72 p-6' : (isExpanded ? 'w-64 p-5' : 'w-[80px] p-4 items-center')
        )}
      >
        {/* Logo */}
        <div className={cn("flex items-center mb-8", isExpanded ? "gap-3 justify-between w-full" : "justify-center")}>
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <UtensilsCrossed className="text-white" size={20} />
            </div>
            {isExpanded && (
              <div className="overflow-hidden whitespace-nowrap" style={{ animation: 'fadeIn 0.3s' }}>
                <p className="font-bold text-lg text-gray-900 tracking-tight">OrderIt</p>
              </div>
            )}
          </div>
          
          {!mobile && (
            <button 
              onClick={toggleSidebar} 
              className={cn(
                "rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors z-10", 
                isExpanded ? "p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800" : "absolute -right-3 top-9 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm rounded-full w-6 h-6 flex items-center justify-center"
              )}
            >
              {isExpanded ? <ChevronLeft size={18} /> : <ChevronRight size={14} />}
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 flex-1 w-full">
          {navItems.map(({ icon: Icon, label, to }) => {
            const active = location.pathname === to
            return (
              <Link
                key={to}
                to={to}
                title={!isExpanded ? label : undefined}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center rounded-xl text-sm font-medium transition-all duration-150',
                  isExpanded ? 'gap-3 px-3 py-2.5' : 'justify-center p-3',
                  active
                    ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'
                )}
              >
                <Icon size={18} className={active ? 'text-orange-500 dark:text-orange-400' : 'text-gray-400 dark:text-gray-500'} />
                {isExpanded && <span className="whitespace-nowrap">{label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Shop open status */}
        <div className="border-t border-gray-100 dark:border-slate-800 pt-4 mt-4 w-full">
          <div className={cn("flex items-center bg-gray-50 dark:bg-slate-800 rounded-xl", isExpanded ? "gap-2 px-3 py-2" : "justify-center p-3")} title={shop?.is_open ? 'Shop is open' : 'Shop is closed'}>
            <div className={cn('w-2 h-2 rounded-full flex-shrink-0', shop?.is_open ? 'bg-green-500' : 'bg-gray-400')} />
            {isExpanded && (
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden">
                {shop?.is_open ? 'Shop is open' : 'Shop is closed'}
              </span>
            )}
          </div>
        </div>
      </aside>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-950 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex h-full">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="relative" style={{ animation: 'slideInRight 0.25s ease-out' }}>
            <Sidebar mobile />
          </div>
          <button
            className="absolute top-4 right-4 text-white"
            onClick={() => setMobileOpen(false)}
          >
            <X size={24} />
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 px-4 lg:px-6 h-16 flex items-center justify-between flex-shrink-0">
          <button
            className="lg:hidden p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="hidden lg:block">
            <h1 className="text-sm font-semibold text-gray-900 dark:text-white">
              {navItems.find((n) => n.to === location.pathname)?.label || 'Dashboard'}
            </h1>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <ThemeToggle />
          
            {/* Notifications */}
            <div className="relative">
              <button 
                onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false) }}
                className="relative p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <Bell size={18} />
                {notifications.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 border border-white dark:border-slate-900 rounded-full"></span>
                )}
              </button>
              
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)}></div>
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl shadow-xl z-50 overflow-hidden" style={{ animation: 'fadeIn 0.15s ease-out' }}>
                    <div className="p-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Notifications</h3>
                      {notifications.length > 0 && (
                        <button onClick={() => setNotifications([])} className="text-xs text-brand-accent hover:text-brand-primary font-medium">
                          Clear all
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
                          No new notifications
                        </div>
                      ) : (
                        notifications.map(notif => (
                          <div key={notif.id} className="p-3 border-b border-gray-50 dark:border-slate-800/50 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors group flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand-primary-lighter flex flex-shrink-0 items-center justify-center">
                              <Bell size={14} className="text-brand-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">Order #{notif.orderNumber}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{notif.text}</p>
                              <div className="flex items-center gap-2 mt-2">
                                <button 
                                  onClick={() => {
                                    navigator.clipboard.writeText(notif.orderNumber)
                                    setCopiedId(notif.id)
                                    setTimeout(() => setCopiedId(null), 2000)
                                  }}
                                  className="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center gap-1 font-medium transition-colors"
                                >
                                  {copiedId === notif.id ? <Check size={12} className="text-green-500"/> : <Copy size={12}/>}
                                  {copiedId === notif.id ? 'Copied' : 'Copy ID'}
                                </button>
                                <button onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))} className="text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded-lg font-medium transition-colors">
                                  Clear
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Profile Dropdown */}
            <div className="relative">
              <button 
                onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false) }}
                className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 flex items-center justify-center text-xs font-bold hover:ring-2 ring-orange-200 dark:ring-orange-800 transition-all focus:outline-none cursor-pointer"
              >
                {getInitials(shop?.name || user?.email || 'U')}
              </button>

              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)}></div>
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl shadow-xl z-50 overflow-hidden" style={{ animation: 'fadeIn 0.15s ease-out' }}>
                    <div className="p-5 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/20 flex flex-col items-center text-center">
                      <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 flex items-center justify-center text-xl font-bold mb-3 shadow-sm ring-4 ring-white dark:ring-slate-900">
                        {getInitials(shop?.name || user?.email || 'U')}
                      </div>
                      <p className="font-bold text-gray-900 dark:text-white w-full truncate">{shop?.name || 'Your Shop'}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 w-full truncate mt-1">{user?.email}</p>
                      <div className="mt-3 inline-flex text-[10px] uppercase font-bold tracking-wider bg-brand-primary-lighter text-brand-primary-dark px-2.5 py-1 rounded-md">
                        {userRole || 'Admin'}
                      </div>
                    </div>
                    <div className="p-2">
                      <button 
                        onClick={handleSignOut}
                        className="w-full flex justify-center items-center gap-2 px-2 py-2.5 text-sm text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                      >
                        <LogOut size={16} /> Sign out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-6" style={{ animation: 'fadeIn 0.3s ease-out' }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
