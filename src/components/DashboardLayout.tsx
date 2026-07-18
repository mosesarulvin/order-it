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
  ChevronDown
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
  const navItems = getNavItems(userRole, isSuperAdmin)

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

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <aside
      className={cn(
        'flex flex-col bg-white dark:bg-slate-900 border-r border-gray-100 dark:border-slate-800 h-full',
        mobile ? 'w-72 p-6' : 'w-64 p-5'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center flex-shrink-0">
          <UtensilsCrossed className="text-white" size={20} />
        </div>
        <div>
          <p className="font-bold text-gray-900 leading-none">OrderIt</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[140px]">{shop?.name}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 flex-1">
        {navItems.map(({ icon: Icon, label, to }) => {
          const active = location.pathname === to
          return (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                active
                  ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'
              )}
            >
              <Icon size={18} className={active ? 'text-orange-500 dark:text-orange-400' : 'text-gray-400 dark:text-gray-500'} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Shop open status */}
      <div className="border-t border-gray-100 dark:border-slate-800 pt-4 mt-4 space-y-3">
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-slate-800 rounded-xl">
          <div className={cn('w-2 h-2 rounded-full', shop?.is_open ? 'bg-green-500' : 'bg-gray-400')} />
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
            {shop?.is_open ? 'Shop is open' : 'Shop is closed'}
          </span>
        </div>

        {/* User */}
        <div className="flex items-center gap-3 px-3">
          <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
            {getInitials(shop?.name || user?.email || 'U')}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{shop?.name || 'Your Shop'}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  )

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
          <div className="flex items-center gap-2 ml-auto">
            <ThemeToggle />
          
            <button className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              <Bell size={18} />
            </button>
            <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 flex items-center justify-center text-xs font-bold">
              {getInitials(shop?.name || user?.email || 'U')}
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
