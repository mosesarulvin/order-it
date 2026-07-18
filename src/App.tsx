import { Navigate, Route, Routes } from 'react-router-dom'
import { useState, lazy, Suspense } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import DashboardLayout from '@/components/DashboardLayout'
import { SplashScreen } from '@/components/SplashScreen'
import { useShopTheme } from '@/hooks/useShopTheme'
import { useParams, Outlet } from 'react-router-dom'

// Lazy loaded pages
const DashboardHome = lazy(() => import('@/pages/dashboard/DashboardHome'))
const MenuPage = lazy(() => import('@/pages/dashboard/MenuPage'))
const OrdersPage = lazy(() => import('@/pages/dashboard/OrdersPage'))
const KitchenPage = lazy(() => import('@/pages/dashboard/KitchenPage'))
const QRCodePage = lazy(() => import('@/pages/dashboard/QRCodePage'))
const SettingsPage = lazy(() => import('@/pages/dashboard/SettingsPage'))
const StockPage = lazy(() => import('@/pages/dashboard/StockPage'))
const CouponsPage = lazy(() => import('@/pages/dashboard/CouponsPage'))
const ReviewsPage = lazy(() => import('@/pages/dashboard/ReviewsPage'))
const WalkInPage = lazy(() => import('@/pages/dashboard/WalkInPage'))
const CustomersPage = lazy(() => import('@/pages/dashboard/CustomersPage'))
const StaffManagementPage = lazy(() => import('@/pages/dashboard/StaffManagementPage'))
const AdminDashboard = lazy(() => import('@/pages/dashboard/AdminDashboard'))
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'))
const StaffRegisterPage = lazy(() => import('@/pages/auth/StaffRegisterPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'))
const OrderMenuPage = lazy(() => import('@/pages/order/OrderMenuPage'))
const CheckoutPage = lazy(() => import('@/pages/order/CheckoutPage'))
const OrderSuccessPage = lazy(() => import('@/pages/order/OrderSuccessPage'))
const ReviewPage = lazy(() => import('@/pages/order/ReviewPage'))
const ProfilePage = lazy(() => import('@/pages/order/ProfilePage'))
const ProfileDashboardPage = lazy(() => import('@/pages/order/ProfileDashboardPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

function CustomerLayout() {
  const { slug } = useParams<{ slug: string }>()
  const { shopName, logoUrl, brandPrimary, brandSecondary, loading } = useShopTheme(slug)
  const [splashFinished, setSplashFinished] = useState(false)

  // Wait for both network loading to finish AND the minimum splash screen duration
  const isAppReady = !loading && splashFinished

  return (
    <>
      {!splashFinished && (
        <SplashScreen
          shopName={shopName || 'Loading...'}
          logoUrl={logoUrl}
          brandPrimary={brandPrimary}
          brandSecondary={brandSecondary}
          isLoading={loading}
          onComplete={() => setSplashFinished(true)}
        />
      )}
      
      {/* Hide the app completely while splash is visible so we don't get strange DOM jumps */}
      <div className={isAppReady ? 'block' : 'hidden'}>
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </div>
    </>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <AppLoading />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <AppLoading />
  if (user) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function AppLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-orange-200 dark:border-slate-800 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<AppLoading />}>
      <Routes>
        {/* Public order flow wrapped with CustomerLayout for theming and splash */}
        <Route element={<CustomerLayout />}>
          <Route path="/order/:slug" element={<OrderMenuPage />} />
          <Route path="/order/:slug/checkout" element={<CheckoutPage />} />
          <Route path="/order/:slug/success/:orderId" element={<OrderSuccessPage />} />
          <Route path="/order/:slug/review/:orderId" element={<ReviewPage />} />
          <Route path="/order/:slug/profile" element={<ProfilePage />} />
          <Route path="/order/:slug/profile/:profileId" element={<ProfileDashboardPage />} />
        </Route>

        {/* Auth */}
        <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
        <Route path="/register" element={<AuthRoute><RegisterPage /></AuthRoute>} />
        <Route path="/invite/:inviteId" element={<AuthRoute><StaffRegisterPage /></AuthRoute>} />
        <Route path="/forgot-password" element={<AuthRoute><ForgotPasswordPage /></AuthRoute>} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Dashboard */}
        <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout><DashboardHome /></DashboardLayout></ProtectedRoute>} />
        <Route path="/dashboard/menu" element={<ProtectedRoute><DashboardLayout><MenuPage /></DashboardLayout></ProtectedRoute>} />
        <Route path="/dashboard/orders" element={<ProtectedRoute><DashboardLayout><OrdersPage /></DashboardLayout></ProtectedRoute>} />
        <Route path="/dashboard/kitchen" element={<ProtectedRoute><DashboardLayout><KitchenPage /></DashboardLayout></ProtectedRoute>} />
        <Route path="/dashboard/stock" element={<ProtectedRoute><DashboardLayout><StockPage /></DashboardLayout></ProtectedRoute>} />
        <Route path="/dashboard/coupons" element={<ProtectedRoute><DashboardLayout><CouponsPage /></DashboardLayout></ProtectedRoute>} />
        <Route path="/dashboard/reviews" element={<ProtectedRoute><DashboardLayout><ReviewsPage /></DashboardLayout></ProtectedRoute>} />
        <Route path="/dashboard/customers" element={<ProtectedRoute><DashboardLayout><CustomersPage /></DashboardLayout></ProtectedRoute>} />
        <Route path="/dashboard/walkin" element={<ProtectedRoute><DashboardLayout><WalkInPage /></DashboardLayout></ProtectedRoute>} />
        <Route path="/dashboard/qr" element={<ProtectedRoute><DashboardLayout><QRCodePage /></DashboardLayout></ProtectedRoute>} />
        <Route path="/dashboard/settings" element={<ProtectedRoute><DashboardLayout><SettingsPage /></DashboardLayout></ProtectedRoute>} />
        <Route path="/dashboard/staff" element={<ProtectedRoute><DashboardLayout><StaffManagementPage /></DashboardLayout></ProtectedRoute>} />
        
        {/* Super Admin */}
        <Route path="/admin" element={<ProtectedRoute><DashboardLayout><AdminDashboard /></DashboardLayout></ProtectedRoute>} />

        {/* Default */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
