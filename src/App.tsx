import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import DashboardLayout from '@/components/DashboardLayout'
import DashboardHome from '@/pages/dashboard/DashboardHome'
import MenuPage from '@/pages/dashboard/MenuPage'
import OrdersPage from '@/pages/dashboard/OrdersPage'
import KitchenPage from '@/pages/dashboard/KitchenPage'
import QRCodePage from '@/pages/dashboard/QRCodePage'
import SettingsPage from '@/pages/dashboard/SettingsPage'
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'
import OrderMenuPage from '@/pages/order/OrderMenuPage'
import CheckoutPage from '@/pages/order/CheckoutPage'
import OrderSuccessPage from '@/pages/order/OrderSuccessPage'
import NotFoundPage from '@/pages/NotFoundPage'

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Public order flow */}
      <Route path="/order/:slug" element={<OrderMenuPage />} />
      <Route path="/order/:slug/checkout" element={<CheckoutPage />} />
      <Route path="/order/:slug/success/:orderId" element={<OrderSuccessPage />} />

      {/* Auth */}
      <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
      <Route path="/register" element={<AuthRoute><RegisterPage /></AuthRoute>} />
      <Route path="/forgot-password" element={<AuthRoute><ForgotPasswordPage /></AuthRoute>} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Dashboard */}
      <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout><DashboardHome /></DashboardLayout></ProtectedRoute>} />
      <Route path="/dashboard/menu" element={<ProtectedRoute><DashboardLayout><MenuPage /></DashboardLayout></ProtectedRoute>} />
      <Route path="/dashboard/orders" element={<ProtectedRoute><DashboardLayout><OrdersPage /></DashboardLayout></ProtectedRoute>} />
      <Route path="/dashboard/kitchen" element={<ProtectedRoute><DashboardLayout><KitchenPage /></DashboardLayout></ProtectedRoute>} />
      <Route path="/dashboard/qr" element={<ProtectedRoute><DashboardLayout><QRCodePage /></DashboardLayout></ProtectedRoute>} />
      <Route path="/dashboard/settings" element={<ProtectedRoute><DashboardLayout><SettingsPage /></DashboardLayout></ProtectedRoute>} />

      {/* Default */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
