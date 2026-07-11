import { useNavigate } from 'react-router-dom'
import { UtensilsCrossed } from 'lucide-react'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8 text-center">
      <div style={{ animation: 'slideUp 0.4s ease-out' }}>
        <div className="inline-flex items-center justify-center w-20 h-20 bg-orange-100 rounded-3xl mb-6">
          <UtensilsCrossed size={36} className="text-orange-500" />
        </div>
        <h1 className="text-6xl font-extrabold text-gray-900 mb-2">404</h1>
        <p className="text-xl font-semibold text-gray-700 mb-2">Page not found</p>
        <p className="text-gray-400 text-sm mb-8">The link you followed doesn't exist or has expired.</p>
        <button
          onClick={() => navigate('/', { replace: true })}
          className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-semibold rounded-2xl hover:bg-orange-600 active:scale-95 transition-all shadow-lg shadow-orange-200"
        >
          Go home
        </button>
      </div>
    </div>
  )
}
