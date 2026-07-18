import { useEffect, useState } from 'react'
import { Store } from 'lucide-react'

interface SplashScreenProps {
  shopName: string
  logoUrl?: string | null
  brandPrimary?: string | null
  brandSecondary?: string | null
  onComplete: () => void
  isLoading?: boolean
}

export function SplashScreen({ shopName, logoUrl, brandPrimary, brandSecondary, onComplete, isLoading = false }: SplashScreenProps) {
  const [isFading, setIsFading] = useState(false)

  useEffect(() => {
    if (isLoading) return // Wait until loading is done

    // Show splash for at least 2.5s before fading
    const fadeTimer = setTimeout(() => {
      setIsFading(true)
    }, 2500)

    const completeTimer = setTimeout(() => {
      onComplete()
    }, 3000)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(completeTimer)
    }
  }, [onComplete, isLoading])

  const defaultGradient = 'linear-gradient(to bottom right, #0f172a, #020617)' // Dark neutral gradient while loading
  const customGradient = brandPrimary && brandSecondary
    ? `linear-gradient(to bottom right, ${brandPrimary}, ${brandSecondary})`
    : isLoading ? defaultGradient : 'linear-gradient(to bottom right, #f97316, #f59e0b)' // Fallback orange only if no brand and not loading

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-all duration-1000 ${isFading ? 'opacity-0' : 'opacity-100'}`}
      style={{ background: customGradient }}
    >
      <div className="flex flex-col items-center animate-in slide-in-from-bottom-4 duration-700">
        <div className="w-32 h-32 bg-white rounded-3xl shadow-2xl flex items-center justify-center overflow-hidden mb-6 p-2 transition-all duration-500">
          {isLoading ? (
            <div className="w-10 h-10 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
          ) : logoUrl ? (
            <img src={logoUrl} alt={shopName} className="w-full h-full object-cover rounded-2xl animate-in fade-in duration-500" />
          ) : (
            <Store size={64} className="text-gray-300 animate-in fade-in duration-500" />
          )}
        </div>
        
        <div className="h-10 flex items-center justify-center">
          {isLoading ? (
            <div className="w-48 h-8 bg-white/10 rounded-lg animate-pulse" />
          ) : (
            <h1 className="text-3xl font-bold text-white tracking-tight animate-in fade-in duration-500">{shopName}</h1>
          )}
        </div>
        <div className="mt-8 flex gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2.5 h-2.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2.5 h-2.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}
