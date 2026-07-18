import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useShopTheme(slug?: string) {
  const [shopName, setShopName] = useState<string>('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [brandPrimary, setBrandPrimary] = useState<string | null>(null)
  const [brandSecondary, setBrandSecondary] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) {
      setLoading(false)
      return
    }

    const loadTheme = async () => {
      const { data } = await supabase
        .from('shops')
        .select('name, logo_url, brand_primary, brand_secondary, brand_accent')
        .eq('slug', slug)
        .single()

      if (data) {
        setShopName(data.name)
        setLogoUrl(data.logo_url)
        setBrandPrimary(data.brand_primary)
        setBrandSecondary(data.brand_secondary)

        // Inject CSS variables into the root document if custom colors exist
        if (data.brand_primary && data.brand_secondary && data.brand_accent) {
          const root = document.documentElement
          root.style.setProperty('--brand-primary', data.brand_primary)
          root.style.setProperty('--brand-secondary', data.brand_secondary)
          root.style.setProperty('--brand-accent', data.brand_accent)

          // We also need to compute the derived shades roughly using hex to rgba or rely on CSS color-mix which we already do in index.css!
          // Since index.css uses `color-mix(in srgb, var(--brand-primary) 15%, white)`, updating the base variables is enough!
        } else {
          // Reset to defaults
          const root = document.documentElement
          root.style.removeProperty('--brand-primary')
          root.style.removeProperty('--brand-secondary')
          root.style.removeProperty('--brand-accent')
        }
      }
      setLoading(false)
    }

    loadTheme()
  }, [slug])

  return { shopName, logoUrl, brandPrimary, brandSecondary, loading }
}
